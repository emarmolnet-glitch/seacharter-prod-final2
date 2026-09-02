import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const workspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appStateFunctionSource = await readFile(new URL('../netlify/functions/app-state.ts', import.meta.url), 'utf8');

function createSandbox(extra = {}) {
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
      getElementById: () => ({ value: '' }),
    },
    sessionStorage: {
      getItem: () => 'RDM/2026-0080',
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    fetch: () => Promise.resolve({ ok: true, json: async () => ({}) }),
    handleManualVesselUpdate: () => {},
    patchSection2Vessel: () => {},
    fetchVesselByImo: () => Promise.resolve(true),
    ...extra,
  };
  windowMock.window = windowMock;

  const sandbox = {
    window: windowMock,
    document: windowMock.document,
    sessionStorage: windowMock.sessionStorage,
    localStorage: windowMock.localStorage,
    fetch: windowMock.fetch,
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

  const strippedSource = appSource
    .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?/g, '')
    .replace(/import\s+React[^;]*;/g, '')
    .replace(/export\s+default\s+function\s+App[\s\S]*$/, '')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+const/g, 'const');

  vm.runInNewContext(strippedSource, sandbox);
  return sandbox;
}

test('1. Core PRO App.jsx defines usePendingImoSync with listeners for storage, core_pro_channel, and seacharter_sync_channel', () => {
  assert.match(appSource, /export function usePendingImoSync/);
  assert.match(appSource, /BroadcastChannel\(['"]core_pro_channel['"]\)/);
  assert.match(appSource, /BroadcastChannel\(['"]seacharter_sync_channel['"]\)/);
  assert.match(appSource, /addEventListener\(['"]storage['"]/);
  assert.match(appSource, /core_pro_pending_imo/);
});

test('1. TceCalculatorWorkspace and index.html register storage and broadcast channel listeners for core_pro_channel and seacharter_sync_channel', () => {
  assert.match(workspaceSource, /core_pro_channel/);
  assert.match(workspaceSource, /seacharter_sync_channel/);
  assert.match(workspaceSource, /core_pro_pending_imo/);
  assert.match(workspaceSource, /addEventListener\(['"]storage['"]/);

  assert.match(indexSource, /core_pro_channel/);
  assert.match(indexSource, /seacharter_sync_channel/);
  assert.match(indexSource, /core_pro_pending_imo/);
  assert.match(indexSource, /hydrateCalculatorVesselFromPendingImo/);
});

test('2. extractImoAndReference & matchesActiveSession correctly validate session target and extract IMO', () => {
  const sandbox = createSandbox();
  const { extractImoAndReference, matchesActiveSession } = sandbox;

  // Direct string IMO
  const res1 = extractImoAndReference('9433947');
  assert.equal(res1.imo, '9433947');
  assert.equal(res1.reference, '');

  // JSON string
  const res2 = extractImoAndReference(JSON.stringify({ imo: '9512345', target_session_id: 'RDM/2026-0099' }));
  assert.equal(res2.imo, '9512345');
  assert.equal(res2.reference, 'RDM/2026-0099');

  // Object with reference
  const res3 = extractImoAndReference({ imo: '9876543', reference: 'RDM/2026-1122' });
  assert.equal(res3.imo, '9876543');
  assert.equal(res3.reference, 'RDM/2026-1122');

  // Object with core_pro_pending_imo
  const res4 = extractImoAndReference({ core_pro_pending_imo: '9123456', target_session_id: 'RDM/2026-3344' });
  assert.equal(res4.imo, '9123456');
  assert.equal(res4.reference, 'RDM/2026-3344');

  // Matches active session
  assert.equal(matchesActiveSession('RDM/2026-0080'), true);
  assert.equal(matchesActiveSession(''), true); // No target constraint matches active session
  assert.equal(matchesActiveSession('RDM/2026-9999'), false);
});

test('3. executeImoHydration injects IMO into Section 2 state and triggers fetchVesselByImo', () => {
  let manualUpdatedField = '';
  let manualUpdatedVal = '';
  let patchedData = null;
  let fetchedImo = '';
  const mockElement = { value: '' };

  const sandbox = createSandbox({
    document: {
      getElementById: (id) => (id === 'vessel-identity-imo' ? mockElement : null),
    },
    handleManualVesselUpdate: (field, val) => {
      manualUpdatedField = field;
      manualUpdatedVal = val;
    },
    patchSection2Vessel: (v) => {
      patchedData = v;
    },
    fetchVesselByImo: (imo) => {
      fetchedImo = imo;
      return Promise.resolve(true);
    },
    ContractRefManager: {
      getActiveContractRef: () => 'RDM/2026-0080',
      setInjectionLock: () => {},
    },
  });

  const result = sandbox.executeImoHydration('9433947');

  assert.equal(result, true);
  assert.equal(mockElement.value, '9433947');
  assert.equal(manualUpdatedField, 'imo');
  assert.equal(manualUpdatedVal, '9433947');
  assert.equal(patchedData?.imo, '9433947');
  assert.equal(fetchedImo, '9433947');
});

test('4. Session target mismatch ignores candidate to prevent cross-session pollution', () => {
  let hydrated = false;

  const sandbox = createSandbox({
    ContractRefManager: {
      getActiveContractRef: () => 'RDM/2026-0080',
      setInjectionLock: () => {},
    },
    fetchVesselByImo: () => {
      hydrated = true;
    },
  });

  const extracted = sandbox.extractImoAndReference({ imo: '9999999', target_session_id: 'RDM/2026-9999' });
  const matches = sandbox.matchesActiveSession(extracted.reference);
  if (matches) {
    sandbox.executeImoHydration(extracted.imo);
  }

  assert.equal(matches, false);
  assert.equal(hydrated, false, 'Must not hydrate when target session does not match active session');
});

test('4. Neon app-state Netlify Function supports DELETE method for key cleanup and exact key GET lookup', () => {
  assert.match(appStateFunctionSource, /req\.method === ["']DELETE["']/);
  assert.match(appStateFunctionSource, /DELETE FROM app_state WHERE key = \$1/);
  assert.match(appStateFunctionSource, /isCustomKey/);
});
