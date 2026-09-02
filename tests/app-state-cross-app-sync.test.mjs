import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const appStateFnSource = await readFile(new URL('../netlify/functions/app-state.ts', import.meta.url), 'utf8');
const appJsxSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const databridgeHtmlSource = await readFile(new URL('../public/databridge.html', import.meta.url), 'utf8');
const workspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('1. app-state handler contains complete CORS headers and OPTIONS preflight handling', () => {
  assert.match(appStateFnSource, /"Access-Control-Allow-Origin":\s*"\*"/);
  assert.match(appStateFnSource, /"Access-Control-Allow-Headers"/);
  assert.match(appStateFnSource, /"Access-Control-Allow-Methods":\s*"GET, POST, PUT, DELETE, OPTIONS"/);
  assert.match(appStateFnSource, /req\.method === "OPTIONS"/);
  assert.match(appStateFnSource, /status:\s*204/);
});

test('2. app-state handler safely logs errors in catch blocks using console.error', () => {
  assert.match(appStateFnSource, /console\.error\("\[app-state\] Failed to delete app state:",/);
  assert.match(appStateFnSource, /console\.error\("\[app-state\] Failed to retrieve app state:",/);
  assert.match(appStateFnSource, /console\.error\("\[app-state\] Persistence failed:",/);
});

test('3. app-state SQL queries strictly match existing columns without non-existent id column', () => {
  assert.doesNotMatch(appStateFnSource, /WHERE key = \$1 OR id = \$1/);
  assert.doesNotMatch(appStateFnSource, /WHERE .* id = \$1/);
  assert.match(appStateFnSource, /INSERT INTO app_state \(key, value, updated_at\)/);
  assert.match(appStateFnSource, /DELETE FROM app_state WHERE key = \$1/);
});

test('4. app-state handler supports selected_imo, core_pro_pending_imo, and extracts IMO numbers', () => {
  assert.match(appStateFnSource, /extractImoFromValue/);
  assert.match(appStateFnSource, /selected_imo/);
  assert.match(appStateFnSource, /core_pro_pending_imo/);
});

test('5. Data Bridge dispatches IMO to /api/app-state and cross_app_sync BroadcastChannel on CARGAR DATOS click', () => {
  assert.match(databridgeHtmlSource, /loadDataBridgeSessionPayload/);
  assert.match(databridgeHtmlSource, /\/api\/app-state/);
  assert.match(databridgeHtmlSource, /core_pro_pending_imo/);
  assert.match(databridgeHtmlSource, /cross_app_sync/);
  assert.match(databridgeHtmlSource, /LOAD_IMO/);
});

test('6. Core PRO frontend listens to cross_app_sync BroadcastChannel and logs polling check', () => {
  assert.match(appJsxSource, /console\.log\('\[Core PRO\] Polling check, IMO recibido:', data\)/);
  assert.match(appJsxSource, /new window\.BroadcastChannel\('cross_app_sync'\)/);
  assert.match(appJsxSource, /data\.type === 'LOAD_IMO'/);

  assert.match(workspaceSource, /cross_app_sync/);
  assert.match(workspaceSource, /voyageStore\.getState\(\)\?\.patchSection2Vessel/);

  assert.match(indexHtmlSource, /cross_app_sync/);
});

test('7. Core PRO frontend executes native IMO hydration updating stores and calling vessel fetch without DOM descriptor hacks', () => {
  let manualUpdatedField = '';
  let manualUpdatedVal = '';
  let fetchedImo = '';
  let patchedStoreVessel = null;

  const imoElement = { value: '' };

  const windowMock = {
    ContractRefManager: {
      getActiveContractRef: () => 'RDM/2026-0080',
      setInjectionLock: () => {},
    },
    ContractReference: {
      getActiveContractRef: () => 'RDM/2026-0080',
      setInjectionLock: () => {},
    },
    document: {
      getElementById: (id) => {
        if (id === 'imo' || id === 'vessel-identity-imo') return imoElement;
        return null;
      },
      querySelector: () => null,
    },
    handleManualVesselUpdate: (field, val) => {
      manualUpdatedField = field;
      manualUpdatedVal = val;
    },
    patchSection2Vessel: (vessel) => {
      patchedStoreVessel = vessel;
    },
    fetchVesselSpecs: (imo) => {
      fetchedImo = imo;
      return Promise.resolve(true);
    },
    fetchVesselByImo: (imo) => {
      fetchedImo = imo;
      return Promise.resolve(true);
    },
    GlobalStore: {},
    VoyageStore: {
      getState: () => ({
        patchSection2Vessel: (v) => { patchedStoreVessel = v; },
      }),
    },
  };
  windowMock.window = windowMock;

  const strippedSource = appJsxSource
    .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?/g, '')
    .replace(/import\s+React[^;]*;/g, '')
    .replace(/export\s+default\s+function\s+App[\s\S]*$/, '')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+const/g, 'const');

  const sandbox = {
    window: windowMock,
    document: windowMock.document,
    Event: class MockEvent { constructor(type) { this.type = type; } },
    Object,
    Array,
    Set,
    String,
    JSON,
    setTimeout: (fn) => fn(),
    setInterval: () => 123,
    clearInterval: () => {},
    console,
  };

  vm.runInNewContext(strippedSource, sandbox);
  const result = sandbox.executeImoHydration('9876543');

  assert.equal(result, true);
  assert.equal(imoElement.value, '9876543');
  assert.equal(manualUpdatedField, 'imo');
  assert.equal(manualUpdatedVal, '9876543');
  assert.equal(fetchedImo, '9876543');
  assert.equal(patchedStoreVessel?.imo, '9876543');
  assert.equal(patchedStoreVessel?.imo_number, '9876543');
});
