import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { generateRandomProjectRef } from '../src/utils/projectRef.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dossiers = readFileSync(new URL('../dossiers.js', import.meta.url), 'utf8');
const between = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

function calculatorHarness() {
  const controls = new Map(['rate-load', 'rate-disch', 'freight-sell', 'quick-ref', 'recapInput', 'pda-pol'].map(id => [id, {
    id, tagName: 'INPUT', type: 'number', value: '999', defaultValue: '', dataset: { manualOverride: 'true', marginSynced: 'true' }
  }]));
  const State = { cargo: 500, freightSell: 99, emissionsCO2: 5000, orphanCost: 777, marketBenchmark: { rate: 77 }, activeReference: 'OLD' };
  const commits = [];
  const context = {
    structuredClone, clearTimeout, console, State,
    INITIAL_CALCULATOR_STATE: { cargo: 0, freightSell: 0, emissionsCO2: 0, smartAdjustments: {} },
    SESSION_FIELD_METADATA_KEYS: ['manualOverride', 'marginSynced', 'basePda', 'operationalPdaBase', 'operationalPdaTotal'],
    CALCULATED_STATE_STORAGE_KEY: 'calculated', pendingCalculationTimer: null, isRestoringAuditSession: false,
    costPlusStrategy: 'market', costPlusMarginType: 'fixed', isManualBalticSpotOverride: true,
    isInverseTceSyncEnabled: false, lastBalticSpotPricingCategory: 'OLD', balticSpotTceRequest: {},
    marketSpeedRequestSequence: 1, lastMarketSpeedVesselClass: 'OLD', marketSpeedCache: new Map([['old', 55]]),
    learnedPortRiskHistory: new Map([['old', 1]]), navigationStrategy: 'fast', navigationStrategyMode: 'manual',
    DEFAULT_LUMPSUM_TARGET_BASE_MT: 30000,
    document: { getElementById: id => controls.get(id) || null, querySelectorAll: () => [...controls.values()] },
    setInputValue(id, value) { if (controls.has(id)) controls.get(id).value = String(value); },
    clearCalculatorLocalStorage() {}, populateCargoProducts() {}, setCalculatorWaitingState() {},
    resetGeneratedModuleState() {}, readRouteStateFromCalculator: () => ({}), syncGlobalStateToForms() {},
    calculateAdjustedEtaAndDays() {}, syncActiveContractReference(ref) { State.activeReference = ref; },
    CustomEvent: class {},
  };
  context.window = {
    State, calculatorSessionEpoch: 0, dossierSnapshotLocked: false,
    sessionStorage: { removeItem() {} }, GlobalStore: {}, dispatchEvent() {},
    ContractRefManager: { createNewReference: () => generateRandomProjectRef() },
  };
  context.SeaCharterStore = {
    depth: 0,
    batch(fn) { this.depth++; try { return fn(); } finally { if (--this.depth === 0) commits.push(structuredClone(State)); } },
    set(patch) { Object.assign(State, patch); }
  };
  vm.createContext(context);
  vm.runInContext(between('        function resetGlobalState(', '        function resetTotalEstimation('), context);
  return { context, State, controls, commits };
}

test('reset removes unknown properties, detached nested objects and DOM overrides in one batch', () => {
  const { context, State, controls, commits } = calculatorHarness();
  const identity = State;
  context.resetGlobalState({ silent: true, reference: 'RDM/2026-B', restoring: true });
  assert.equal(State, identity, 'subscribers keep the canonical object identity');
  assert.equal(State.orphanCost, undefined);
  assert.equal(State.marketBenchmark, undefined);
  assert.equal(State.emissionsCO2, 0);
  assert.equal(State.freightSell, 0);
  assert.equal(controls.get('freight-sell').dataset.marginSynced, undefined);
  assert.equal(controls.get('rate-load').dataset.manualOverride, undefined);
  assert.equal(context.marketSpeedCache.size, 0);
  assert.equal(context.window.GlobalStore.calculatedState, null);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].activeReference, 'RDM/2026-B');
  assert.equal(context.isRestoringAuditSession, false);
});

test('new estimations always reset and generate a fresh reference, including rapid calls', () => {
  const { context, State } = calculatorHarness();
  const first = context.resetGlobalState();
  State.orphan = { old: true };
  State.freightSell = 45.13;
  const second = context.resetGlobalState();
  assert.notEqual(first, second);
  assert.equal(State.orphan, undefined);
  assert.equal(State.freightSell, 0);
  assert.equal(State.activeProjectRef, second);
  assert.equal(context.window.activeProjectRef, second);
  assert.equal(context.window.calculatorSessionEpoch, 2);
});

test('reopening B produces identical State after unrelated sessions A and C', async () => {
  const { context, State, controls } = calculatorHarness();
  Object.assign(context, {
    isValidAuditSessionPayload: () => true,
    restoreSessionFields(fields) { for (const [id, value] of Object.entries(fields)) if (controls.has(id)) controls.get(id).value = value; },
    restoreCalculatorSessionState(saved) { Object.assign(State, structuredClone(saved)); },
    restoreSessionFieldMetadata() {}, restoreHolisticWorkspaceState() {}, refreshImportedAuditSession() {},
    runEngine() { State.breakEven = State.cargo > 0 ? (1000 + State.emissionsCO2) / State.cargo : 0; },
    switchTab() {}, showDocPreview() {},
  });
  vm.runInContext(between('        async function applyAuditSessionPayload(', '        window.buildAuditSessionPayload'), context);
  const saved = { calculatorState: { activeReference: 'B', cargo: 100, freightSell: 33.77 }, fields: {} };
  await context.applyAuditSessionPayload(saved, { reference: 'B' });
  const first = structuredClone(State);
  State.emissionsCO2 = 99999; State.marketBenchmark = { rate: 100 }; State.unknown = 'C';
  controls.get('freight-sell').dataset.marginSynced = 'true';
  await context.applyAuditSessionPayload(saved, { reference: 'B' });
  assert.deepEqual(structuredClone(State), first);
  assert.equal(State.unknown, undefined);
  assert.equal(State.breakEven, 10);
  assert.equal(saved.calculatorState.breakEven, undefined, 'restoration must not mutate the stored payload');
});

