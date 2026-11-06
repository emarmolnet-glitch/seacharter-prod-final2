import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register(new URL('./jsx-loader.mjs', import.meta.url));

// Mock basic DOM environment before importing modules that reference document
const createMockElement = () => ({
  style: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  setAttribute: () => {},
  removeAttribute: () => {},
  getAttribute: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  appendChild: () => {},
  remove: () => {},
  innerHTML: '',
  value: ''
});

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => createMockElement(),
    body: { innerText: '', appendChild: () => {} }
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    location: { protocol: 'https:', host: 'localhost', href: 'https://localhost/' },
    State: {}
  };
}

const seaAssistantSource = readFileSync(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');

test('1. Desbloqueo y Estabilización del Input POD en sea-assistant-entry.js', () => {
  // Debe existir la función de desbloqueo y estabilización de POD
  assert.match(
    seaAssistantSource,
    /unlockAndStabilizePodInputs/,
    'Debe definir unlockAndStabilizePodInputs'
  );

  // Debe forzar datasets de control manual
  assert.match(seaAssistantSource, /dataset\.manualOverride\s*=\s*["']true["']/);
  assert.match(seaAssistantSource, /dataset\.draftCalcMode\s*=\s*["']manual["']/);
  assert.match(seaAssistantSource, /dataset\.podCalcMode\s*=\s*["']manual["']/);

  // Debe eliminar propiedades de auto-cálculo o congelamiento
  assert.match(seaAssistantSource, /delete\s+[\w.]*dataset\.autoMetodoDescarga/);
  assert.match(seaAssistantSource, /delete\s+[\w.]*dataset\.autoCalculo/);

  // Debe limpiar readOnly y disabled
  assert.match(seaAssistantSource, /\.readOnly\s*=\s*false/);
  assert.match(seaAssistantSource, /\.removeAttribute\(["']readonly["']\)/);
  assert.match(seaAssistantSource, /\.removeAttribute\(["']disabled["']\)/);

  // Debe estar expuesta globalmente en window
  assert.match(seaAssistantSource, /window\.unlockAndStabilizePodInputs\s*=\s*unlockAndStabilizePodInputs/);
});

test('2. Comportamiento funcional en DOM simulado de unlockAndStabilizePodInputs', async () => {
  const { unlockAndStabilizePodInputs } = await import('../src/sea-assistant-entry.js');

  const mockPodInput = {
    id: 'rate-disch',
    value: '0',
    readOnly: true,
    disabled: true,
    attributes: { readonly: 'readonly', disabled: 'disabled' },
    dataset: {
      autoMetodoDescarga: 'bombas_neumaticas',
      autoCalculo: 'true',
      frozen: 'true'
    },
    removeAttribute(attr) {
      delete this.attributes[attr];
      if (attr === 'readonly') this.readOnly = false;
      if (attr === 'disabled') this.disabled = false;
    },
    setAttribute(attr, val) {
      this.attributes[attr] = val;
    }
  };

  const mockLaytimeInput = {
    id: 'gc-laytime-disch-val',
    value: '0',
    readOnly: true,
    attributes: { readonly: 'readonly' },
    dataset: {
      autoMetodoDescarga: 'bombas_neumaticas'
    },
    removeAttribute(attr) {
      delete this.attributes[attr];
      if (attr === 'readonly') this.readOnly = false;
    },
    setAttribute(attr, val) {
      this.attributes[attr] = val;
    }
  };

  const originalDoc = globalThis.document;
  const originalWindow = globalThis.window;

  try {
    globalThis.document = {
      querySelectorAll: (sel) => {
        if (sel.includes('rate-disch')) return [mockPodInput];
        if (sel.includes('gc-laytime-disch-val')) return [mockLaytimeInput];
        return [];
      }
    };

    globalThis.window = {
      State: {},
      setRitmoMode: () => {},
      setRitmoManualIndicator: () => {}
    };

    // Invocar con ritmo explícito (ej. 2000)
    unlockAndStabilizePodInputs(2000);

    // Verificaciones en rate-disch
    assert.equal(mockPodInput.value, '2000');
    assert.equal(mockPodInput.readOnly, false);
    assert.equal(mockPodInput.disabled, false);
    assert.equal(mockPodInput.dataset.manualOverride, 'true');
    assert.equal(mockPodInput.dataset.draftCalcMode, 'manual');
    assert.equal(mockPodInput.dataset.podCalcMode, 'manual');
    assert.equal(mockPodInput.dataset.autoMetodoDescarga, undefined);
    assert.equal(mockPodInput.dataset.autoCalculo, undefined);
    assert.equal(mockPodInput.dataset.frozen, undefined);

    // Verificaciones en State global
    assert.equal(globalThis.window.State.podCalcMode, 'manual');
    assert.equal(globalThis.window.State.ritmoMode_pod, 'manual');
    assert.equal(globalThis.window.State.dischargeRate, 2000);
  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWindow;
  }
});

test('3. Enlace Real de GlobalMadreDrawer con DataBridge madre-chat.js y payload completo', () => {
  // Endpoint Data Bridge
  assert.match(
    globalMadreDrawerSource,
    /export const MADRE_API_ENDPOINT = "https:\/\/calm-shortbread-55bcfc\.netlify\.app\/\.netlify\/functions\/madre-chat"/,
    'Debe apuntar directamente al endpoint de madre-chat en DataBridge'
  );

  // Payload completo del viaje con puertos y ritmos limpios
  assert.match(globalMadreDrawerSource, /payload\.pol\s*=\s*contextoUI\.pol/);
  assert.match(globalMadreDrawerSource, /payload\.pod\s*=\s*contextoUI\.pod/);
  assert.match(globalMadreDrawerSource, /payload\.cargoQty\s*=\s*contextoUI\.cargoQty/);
  assert.match(globalMadreDrawerSource, /payload\.loadRate\s*=\s*contextoUI\.loadRate/);
  assert.match(globalMadreDrawerSource, /payload\.dischargeRate\s*=\s*contextoUI\.dischargeRate/);
  assert.match(globalMadreDrawerSource, /payload\.viaje\s*=/);

  // Procesamiento y formateo de veredicto comercial/operativo unificado
  assert.match(globalMadreDrawerSource, /formatMotherVerdict/);
  assert.match(globalMadreDrawerSource, /data\.veredicto_general/);
  assert.match(globalMadreDrawerSource, /data\.reporte_estrategico/);
  assert.match(globalMadreDrawerSource, /data\.variables_perjudiciales/);
  assert.match(globalMadreDrawerSource, /data\.recomendaciones/);
});

test('4. formatMotherVerdict procesa y pinta el veredicto unificado devuelto por madre-chat.js', async () => {
  const { formatMotherVerdict } = await import('../src/components/GlobalMadreDrawer.jsx');

  const remoteVerdictMock = {
    veredicto_general: '🟡 Favorable con Ajustes Operativos',
    reporte_estrategico: 'Auditoría estratégica consolidada por MADRE y las 13 Hijas.',
    variables_perjudiciales: [
      'Ritmo de descarga de 2000 MT/día ajustado manualmente por el usuario.',
      'Régimen laytime requiere confirmación WWD SHINC.'
    ],
    recomendaciones: [
      {
        accion: 'Formalizar adenda de descarga rápida',
        pro: 'Evita penalizaciones por demurrage',
        contra: 'Requiere validación previa del estibador'
      }
    ]
  };

  const rendered = formatMotherVerdict(remoteVerdictMock);

  assert.match(rendered, /Veredicto Comercial y Operativo: 🟡 Favorable con Ajustes Operativos/);
  assert.match(rendered, /Auditoría estratégica consolidada por MADRE y las 13 Hijas/);
  assert.match(rendered, /Ritmo de descarga de 2000 MT\/día ajustado manualmente/);
  assert.match(rendered, /Formalizar adenda de descarga rápida/);
});
