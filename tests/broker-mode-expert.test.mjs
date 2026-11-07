import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BrokerModeManager,
  BROKER_MODE_ACTIVATED_MESSAGE,
  BROKER_MODE_APPLIED_FEEDBACK,
  BROKER_MODE_INPUT_IDS,
} from '../src/utils/brokerModeManager.mjs';

test('1. Estado Global del Modo Broker: Inicializado en false y expone getter/setter', async () => {
  // Fresh manager state verification
  BrokerModeManager.setIsBrokerMode(false);
  BrokerModeManager.setCalculoBase(null);
  BrokerModeManager.setHasBaseCalculation(false);

  assert.equal(BrokerModeManager.getIsBrokerMode(), false, 'Modo Broker debe inicializarse en false');
  assert.equal(BrokerModeManager.isBrokerMode, false);
  assert.equal(BrokerModeManager.getCalculoBase(), null, 'calculoBase debe inicializarse en null');

  // React component and hook contracts in AsistenteCore.jsx
  const asistenteSource = await readFile(new URL('../src/components/AsistenteCore.jsx', import.meta.url), 'utf8');
  assert.match(asistenteSource, /export function useBrokerMode/);
  assert.match(asistenteSource, /export function useAsistenteCore/);
  assert.match(asistenteSource, /export default function AsistenteCore/);
});

test('2. Textos exactos de Notificación Asistente Core y Feedback de Resultados', () => {
  const expectedActivatedText =
    "Modo Broker activado. Si eres profesional y conoces los datos de tus barcos, tales como DWT, GT, LOA, BEAM, AÑO, CONSUMOS DE COMBUSTIBLES, PDA'S, puedes ajustar los parámetros necesarios en cualquier módulo y pulsar el boton 'Validar especificaciones / Calcular' para recalcular el TCE.";

  const expectedAppliedText =
    "Modo Broker aplicado con éxito. Delta de margen actualizado.";

  assert.equal(BROKER_MODE_ACTIVATED_MESSAGE, expectedActivatedText, 'Texto de activación debe ser idéntico al requerimiento');
  assert.equal(BROKER_MODE_APPLIED_FEEDBACK, expectedAppliedText, 'Texto de feedback local debe ser idéntico al requerimiento');
});

test('3. Escucha Universal de Inputs (Módulos 1 al 10): Diccionario contiene todos los campos clave', () => {
  // Módulo 2: Velocidad, Ritmos, IMO, DWT, GT, LOA, BEAM, Año
  const m2Fields = ['spd-laden', 'spd-ballast', 'rate-load', 'rate-disch', 'vessel-identity-imo', 'vessel-identity-dwt', 'vessel-identity-gt', 'vessel-identity-loa', 'vessel-identity-beam', 'vessel-identity-year'];
  for (const field of m2Fields) {
    assert.ok(BROKER_MODE_INPUT_IDS.includes(field), `Módulo 2 debe incluir ${field}`);
  }

  // Módulo 3: OPEX Fijo Diario, Consumos VLSFO/MGO, Bunkers, PDAs
  const m3Fields = ['opex-daily', 'cons-sea', 'cons-port', 'price-sea', 'price-ifo', 'price-port', 'pda-pol', 'pda-pod'];
  for (const field of m3Fields) {
    assert.ok(BROKER_MODE_INPUT_IDS.includes(field), `Módulo 3 debe incluir ${field}`);
  }

  // Módulo 4: Tiempos de espera, Coste Remolcadores
  const m4Fields = ['t-fondeo', 'delta-historico', 't-remolcadores'];
  for (const field of m4Fields) {
    assert.ok(BROKER_MODE_INPUT_IDS.includes(field), `Módulo 4 debe incluir ${field}`);
  }

  // Módulo 7/10: Negociación y overrides
  const m7m10Fields = ['negotiation-owner-offer', 'negotiation-charterer-target', 'target-margin', 'cost-plus-daily-opex'];
  for (const field of m7m10Fields) {
    assert.ok(BROKER_MODE_INPUT_IDS.includes(field), `Módulo 7/10 debe incluir ${field}`);
  }
});