test('a late open response cannot replace a newer dossier or a new estimation', async () => {
  let resolveOld;
  let epoch = 0;
  const applied = [];
  const context = {
    request: id => id === '/A' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ dossier: { id: 'B', reference: 'B', sessionPayload: {} } }),
    state: {}, document: { body: { dataset: {} } },
    window: { get calculatorSessionEpoch() { return epoch; }, applyAuditSessionPayload: async (_, opts) => applied.push(opts.reference) },
  };
  vm.createContext(context);
  vm.runInContext(dossiers.slice(dossiers.indexOf('    let openRequestVersion'), dossiers.indexOf('    async function updateStatus')), context);
  const old = context.openDossier('A');
  await context.openDossier('B');
  resolveOld({ dossier: { id: 'A', reference: 'A', sessionPayload: {} } });
  await old;
  assert.deepEqual(applied, ['B']);
  const stale = context.openDossier('A');
  epoch++;
  resolveOld({ dossier: { id: 'A', reference: 'A', sessionPayload: {} } });
  await stale;
  assert.deepEqual(applied, ['B']);
});

test('cryptographic references remain distinct across 10000 creations and use the current year', () => {
  const refs = new Set(Array.from({ length: 10000 }, () => generateRandomProjectRef()));
  assert.equal(refs.size, 10000);
  for (const ref of refs) assert.match(ref, new RegExp(`^RDM/${new Date().getUTCFullYear()}-[0-9A-F-]{36}$`));
});

test('classic and module generators agree on the UUID reference format', () => {
  const source = readFileSync(new URL('../contract-reference.js', import.meta.url), 'utf8');
  const start = source.indexOf('    function generateVoyageRef()');
  const end = source.indexOf('    const generateReference', start);
  const context = { globalObject: { crypto: webcrypto } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const refs = new Set(Array.from({ length: 1000 }, () => context.generateVoyageRef()));
  assert.equal(refs.size, 1000);
  assert.match(context.generateVoyageRef(), /^RDM\/\d{4}-[0-9A-F-]{36}$/);
});

test('legacy restoration derives vessel class from its own DWT instead of a previous badge', () => {
  const { context, State, controls } = calculatorHarness();
  controls.set('vessel-badge', { innerText: 'Coaster', dataset: {} });
  Object.assign(context, {
    setImportedFieldValue: (el, value) => { el.value = value; },
    restoreCargoSelection() {}, DEFAULT_OWNER_MARGIN_PERCENT: 15, DEFAULT_CHARTERER_MARGIN_PERCENT: 10,
    resolveEuCarbonPrice: value => value || 80,
    detectVesselSegment: dwt => ({ segment: dwt >= 15000 ? 'Handysize' : 'Coaster' }),
  });
  vm.runInContext(between('        function restoreCalculatorSessionState(', '        function refreshImportedAuditSession('), context);
  context.resetGlobalState({ silent: true, reference: 'B', restoring: true });
  context.restoreCalculatorSessionState({ dwt: 15000 });
  assert.equal(State.class, 'Handysize');
  assert.equal(controls.get('vessel-badge').innerText, 'Handysize');
});

test('field metadata round-trip preserves manual rates and PDA bases without keeping previous flags', () => {
  const { context, controls } = calculatorHarness();
  vm.runInContext(between('        function getSessionFieldMetadata()', '        function getSessionFieldSnapshot()'), context);
  controls.get('rate-load').dataset.manualOverride = 'true';
  controls.get('pda-pol').dataset.operationalPdaBase = '20000';
  controls.get('pda-pol').dataset.operationalPdaTotal = '22000';
  const metadata = structuredClone(context.getSessionFieldMetadata());
  context.resetGlobalState({ silent: true, reference: 'B', restoring: true });
  context.restoreSessionFieldMetadata(metadata);
  assert.equal(controls.get('pda-pol').dataset.operationalPdaBase, '20000');
  assert.equal(controls.get('pda-pol').dataset.operationalPdaTotal, '22000');
  assert.equal(controls.get('rate-load').dataset.manualOverride, 'true');
  context.resetGlobalState({ silent: true, reference: 'C', restoring: true });
  context.restoreSessionFieldMetadata(undefined, { 'rate-load': 1000 });
  assert.equal(controls.get('pda-pol').dataset.operationalPdaBase, undefined);
  assert.equal(controls.get('rate-load').dataset.manualOverride, 'true');
  assert.equal(controls.get('freight-sell').dataset.marginSynced, undefined);
});

test('background market hydration cannot modify the saved financial inputs of an opened dossier', () => {
  const { context, State } = calculatorHarness();
  vm.runInContext(between('        function applyBunkerIndexData(', '        window.applyBunkerIndexData'), context);
  context.window.dossierSnapshotLocked = true;
  State.priceSea = 600;
  const result = context.applyBunkerIndexData({ vlsfo: 999 }, { forceMarket: true });
  assert.equal(result.snapshotLocked, true);
  assert.equal(State.priceSea, 600);
});
