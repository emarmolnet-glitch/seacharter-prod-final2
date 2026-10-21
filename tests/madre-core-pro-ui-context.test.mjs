import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

try {
  register(new URL('./jsx-loader.mjs', import.meta.url));
} catch (_) {}

const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. Core PRO UI Context Injection: getCoreProUIContext helper exists and is exported', () => {
  // Must declare getCoreProUIContext function
  assert.match(
    globalMadreDrawerSource,
    /function getCoreProUIContext\(\)/,
    'GlobalMadreDrawer must define getCoreProUIContext helper function'
  );

  // Must export getCoreProUIContext
  assert.match(
    globalMadreDrawerSource,
    /export function getCoreProUIContext/,
    'GlobalMadreDrawer must export getCoreProUIContext'
  );

  // App.jsx must re-export getCoreProUIContext
  assert.match(
    appSource,
    /export \{[^}]*getCoreProUIContext[^}]*\}/,
    'App.jsx must export getCoreProUIContext'
  );
});

test('2. Core PRO UI Context Builder: extracts mgo_price and totalPortfolio selectors', () => {
  // Check DOM selector for MGO fuel price
  assert.match(
    globalMadreDrawerSource,
    /document\.querySelector\(['"]\[data-fuel="mgo"\], #mgo-price, #bunker-mgo, \.price-mgo, \[data-metric="mgo"\]['"]\)/,
    'Must query MGO price using specified selectors'
  );

  // Check DOM selector for portfolio count
  assert.match(
    globalMadreDrawerSource,
    /document\.querySelector\(['"]#portfolio-count, \[data-portfolio-count\], #fleet-summary-count['"]\)/,
    'Must query portfolio count using specified selectors'
  );

  // Check structure and default fields
  assert.match(
    globalMadreDrawerSource,
    /current_module:\s*["']core_pro["']/,
    'Must include current_module="core_pro"'
  );
  assert.match(
    globalMadreDrawerSource,
    /vista_activa:\s*["']Core PRO - Panel y Mapa Operativo["']/,
    'Must include vista_activa="Core PRO - Panel y Mapa Operativo"'
  );
  assert.match(
    globalMadreDrawerSource,
    /parametros_activos:\s*params/,
    'Must include parametros_activos: params'
  );
});

test('3. Chat Payload Injection: attaches contexto_ui: getCoreProUIContext() to MADRE chat dispatch', () => {
  // Check payload contains contexto_ui
  assert.match(
    globalMadreDrawerSource,
    /contexto_ui:\s*getCoreProUIContext\(\)/,
    'Outgoing payload to MADRE must include contexto_ui: getCoreProUIContext()'
  );

  // Check fetch uses MADRE_API_ENDPOINT
  assert.match(
    globalMadreDrawerSource,
    /fetch\(MADRE_API_ENDPOINT,\s*\{/,
    'Must maintain fetch call to MADRE_API_ENDPOINT'
  );

  // Check existing context structure preserved
  assert.match(
    globalMadreDrawerSource,
    /origin:\s*["']SeaCharter Core PRO["']/,
    'Must preserve origin in context'
  );
});

test('4. Functional execution: getCoreProUIContext behaves accurately with simulated DOM and empty state', async () => {
  const { getCoreProUIContext } = await import('../src/components/GlobalMadreDrawer.jsx');

  // Test with no elements present
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      querySelector: () => null
    };

    const emptyResult = getCoreProUIContext();
    assert.equal(emptyResult.current_module, 'core_pro');
    assert.equal(emptyResult.vista_activa, 'Core PRO - Panel y Mapa Operativo');
    assert.deepEqual(emptyResult.parametros_activos, {});

    // Test with active MGO price and portfolio count elements
    globalThis.document = {
      querySelector: (selector) => {
        if (selector.includes('data-fuel="mgo"')) {
          return { textContent: '$685.50 / MT', value: '' };
        }
        if (selector.includes('#portfolio-count')) {
          return { textContent: '24 vessels', value: '' };
        }
        return null;
      }
    };

    const populatedResult = getCoreProUIContext();
    assert.equal(populatedResult.current_module, 'core_pro');
    assert.equal(populatedResult.vista_activa, 'Core PRO - Panel y Mapa Operativo');
    assert.equal(populatedResult.parametros_activos.mgo_price, 685.5);
    assert.equal(populatedResult.parametros_activos.totalPortfolio, 24);
  } finally {
    globalThis.document = originalDoc;
  }
});