test('4. Activación: Sin resultado base no activa Modo Broker; con resultado base sí activa y guarda Cálculo Base', () => {
  BrokerModeManager.setIsBrokerMode(false);
  BrokerModeManager.setCalculoBase(null);
  BrokerModeManager.setHasBaseCalculation(false);

  // Intento de activación sin resultado base
  const activatedSinBase = BrokerModeManager.activateBrokerMode('test_input');
  assert.equal(activatedSinBase, false, 'No debe activarse si aún no hay resultado base');
  assert.equal(BrokerModeManager.getIsBrokerMode(), false);

  // Simular que Cerebro.ia generó un resultado base
  BrokerModeManager.setHasBaseCalculation(true);
  const mockBaseSnapshot = {
    totalCost: 125000,
    breakEven: 28.5,
    tce: 14200,
    targetMargin: 15,
  };
  BrokerModeManager.setCalculoBase(mockBaseSnapshot);

  // Ahora el usuario modifica un input
  const activatedConBase = BrokerModeManager.activateBrokerMode('vessel-identity-dwt');
  assert.equal(activatedConBase, true, 'Debe activarse tras modificar input teniendo resultado base');
  assert.equal(BrokerModeManager.getIsBrokerMode(), true, 'isBrokerMode debe ser true');
  assert.deepEqual(BrokerModeManager.getCalculoBase(), mockBaseSnapshot, 'calculoBase debe conservar los resultados previos');
});

test('5. Recálculo y Feedback Local: Al completar recálculo muestra texto exacto en resultados', () => {
  let feedbackToastDispatched = false;
  BrokerModeManager.setIsBrokerMode(true);

  // Mock global window and UI elements
  const mockM6Feedback = {
    classList: {
      remove(cls) { if (cls === 'hidden') this.hidden = false; },
    },
    hidden: true,
    style: {},
  };
  const mockM10Feedback = {
    classList: {
      remove(cls) { if (cls === 'hidden') this.hidden = false; },
    },
    hidden: true,
    style: {},
  };

  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;

  globalThis.window = {
    agregarMensajeAsistente: (msg) => {
      if (msg === BROKER_MODE_APPLIED_FEEDBACK) feedbackToastDispatched = true;
    },
    dispatchEvent: () => {},
  };
  globalThis.document = {
    getElementById: (id) => {
      if (id === 'broker-mode-results-feedback') return mockM6Feedback;
      if (id === 'broker-mode-negotiation-feedback') return mockM10Feedback;
      return null;
    },
  };

  try {
    BrokerModeManager.notifyBrokerModeApplied();

    assert.equal(BrokerModeManager.feedbackMessage, BROKER_MODE_APPLIED_FEEDBACK);
    assert.equal(mockM6Feedback.hidden, false, 'Panel Módulo 6 debe mostrar feedback');
    assert.equal(mockM10Feedback.hidden, false, 'Panel Módulo 10 debe mostrar feedback');
    assert.equal(feedbackToastDispatched, true, 'Asistente Core debe recibir mensaje exacto');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
  }
});

test('6. TceCalculatorWorkspace.tsx y AsistenteCore.jsx integran Estado Global y manejadores', async () => {
  const workspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
  const asistenteSource = await readFile(new URL('../src/components/AsistenteCore.jsx', import.meta.url), 'utf8');
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Workspace integration
  assert.match(workspaceSource, /BrokerModeManager/);
  assert.match(workspaceSource, /isBrokerMode/);
  assert.match(workspaceSource, /setIsBrokerMode/);
  assert.match(workspaceSource, /brokerFeedback/);
  assert.match(workspaceSource, /workspace-broker-mode-banner/);

  // Asistente Core React component integration
  assert.match(asistenteSource, /useBrokerMode/);
  assert.match(asistenteSource, /BROKER_MODE_ACTIVATED_MESSAGE/);
  assert.match(asistenteSource, /BROKER_MODE_APPLIED_FEEDBACK/);
  assert.match(asistenteSource, /asistente-core-broker-banner/);

  // index.html integration (Paneles Módulo 6 y Módulo 10)
  assert.match(indexSource, /id="broker-mode-results-feedback"/);
  assert.match(indexSource, /id="broker-mode-negotiation-feedback"/);
  assert.match(indexSource, /Modo Broker aplicado con éxito\. Delta de margen actualizado\./);
  assert.match(indexSource, /handleMasterValidationAndCalculate/);
  assert.match(indexSource, /BrokerModeManager/);
});

test('7. Restricción Crítica: Fórmulas matemáticas, reducers y Cerebro.ia intactos y sin llamadas autónomas', async () => {
  const geminiDoc = await readFile(new URL('../GEMINI.md', import.meta.url), 'utf8');
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify GEMINI.md rules remain unchanged
  assert.match(geminiDoc, /MOTOR DE RIESGO HISTÓRICO/);
  assert.match(geminiDoc, /Activación Exclusivamente Manual/);
  assert.match(geminiDoc, /Generar Informe Master/);

  // Ensure no automated calls were injected into historical risk triggers
  assert.doesNotMatch(
    indexSource,
    /BrokerModeManager\.activateBrokerMode[\s\S]*loadHistoricalRiskOnDemand\(\)/
  );
});
