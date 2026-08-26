import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const balticSpotSource = await readFile(new URL('../src/step7-baltic-spot-reference.js', import.meta.url), 'utf8');
const marketHydrationSource = await readFile(new URL('../src/market-intelligence-hydration.js', import.meta.url), 'utf8');
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

test('renders the unified Data Bridge snapshot and feeds the inverse TCE calculator', () => {
  assert.match(indexSource, /Market Intel · Dry Bulk/);
  assert.match(indexSource, /🔄 Forzar Sincronización/);
  assert.match(indexSource, /✏️ Editar Manualmente/);
  assert.match(indexSource, /data-market-field="capesize_tc"/);
  assert.match(indexSource, /data-market-field="panamax_tc"/);
  assert.match(indexSource, /data-market-field="supramax_tc"/);
  assert.match(indexSource, /data-market-field="handysize_tc"/);
  assert.match(indexSource, /data-market-field="bdi_index"/);
  assert.match(indexSource, /src="\.\/src\/market-intelligence-hydration\.js\?v=20260826-visual-mirror"/);
  assert.match(marketHydrationSource, /MARKET_DATA_ENDPOINT = '\/api\/get-market-data'/);
  assert.match(marketHydrationSource, /tceSpotByClass/);
  assert.match(marketHydrationSource, /theoreticalSpotTce/);
  assert.match(marketHydrationSource, /spreadUsd/);
  assert.match(marketHydrationSource, /spreadPct/);
  assert.doesNotMatch(indexSource, /fetch\('\/api\/market\/latest'/);
  assert.match(indexSource, /fetch\('\/api\/market\/sync-fearnleys', \{ method: 'POST' \}\)/);
  assert.match(indexSource, /fetch\('\/api\/market\/manual-update'/);
  assert.match(indexSource, /body: JSON\.stringify\(manualValues\)/);
  assert.match(indexSource, /MARKET_TCE_FIELD_BY_CLASS/);
  assert.match(indexSource, /applyMarketLatestToInverseTce\(record, vesselCategory\)/);
  assert.match(indexSource, /classSnapshot\?\.theoreticalSpotTce/);
  assert.match(indexSource, /TCE Spot Teórico - \$\{sourceLabel\} - \$\{recordDate\}/);
  assert.doesNotMatch(indexSource, /fetch\(`\/api\/spot-rates\?\$\{query\.toString\(\)\}`/);

  assert.match(indexSource, /src="\.\/src\/step7-baltic-spot-reference\.js\?v=20260826-visual-mirror"/);
  assert.match(indexSource, /id="tce-spot-theoretical-value"/);
  assert.match(indexSource, /id="baltic-spot-updated"/);
  assert.match(balticSpotSource, /hydration\.subscribe/);
  assert.match(balticSpotSource, /tceSpot\?\.theoreticalSpotTce/);
  assert.match(balticSpotSource, /tceSpot\?\.spreadUsd/);
  assert.doesNotMatch(balticSpotSource, /fetch\(/);
  assert.doesNotMatch(balticSpotSource, /marketRatio|bunkerDrag|dailyScrubberAdvantage|consumption/);
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

test('renders BDI and final TCE Spot from the shared hydration snapshot', async () => {
  const elements = new Map([
    ['vessel-badge', { textContent: 'Handysize / Small Tanker' }],
    ['port-pol', { value: 'Buenos Aires', addEventListener() {} }],
    ['port-pod', { value: 'Monopoli', addEventListener() {} }],
    ['baltic-spot-index', { textContent: '', className: '' }],
    ['baltic-spot-value', { textContent: '', className: '' }],
    ['baltic-spot-variation', { textContent: '', className: '', hidden: false }],
    ['baltic-spot-status', { textContent: '', className: '' }],
    ['baltic-spot-updated', { textContent: '', className: '' }],
    ['tce-spot-theoretical-class', { textContent: '', className: '' }],
    ['tce-spot-theoretical-value', { textContent: '', className: '' }],
    ['tce-spot-theoretical-updated', { textContent: '', className: '' }],
    ['tce-spot-theoretical-fuel', { textContent: '', className: '' }],
    ['tce-spot-theoretical-spread', { textContent: '', className: '' }],
    ['tce-spot-theoretical-status', { textContent: '', className: '' }],
  ]);
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;

  try {
    globalThis.window = {
      addEventListener() {},
      MarketIntelligenceHydration: {
        subscribe(callback) {
          callback({
            status: 'ready',
            snapshot: {
              status: 'ready',
              bdi: { value: 2302, changeValue: -18, changePct: -0.78, updatedAt: '2026-08-26T09:45:00Z', status: 'LIVE' },
              tceSpotByClass: {
                Handysize: {
                  theoreticalSpotTce: 18712,
                  spreadUsd: 412,
                  spreadPct: 2.25,
                  fuelLabel: 'VLSFO Standard',
                  algorithmLabel: 'ALGORITMO LIVE VLSFO',
                  updatedAt: '2026-08-26T09:42:00Z',
                },
              },
            },
          });
        },
        refresh() {},
      },
    };
    globalThis.document = {
      readyState: 'complete',
      getElementById: (id) => elements.get(id) || null,
    };
    globalThis.MutationObserver = class {
      observe() {}
    };
    await import(`data:text/javascript,${encodeURIComponent(balticSpotSource)}#${Date.now()}`);

    assert.equal(elements.get('baltic-spot-index').textContent, 'BDI');
    assert.equal(elements.get('baltic-spot-value').textContent, '2,302');
    assert.equal(elements.get('baltic-spot-variation').textContent, '-18 pts · -0.78%');
    assert.equal(elements.get('tce-spot-theoretical-value').textContent, '$18,712');
    assert.equal(elements.get('tce-spot-theoretical-spread').textContent, 'Brecha: +$412 · +2.25%');
    assert.equal(elements.get('tce-spot-theoretical-status').textContent, 'ALGORITMO LIVE VLSFO');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});
