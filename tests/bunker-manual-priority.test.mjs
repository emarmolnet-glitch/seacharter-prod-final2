import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = indexSource.indexOf('const HISTORICAL_BUNKER_FALLBACK_USD');
const end = indexSource.indexOf('function readBunkerIndexCache', start);
const bunkerSource = indexSource.slice(start, end);

function fakeInput(value, userOverride = false) {
  return {
    value: String(value),
    dataset: { userOverride: userOverride ? 'true' : 'false' }
  };
}

function buildHarness() {
  const elements = new Map([
    ['price-sea', fakeInput(720, true)],
    ['price-ifo', fakeInput(0, false)],
    ['price-port', fakeInput(830, false)],
    ['port-pol', { value: 'Santos (BR)' }],
    ['port-pod', { value: 'Shanghai (CN)' }],
    ['label-price-vlsfo', { textContent: '' }],
    ['label-price-ifo', { textContent: '' }],
    ['label-price-mgo', { textContent: '' }]
  ]);
  let engineCalls = 0;
  const context = {
    window: {},
    document: { getElementById: (id) => elements.get(id) || null },
    runEngine() { engineCalls += 1; },
    console,
    Date,
    Intl
  };
  vm.runInNewContext(`${bunkerSource}\nglobalThis.bunkerApi = { markManualBunkerPrice, resolveSafeBunkerPrice, applyBunkerIndexData, ensureSafeBunkerPrices };`, context);
  return { context, elements, getEngineCalls: () => engineCalls };
}

test('manual bunker prices override backend values and zero prices receive the historical fallback', () => {
  const { context, elements, getEngineCalls } = buildHarness();
  const applied = context.bunkerApi.applyBunkerIndexData({ vlsfo: 500, ifo380: 0, mgo: 900 });

  assert.equal(elements.get('price-sea').value, '720.00');
  assert.equal(elements.get('price-ifo').value, '600.00');
  assert.equal(elements.get('price-port').value, '900.00');
  assert.equal(applied.vlsfo, 720);
  assert.equal(applied.ifo380, 600);
  assert.equal(applied.mgo, 900);
  assert.equal(applied.fallbackUsed, true);
  assert.equal(getEngineCalls(), 1);
});

test('emergency normalization preserves positive form values and only replaces zeros', () => {
  const { context, elements, getEngineCalls } = buildHarness();
  context.bunkerApi.ensureSafeBunkerPrices({ deferEngine: true });

  assert.equal(elements.get('price-sea').value, '720.00');
  assert.equal(elements.get('price-ifo').value, '600.00');
  assert.equal(elements.get('price-port').value, '830.00');
  assert.equal(getEngineCalls(), 0);
});

test('regional cache injects POL hub prices while preserving manual overrides', () => {
  const { context, elements } = buildHarness();
  const applied = context.bunkerApi.applyBunkerIndexData({
    regionalPrices: {
      Americas: { vlsfo: 610, ifo380: 520, mgo: 790 },
      APAC: { vlsfo: 640, ifo380: 550, mgo: 810 },
      World: { vlsfo: 600, ifo380: 500, mgo: 780 }
    }
  });

  assert.equal(elements.get('price-sea').value, '720.00');
  assert.equal(elements.get('price-ifo').value, '520.00');
  assert.equal(elements.get('price-port').value, '790.00');
  assert.equal(elements.get('label-price-vlsfo').textContent, 'PRECIO VLSFO (AMERICAS)');
  assert.equal(applied.selectedRegion, 'Americas');
  assert.equal(applied.isInterregional, true);
});

test('zero backend payloads no longer use the blocking invalid-price exception', () => {
  const normalizeStart = indexSource.indexOf('function normalizeBunkerMarketPayload');
  const normalizeEnd = indexSource.indexOf('async function autoFillBunkers', normalizeStart);
  const normalizeSource = indexSource.slice(normalizeStart, normalizeEnd);
  assert.doesNotMatch(normalizeSource, /La respuesta de Bunkerindex no contiene precios válidos/);
  assert.match(normalizeSource, /HISTORICAL_BUNKER_FALLBACK_USD/);
});

test('Bunkerindex unavailable is rendered as an amber warning, never a red blocker', () => {
  const warningStart = indexSource.indexOf('function updateBunkerMarketSyncStatus');
  const warningEnd = indexSource.indexOf('function markManualBunkerPrice', warningStart);
  const warningSource = indexSource.slice(warningStart, warningEnd);
  assert.match(warningSource, /text-amber-400/);
  assert.match(warningSource, /text-amber-300/);
  assert.match(warningSource, /Bunkerindex no disponible/);
  assert.doesNotMatch(warningSource, /label\.classList\.add\('text-red-400'\)/);
});
