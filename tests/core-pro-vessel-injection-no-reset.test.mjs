import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const contractRefSource = await readFile(new URL('../contract-reference.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const voyageStoreSource = await readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8');
const tceWorkspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');

test('ContractRefManager includes setInjectionLock and prevents new ID creation when locked', () => {
  const session = new Map([['active_contract_ref', 'RDM/2026-0080']]);
  const local = new Map();
  const location = new URL('https://app.test/');

  const windowMock = {
    BroadcastChannel: class { postMessage() {} close() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    crypto: { getRandomValues(v) { v.fill(1); return v; } },
    addEventListener() {},
    dispatchEvent() {},
    history: { state: null, replaceState() {} },
    location,
    sessionStorage: {
      getItem: (k) => session.get(k) || null,
      setItem: (k, v) => session.set(k, String(v)),
      removeItem: (k) => session.delete(k),
    },
    localStorage: {
      getItem: (k) => local.get(k) || null,
      setItem: (k, v) => local.set(k, String(v)),
      removeItem: (k) => local.delete(k),
    },
  };

  vm.runInNewContext(contractRefSource, {
    window: windowMock,
    URL,
    URLSearchParams,
    Uint32Array,
    Date,
    Math,
    CustomEvent: windowMock.CustomEvent,
  });

  const api = windowMock.ContractRefManager;
  assert.equal(api.getActiveContractRef(), 'RDM/2026-0080');

  // When lock is active (during external injection), createNewReference must not generate a new sequence
  api.setInjectionLock(true);
  assert.equal(api.isInjectionLocked(), true);
  assert.equal(api.createNewReference(), 'RDM/2026-0080', 'Must cancel new ID generation when injection locked');

  // When lock is released, createNewReference generates the next sequence
  api.setInjectionLock(false);
  assert.equal(api.isInjectionLocked(), false);
  assert.equal(api.createNewReference(), 'RDM/2026-0081');
});

test('voyageStore patchSection2Vessel updates ONLY Section 2 fields without touching cargo or ports', () => {
  assert.match(voyageStoreSource, /patchSection2Vessel:\s*\(vesselData\s*=\s*\{\}\)\s*=>/);

  // Mock Zustand createStore & subscribeWithSelector in VM
  let state = {};
  const set = (updater) => {
    const partial = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...partial };
  };
  const get = () => state;

  const sandbox = {
    createStore: (fn) => {
      state = fn(set, get);
      return {
        getState: () => state,
        setState: set,
      };
    },
    subscribeWithSelector: (fn) => fn,
    EMPTY_DRAFT: {
      pol: null,
      pod: null,
      laycan: { laydays: '', cancelling: '' },
      cargo: { description: '', quantityMt: 0 },
      loadingRate: 0,
      dischargeRate: 0,
      dwt: 0,
      methodPOL: '',
      methodPOD: '',
      ratePOL: 0,
      ratePOD: 0,
      ballastDistanceNm: null,
      ballastDistanceSource: 'calculator-manual',
      lastreCoordinates: [],
      weather: null,
      vessel: null,
      updatedAt: null,
      lastSource: 'init',
    },
    cleanText: (v) => String(v ?? '').trim(),
    cleanNumber: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    cleanNonNegativeNumber: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    },
    cleanMethod: (v) => String(v ?? '').trim(),
    Date,
  };

  const strippedSource = voyageStoreSource
    .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?/g, '')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+const\s+voyageStore\s*=/g, 'const voyageStore =')
    .replace(/export\s+const\s+useVoyageStore\s*=\s*voyageStore;?/g, '');

  vm.runInNewContext(`${strippedSource}\nsandboxOutput = voyageStore;`, sandbox);
  const store = sandbox.sandboxOutput;

  // 1. Setup active operational draft with cargo and ports
  store.getState().applyNlpScenario({
    pol: 'Rotterdam',
    pod: 'Singapore',
    cargo_type: 'Cement Clinker',
    cargo_qty: 45000,
    laydays: '2026-09-10',
    cancelling: '2026-09-20',
  });

  const stateBefore = store.getState().draft;
  assert.equal(stateBefore.pol?.name, 'Rotterdam');
  assert.equal(stateBefore.pod?.name, 'Singapore');
  assert.equal(stateBefore.cargo.quantityMt, 45000);
  assert.equal(stateBefore.cargo.description, 'Cement Clinker');
  assert.equal(stateBefore.laycan.laydays, '2026-09-10');
  assert.equal(stateBefore.laycan.cancelling, '2026-09-20');

  // 2. Perform hot vessel injection from Data Bridge
  store.getState().patchSection2Vessel({
    name: 'MV ATLANTIC TRADER',
    imo: '9123456',
    dwt: 55000,
    loa: 189.9,
    beam: 32.2,
    speedKnots: 13.5,
    flag: 'Panama',
  });

  const stateAfter = store.getState().draft;

  // Verify Section 2 fields are patched
  assert.equal(stateAfter.vessel?.name, 'MV ATLANTIC TRADER');
  assert.equal(stateAfter.vessel?.imo, '9123456');
  assert.equal(stateAfter.vessel?.dwt, 55000);
  assert.equal(stateAfter.vessel?.loa, 189.9);
  assert.equal(stateAfter.vessel?.beam, 32.2);
  assert.equal(stateAfter.vessel?.speedKnots, 13.5);
  assert.equal(stateAfter.dwt, 55000);

  // Verify Section 1 (Cargo, Ports, Laycan) are completely preserved and untouched
  assert.equal(stateAfter.pol?.name, 'Rotterdam');
  assert.equal(stateAfter.pod?.name, 'Singapore');
  assert.equal(stateAfter.cargo.quantityMt, 45000);
  assert.equal(stateAfter.cargo.description, 'Cement Clinker');
  assert.equal(stateAfter.laycan.laydays, '2026-09-10');
  assert.equal(stateAfter.laycan.cancelling, '2026-09-20');
});

test('TceCalculatorWorkspace defines injection interceptor useEffect and imports voyageStore', () => {
  assert.match(tceWorkspaceSource, /import\s*\{\s*voyageStore\s*\}\s*from\s*'\.\/src\/stores\/voyage-store\.js'/);
  assert.match(tceWorkspaceSource, /handleVesselInjection/);
  assert.match(tceWorkspaceSource, /SEACHARTER_DATABRIDGE_LOAD_DATA/);
  assert.match(tceWorkspaceSource, /core_bridge_sync/);
  assert.match(tceWorkspaceSource, /patchSection2Vessel/);
  assert.match(tceWorkspaceSource, /setInjectionLock/);
});

test('index.html defines patchSection2Vessel, SeaCharterStore.patchSection2Vessel, and injection guards', () => {
  assert.match(indexSource, /function patchSection2Vessel\(vesselData/);
  assert.match(indexSource, /window\.patchSection2Vessel = patchSection2Vessel/);
  assert.match(indexSource, /patchSection2Vessel\(vesselData = \{\}\)/);
  assert.match(indexSource, /referenceManager\?\.setInjectionLock\?\.\(true\)/);
});
