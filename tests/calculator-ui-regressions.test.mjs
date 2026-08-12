import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const balticSpotSource = await readFile(new URL('../src/step7-baltic-spot-reference.js', import.meta.url), 'utf8');
const tceWorkspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
const marketMapperSource = await readFile(new URL('../src/utils/marketMapper.js', import.meta.url), 'utf8');
const { getIndexForVessel } = await import(`data:text/javascript,${encodeURIComponent(marketMapperSource)}`);

test('renumbers right column panel headers sequentially (6 to 10)', () => {
  assert.match(indexSource, /6\. RESUMEN DE OPERACIÓN/);
  assert.match(indexSource, /7\. ANÁLISIS DE FLETES/);
  assert.match(indexSource, /8\. NEGOCIACIÓN COMERCIAL/);
  assert.match(indexSource, /9\. MATRIZ DE RIESGO/);
  assert.match(indexSource, /10\. SIMULADOR DE VIAJE COMBINADO \(SHADOW ESTIMATOR\)/);
  assert.match(indexSource, /10\. SIMULADOR DE NEGOCIACIÓN Y CONTRAOFERTAS/);
});

test('defines explicit light mode styling for select options and input dates', () => {
  assert.match(indexSource, /select option \{\s*background-color: #ffffff !important;\s*color: #0f172a !important;\s*\}/);
  assert.match(indexSource, /input\[type="date"\], select, datalist \{\s*color-scheme: light !important;\s*\}/);
});

test('uses compact matching header controls', () => {
  assert.match(indexSource, /id="new-estimation-btn"[\s\S]*?class="tools-dropdown-trigger flex items-center justify-center"/);
  assert.doesNotMatch(indexSource, /<span>\+ Nueva Estimación<\/span>/);
});

test('renders Baltic spot data and feeds the inverse TCE calculator', () => {
  assert.match(indexSource, /Baltic Exchange Spot Reference/);
  assert.match(indexSource, /src="\.\/src\/step7-baltic-spot-reference\.js\?v=20260812-spot-fetch-fix"/);
  assert.match(balticSpotSource, /fetch\(`\/api\/spot-rates\?vesselCategory=\$\{encodeURIComponent\(vesselType\)\}`/);
  assert.match(balticSpotSource, /getIndexForVessel\(vesselType\)/);
  assert.match(balticSpotSource, /value\.spot_rate/);
  assert.match(balticSpotSource, /console\.log\('\[Step7 Baltic\] \/api\/spot-rates raw response:'/);
  assert.match(balticSpotSource, /console\.log\('\[Step7 Baltic\] filtered index:'/);
  assert.match(balticSpotSource, /refreshBalticSpotReference\(\{ force: true \}\);/);
  assert.match(balticSpotSource, /No aplica índice global - Modelo Cost-Plus activo/);
  assert.match(indexSource, /id="baltic-spot-variation"/);
  assert.match(indexSource, /handleFetchBalticSpotTce/);
  assert.match(indexSource, /new URLSearchParams\(\{ vesselCategory \}\)/);
  assert.match(indexSource, /\/api\/spot-rates\?\$\{query\.toString\(\)\}/);
  assert.match(indexSource, /const spotReference = payload\?\.spotReference/);
  assert.match(indexSource, /const tceTarget = payload\?\.tceTarget/);
  assert.match(indexSource, /applyFfaTceMarketData\(tceTarget\)/);
  assert.match(indexSource, /const marketRate = Number\(entry\?\.rate_usd\)/);
  assert.doesNotMatch(indexSource, /const marketRate = Number\(entry\?\.spot_rate\)/);
  assert.match(tceWorkspaceSource, /tceTarget: Number\(tceTarget\.rate_usd\)/);
  assert.doesNotMatch(indexSource, /function getBalticSpotIndexForPricingCategory|function getFfaVesselClassForPricingCategory/);
  assert.doesNotMatch(tceWorkspaceSource, /function getBalticSpotIndexForVesselCategory|function getFfaVesselClassForCategory/);
  assert.doesNotMatch(indexSource, /btn-fetch-fearnleys-tce|handleFetchFearnleysTce|fearnleysMarketData/);
  assert.doesNotMatch(tceWorkspaceSource, /\/api\/fearnleys-tce|fearnleysMarketData/);
});

test('maps vessel classes to their Baltic indices', () => {
  assert.equal(getIndexForVessel('Capesize / Suezmax'), 'BCI');
  assert.equal(getIndexForVessel('PANAMAX / Kamsarmax / LR1'), 'BPI');
  assert.equal(getIndexForVessel('Supramax / MR'), 'BSI');
  assert.equal(getIndexForVessel('handysize / small tanker'), 'BHSI');
  assert.deepEqual(getIndexForVessel('Coaster'), {
    type: 'REGIONAL',
    label: 'Mercado Regional / Short Sea (Cost-Plus)',
  });
  assert.deepEqual(getIndexForVessel('Mini-Bulker'), {
    type: 'REGIONAL',
    label: 'Mercado Regional / Short Sea (Cost-Plus)',
  });
  assert.deepEqual(getIndexForVessel('MINIBULKER multipurpose'), {
    type: 'REGIONAL',
    label: 'Mercado Regional / Short Sea (Cost-Plus)',
  });
  assert.equal(getIndexForVessel('Ultramax'), 'BSI');
});

test('loads BHSI immediately and renders the spot_rate response field', async () => {
  const elements = new Map([
    ['vessel-badge', { textContent: 'Handysize / Small Tanker' }],
    ['port-pol', { value: 'Buenos Aires', addEventListener() {} }],
    ['port-pod', { value: 'Monopoli', addEventListener() {} }],
    ['baltic-spot-index', { textContent: '', className: '' }],
    ['baltic-spot-value', { textContent: '', className: '' }],
    ['baltic-spot-variation', { textContent: '', className: '', hidden: false }],
    ['baltic-spot-status', { textContent: '', className: '' }],
  ]);
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalConsoleLog = console.log;
  let fetchCalls = 0;

  try {
    globalThis.window = {
      addEventListener() {},
      clearTimeout,
      setTimeout,
    };
    globalThis.document = {
      readyState: 'complete',
      getElementById: (id) => elements.get(id) || null,
    };
    globalThis.MutationObserver = class {
      observe() {}
    };
    globalThis.fetch = async (url) => {
      fetchCalls += 1;
      assert.equal(url, '/api/spot-rates?vesselCategory=Handysize%20%2F%20Small%20Tanker');
      return {
        ok: true,
        json: async () => ({
          data: [{ name: 'Handysize', spot_rate: 2302, variation: 1.25 }],
        }),
      };
    };
    console.log = () => {};

    const executableSource = balticSpotSource.replace(
      /^import[^\n]+\n/,
      marketMapperSource.replace('export function', 'function'),
    );
    await import(`data:text/javascript,${encodeURIComponent(executableSource)}#${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(fetchCalls, 1);
    assert.equal(elements.get('baltic-spot-index').textContent, 'BHSI');
    assert.equal(elements.get('baltic-spot-value').textContent, '$2,302');
    assert.equal(elements.get('baltic-spot-variation').textContent, '+1.25%');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.MutationObserver = originalMutationObserver;
    console.log = originalConsoleLog;
  }
});
