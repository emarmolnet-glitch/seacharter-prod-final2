import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

try {
  register(new URL('./jsx-loader.mjs', import.meta.url));
} catch (_) {}

const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');

test('1. Inyección de Diccionario: SEACHARTER_DOM_DICTIONARY exacta y exportada', async () => {
  const { SEACHARTER_DOM_DICTIONARY } = await import('../src/components/GlobalMadreDrawer.jsx');

  assert.ok(SEACHARTER_DOM_DICTIONARY, 'SEACHARTER_DOM_DICTIONARY debe estar exportado');
  
  const expectedKeys = [
    'cuartel_general',
    'market_intel',
    'mapa',
    'calculadora',
    'dossiers',
    'decisiones',
    'agenda'
  ];

  for (const key of expectedKeys) {
    assert.ok(SEACHARTER_DOM_DICTIONARY[key], `Clave ${key} debe existir en el diccionario`);
    assert.ok(SEACHARTER_DOM_DICTIONARY[key].contenedor, `Contenedor para ${key} debe existir`);
    assert.ok(Array.isArray(SEACHARTER_DOM_DICTIONARY[key].inputs), `Inputs para ${key} deben ser un array`);
    assert.ok(Array.isArray(SEACHARTER_DOM_DICTIONARY[key].metricas), `Métricas para ${key} deben ser un array`);
  }

  // Verificar contenedores exactos
  assert.equal(SEACHARTER_DOM_DICTIONARY.cuartel_general.contenedor, '#view-ais');
  assert.equal(SEACHARTER_DOM_DICTIONARY.market_intel.contenedor, '#market-intel-dashboard');
  assert.equal(SEACHARTER_DOM_DICTIONARY.mapa.contenedor, '#view-map');
  assert.equal(SEACHARTER_DOM_DICTIONARY.calculadora.contenedor, '#view-estimator');
  assert.equal(SEACHARTER_DOM_DICTIONARY.dossiers.contenedor, '#view-dossiers');
  assert.equal(SEACHARTER_DOM_DICTIONARY.decisiones.contenedor, '#view-decisiones');
  assert.equal(SEACHARTER_DOM_DICTIONARY.agenda.contenedor, '#market-directory-shell');
});

test('2. Actualizar Motor de Captura: capturarDomModuloActivo extrae valores prioritarios y formatea [Métricas Clave]:', async () => {
  const { capturarDomModuloActivo } = await import('../src/components/GlobalMadreDrawer.jsx');

  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      querySelector: (selector) => {
        if (selector === '#res-days-total') return { textContent: '14.50 días', value: '' };
        if (selector === '#res-breakeven') return { textContent: '$28.50/MT', value: '' };
        if (selector === '#port-pol') return { value: 'Rotterdam', textContent: '' };
        if (selector === '#port-pod') return { value: 'Houston', textContent: '' };
        if (selector === '#cargo-qty') return { value: '35000', textContent: '' };
        return null;
      }
    };

    const resultado = capturarDomModuloActivo('calculadora');
    assert.equal(resultado.modulo_actual, 'calculadora');
    assert.equal(resultado.suite, 'SeaCharter Core PRO');
    assert.equal(resultado.contenedor, '#view-estimator');

    // Comprobar que elementos_visibles incluye la sección [Métricas Clave]:
    assert.match(resultado.elementos_visibles, /\[Métricas Clave\]:/);
    assert.match(resultado.elementos_visibles, /#res-days-total:\s*14\.50 días/);
    assert.match(resultado.elementos_visibles, /#res-breakeven:\s*\$28\.50\/MT/);

    // Comprobar inputs prioritarios
    assert.match(resultado.elementos_visibles, /\[Inputs Prioritarios\]:/);
    assert.match(resultado.elementos_visibles, /#port-pol:\s*Rotterdam/);
    assert.match(resultado.elementos_visibles, /#port-pod:\s*Houston/);
    assert.match(resultado.elementos_visibles, /#cargo-qty:\s*35000/);
  } finally {
    globalThis.document = originalDoc;
  }
});

test('3. Etiquetar Payload: El body del fetch a madre-chat envía obligatoriamente "suite": "SeaCharter Core PRO" y "modulo_actual"', () => {
  assert.match(
    globalMadreDrawerSource,
    /suite:\s*["']SeaCharter Core PRO["']/,
    'El payload debe incluirsuite: "SeaCharter Core PRO"'
  );

  assert.match(
    globalMadreDrawerSource,
    /modulo_actual:\s*moduloActualDetectado/,
    'El payload debe incluir modulo_actual'
  );

  assert.match(
    globalMadreDrawerSource,
    /fetch\(MADRE_API_ENDPOINT,\s*\{\s*method:\s*['"]POST['"],[\s\S]*?body:\s*JSON\.stringify\(payload\)/,
    'Debe enviar el payload etiquetado en el fetch a MADRE_API_ENDPOINT'
  );
});

test('4. Detección dinámica de módulos: detectarModuloActual resuelve el módulo activo según el DOM', async () => {
  const { detectarModuloActual } = await import('../src/components/GlobalMadreDrawer.jsx');

  const originalDoc = globalThis.document;
  try {
    // 1. Simular Agenda de Brokers abierta
    globalThis.document = {
      querySelector: (sel) => {
        if (sel === '#market-directory-shell') {
          return {
            hasAttribute: () => false,
            getAttribute: () => 'false',
            style: { display: 'block' }
          };
        }
        return null;
      }
    };
    assert.equal(detectarModuloActual(), 'agenda');

    // 2. Simular Decisiones activa
    globalThis.document = {
      querySelector: (sel) => {
        if (sel === '#view-decisiones') {
          return {
            classList: {
              contains: (cls) => cls === 'active-block'
            }
          };
        }
        return null;
      }
    };
    assert.equal(detectarModuloActual(), 'decisiones');

    // 3. Simular Cuartel General (Radar AIS) activo
    globalThis.document = {
      querySelector: (sel) => {
        if (sel === '#view-ais') {
          return {
            classList: {
              contains: (cls) => cls === 'active-block'
            }
          };
        }
        return null;
      }
    };
    assert.equal(detectarModuloActual(), 'cuartel_general');
  } finally {
    globalThis.document = originalDoc;
  }
});
