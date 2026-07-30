import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const engineSource = await readFile(new URL('../voyage-cost-engine.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function loadEngine() {
  const context = { window: {}, globalThis: {}, console };
  context.globalThis = context;
  vm.runInNewContext(`${engineSource}; globalThis.api = window.SeaCharterVoyageCostEngine;`, context);
  return context.api;
}

const engine = loadEngine();

test('lumpsum is never triggered automatically by small cargo volumes', () => {
  const pmt = engine.resolveFreightBase({
    isLumpsumMode: false,
    targetLumpsumBase: 5000,
    vesselDWT: 3450,
    actualCargoMT: 3000
  });

  assert.equal(pmt.mode, 'PMT');
  assert.equal(pmt.isLumpsumMode, false);
  assert.equal(pmt.freightBaseMT, 3000);
  assert.equal(pmt.finalLumpsumBase, 0);
});

test('lumpsum base is capped by the physical DWT of the vessel', () => {
  const coaster = engine.resolveFreightBase({
    isLumpsumMode: true,
    targetLumpsumBase: 5000,
    vesselDWT: 3450,
    actualCargoMT: 3000
  });

  assert.equal(coaster.mode, 'LUMPSUM');
  assert.equal(coaster.finalLumpsumBase, 3450);
  assert.equal(coaster.freightBaseMT, 3450);
  assert.equal(coaster.dwtCapApplied, true);
  assert.equal(coaster.dwtCapDeltaMT, 1550);

  const handysize = engine.resolveFreightBase({
    isLumpsumMode: true,
    targetLumpsumBase: 5000,
    vesselDWT: 30000,
    actualCargoMT: 3000
  });

  assert.equal(handysize.finalLumpsumBase, 5000);
  assert.equal(handysize.dwtCapApplied, false);
});

test('coaster lumpsum removes the phantom profit produced by the asymmetric base', () => {
  const financials = engine.calculateVoyageFinancials({
    isLumpsumMode: true,
    targetLumpsumBase: 5000,
    vesselDWT: 3450,
    actualCargoMT: 3000,
    ownerRate: 30,
    chartererRate: 35,
    commissionPct: 0
  });

  // Both sides invoice on the DWT-capped base: 3,450 MT.
  assert.equal(financials.freightBaseMT, 3450);
  assert.equal(financials.totalRevenue, 3450 * 35);
  assert.equal(financials.totalCost, 3450 * 30);
  assert.equal(financials.netProfit, 3450 * 5);

  // The legacy bug billed the sale on 5,000 MT and the purchase on 3,000 MT.
  const phantomProfit = (5000 * 35) - (3000 * 30);
  assert.ok(financials.netProfit < phantomProfit);
});

test('commission and extras are applied on top of the symmetric base', () => {
  const financials = engine.calculateVoyageFinancials({
    isLumpsumMode: true,
    targetLumpsumBase: 4000,
    vesselDWT: 10000,
    actualCargoMT: 3000,
    ownerRate: 20,
    chartererRate: 30,
    commissionPct: 2.5,
    revenueExtras: 1000,
    additionalCosts: 500
  });

  const grossRevenue = 4000 * 30;
  const ownerFreightCost = 4000 * 20;
  const commissionCost = grossRevenue * 0.025;

  assert.equal(financials.grossRevenue, grossRevenue);
  assert.equal(financials.ownerFreightCost, ownerFreightCost);
  assert.equal(financials.commissionCost, commissionCost);
  assert.equal(financials.totalRevenue, grossRevenue + 1000);
  assert.equal(financials.totalCost, ownerFreightCost + commissionCost + 500);
  assert.equal(financials.netProfit, (grossRevenue + 1000) - (ownerFreightCost + commissionCost + 500));
});

test('PMT fallback prices both sides on the tonnage actually carried', () => {
  const financials = engine.calculateVoyageFinancials({
    isLumpsumMode: false,
    targetLumpsumBase: 5000,
    vesselDWT: 3450,
    actualCargoMT: 3000,
    ownerRate: 30,
    chartererRate: 35,
    commissionPct: 0
  });

  assert.equal(financials.mode, 'PMT');
  assert.equal(financials.freightBaseMT, 3000);
  assert.equal(financials.totalRevenue, 3000 * 35);
  assert.equal(financials.totalCost, 3000 * 30);
  assert.equal(financials.netProfit, 3000 * 5);
});

test('a zero-rate lumpsum trade produces no revenue, cost or profit', () => {
  const financials = engine.calculateVoyageFinancials({
    isLumpsumMode: true,
    targetLumpsumBase: 5000,
    vesselDWT: 3450,
    actualCargoMT: 0,
    ownerRate: 0,
    chartererRate: 0,
    commissionPct: 2.5
  });

  assert.equal(financials.totalRevenue, 0);
  assert.equal(financials.totalCost, 0);
  assert.equal(financials.netProfit, 0);
});

test('index.html no longer forces lumpsum for cargoes below 5,000 MT', () => {
  assert.equal(indexSource.includes('const typeOfFreightApplied = (cargo > 0 && cargo < 5000)'), false);
  assert.equal(indexSource.includes('const multiplier = typeOfFreightApplied === "Lumpsum" ? 5000 : cargo;'), false);
  assert.equal(indexSource.includes('const grossRevOwner = cargo * freightBuy;'), false);
  assert.match(indexSource, /id="lumpsum-mode"/);
  assert.match(indexSource, /id="lumpsum-base-mt"/);
});

test('the calculator resolves its freight base through the shared policy helper', () => {
  const helperStart = indexSource.indexOf('function resolveVoyageFreightBase(actualCargoMT, vesselDWT, options = {})');
  const helperEnd = indexSource.indexOf('window.resolveVoyageFreightBase = resolveVoyageFreightBase;', helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);

  const elements = new Map([
    ['lumpsum-mode', { checked: true }],
    ['lumpsum-base-mt', { value: '5000' }],
    ['vessel-dwt', { value: '3450' }]
  ]);
  const context = {
    Math,
    Number,
    parseFloat,
    Boolean,
    State: {},
    document: { getElementById: (id) => elements.get(id) || null },
    window: { SeaCharterVoyageCostEngine: engine }
  };
  vm.runInNewContext(`
    const DEFAULT_LUMPSUM_TARGET_BASE_MT = 5000;
    function readLumpsumModeFlag() { return Boolean(document.getElementById('lumpsum-mode').checked); }
    function readTargetLumpsumBase() { return parseFloat(document.getElementById('lumpsum-base-mt').value); }
    ${helperSource}
    globalThis.policy = resolveVoyageFreightBase(3000, document.getElementById('vessel-dwt').value);
  `, context);

  assert.equal(context.policy.mode, 'LUMPSUM');
  assert.equal(context.policy.freightBaseMT, 3450);
  assert.equal(context.policy.dwtCapApplied, true);
});
