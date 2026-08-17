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

test('publishes ETS cost globally and recalculates Cost-Plus from carbon price input', () => {
  assert.match(indexSource, /emissionsCO2: 0, euCarbonPrice: 80, etsRouteFactor: 0, etsCost: 0, etsCostPMT: 0/);
  assert.match(indexSource, /oninput="handleCarbonPriceInput\(this\.value\)"/);
  assert.match(indexSource, /SeaCharterStore\.set\(\{[\s\S]*?emissionsCO2,[\s\S]*?euCarbonPrice: carbonPrice,[\s\S]*?etsCost,[\s\S]*?\}, \{ force: true, source: 'carbon-price-input' \}\)/);
  assert.match(indexSource, /scheduleDebouncedCalculation\(0\)/);
  assert.match(indexSource, /voyageCostWithoutEts > 0 \? voyageCostWithoutEts \+ etsCost : 0/);
  assert.match(tceWorkspaceSource, /syncedVoyageCostWithoutEts > 0 \? syncedVoyageCostWithoutEts \+ syncedEtsCost : 0/);
});

test('uses compact matching header controls', () => {
  assert.match(indexSource, /id="new-estimation-btn"[\s\S]*?class="tools-dropdown-trigger flex items-center justify-center"/);
  assert.doesNotMatch(indexSource, /<span>\+ Nueva Estimación<\/span>/);
});

test('renders Market Intel data and feeds the inverse TCE calculator', () => {
  assert.match(indexSource, /Market Intel · Dry Bulk/);
  assert.match(indexSource, /🔄 Forzar Sincronización/);
  assert.match(indexSource, /✏️ Editar Manualmente/);
  assert.match(indexSource, /data-market-field="capesize_tc"/);
  assert.match(indexSource, /data-market-field="panamax_tc"/);
  assert.match(indexSource, /data-market-field="supramax_tc"/);
  assert.match(indexSource, /data-market-field="handysize_tc"/);
  assert.match(indexSource, /data-market-field="bdi_index"/);
  assert.match(indexSource, /fetch\('\/api\/market\/latest'/);
  assert.match(indexSource, /fetch\('\/api\/market\/sync-fearnleys', \{ method: 'POST' \}\)/);
  assert.match(indexSource, /fetch\('\/api\/market\/manual-update'/);
  assert.match(indexSource, /body: JSON\.stringify\(manualValues\)/);
  assert.match(indexSource, /MARKET_TCE_FIELD_BY_CLASS/);
  assert.match(indexSource, /applyMarketLatestToInverseTce\(record, vesselCategory\)/);
  assert.match(indexSource, /record\?\.bdi_index/);
  assert.match(indexSource, /1Y T\/C - \$\{sourceMeta\.dataLabel\} - \$\{recordDate\}/);
  assert.doesNotMatch(indexSource, /fetch\(`\/api\/spot-rates\?\$\{query\.toString\(\)\}`/);

  assert.match(indexSource, /src="\.\/src\/step7-baltic-spot-reference\.js\?v=20260817-market-latest"/);
  assert.match(balticSpotSource, /fetch\('\/api\/market\/latest'/);
  assert.match(balticSpotSource, /BDIINDEX/);
  assert.match(balticSpotSource, /findMarketEntryByIndex\(payload, 'BDI'\)/);
  assert.doesNotMatch(balticSpotSource, /\/api\/spot-rates/);

  assert.match(tceWorkspaceSource, /fetch\('\/api\/market\/latest'/);
  assert.match(tceWorkspaceSource, /getMarketLatestTceField\(vesselCategory\)/);
  assert.match(tceWorkspaceSource, /bdiIndexElement\.textContent = 'BDI'/);
  assert.doesNotMatch(tceWorkspaceSource, /\/api\/spot-rates/);
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

test('loads BDI immediately from the market latest response', async () => {
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
      assert.equal(url, '/api/market/latest');
      return {
        ok: true,
        json: async () => ({ bdi_index: 2302 }),
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
    assert.equal(elements.get('baltic-spot-index').textContent, 'BDI');
    assert.equal(elements.get('baltic-spot-value').textContent, '2,302');
    assert.equal(elements.get('baltic-spot-variation').textContent, 'Variación N/D');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.MutationObserver = originalMutationObserver;
    console.log = originalConsoleLog;
  }
});
