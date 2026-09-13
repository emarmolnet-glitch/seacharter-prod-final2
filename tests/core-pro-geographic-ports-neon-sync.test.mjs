import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const contractRefSource = await readFile(new URL('../contract-reference.js', import.meta.url), 'utf8');
const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appStateFnSource = await readFile(new URL('../netlify/functions/app-state.ts', import.meta.url), 'utf8');
const voyageActiveFnSource = await readFile(new URL('../netlify/functions/voyage-active.ts', import.meta.url), 'utf8');

test('1. contract-reference.js defines extractCurrentPortGeographicState and packages POL/POD in payload', () => {
  assert.match(contractRefSource, /function extractCurrentPortGeographicState/);
  assert.match(contractRefSource, /map-port-pol/);
  assert.match(contractRefSource, /map-port-pod/);
  assert.match(contractRefSource, /geo\.pol = polName/);
  assert.match(contractRefSource, /geo\.pod = podName/);
  assert.match(contractRefSource, /\.\.\.geoState/);
  assert.match(contractRefSource, /\/api\/session-sync/);
});

test('2. index.html runOnDemandMapRouteWorkflow persists active reference and POL/POD to Neon DB', () => {
  assert.match(indexHtmlSource, /async function runOnDemandMapRouteWorkflow/);
  assert.match(indexHtmlSource, /persistSessionToDatabase\(activeRef,\s*geoPayload,\s*true\)/);
  assert.match(indexHtmlSource, /pol_latitude:\s*Number\(routeResult\?\.coordinates\?\.pol/);
  assert.match(indexHtmlSource, /pod_latitude:\s*Number\(routeResult\?\.coordinates\?\.pod/);
});

test('3. app-state.ts extracts POL and POD and performs direct UPSERT into voyages_tracking and session_sync', () => {
  assert.match(appStateFnSource, /INSERT INTO voyages_tracking/);
  assert.match(appStateFnSource, /pol_name,\s*pol_code,\s*pol_latitude,\s*pol_longitude,\s*pod_name,\s*pod_code,\s*pod_latitude,\s*pod_longitude/);
  assert.match(appStateFnSource, /ON CONFLICT \(\(upper\(contract_ref\)\)\) DO UPDATE/);
  assert.match(appStateFnSource, /INSERT INTO session_sync/);
  assert.match(appStateFnSource, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(appStateFnSource, /INSERT INTO charter_dossiers/);
});

test('4. voyage-active.ts selects from voyagesTracking and falls back to structural tables for POL/POD', () => {
  assert.match(voyageActiveFnSource, /from\(voyagesTracking\)/);
  assert.match(voyageActiveFnSource, /charter_dossiers/);
  assert.match(voyageActiveFnSource, /session_sync/);
  assert.match(voyageActiveFnSource, /app_state/);
  assert.match(voyageActiveFnSource, /loadPort: port\(voyage\.loadPortName/);
  assert.match(voyageActiveFnSource, /dischargePort: port\(voyage\.dischargePortName/);
});

test('5. contract-reference.js persistSessionToDatabase sends POL and POD to backend', async () => {
  const fetchCalls = [];
  const localStore = new Map();
  const sessionStore = new Map();

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
    }
    addEventListener() {}
    postMessage() {}
    close() {}
  }

  const domElements = {
    'map-port-pol': { value: 'SANTOS' },
    'map-port-pod': { value: 'ROTTERDAM' },
    'map-laycan-date': { value: '2026-10-01' },
    'map-cancelling-date': { value: '2026-10-10' },
    'vessel-name': { value: 'MV ATLANTIC STAR' },
    'vessel-imo': { value: '9876543' },
    'cargo-name': { value: 'SOYBEANS' },
    'cargo-quantity': { value: '55000' },
  };

  const windowMock = {
    BroadcastChannel: MockBroadcastChannel,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    addEventListener() {},
    dispatchEvent() {},
    location: new URL('https://core-pro.test/?ref=RDM%2F2026-5555'),
    history: {
      state: null,
      replaceState(_state, _title, nextUrl) {
        windowMock.location = new URL(nextUrl, windowMock.location.href);
      },
    },
    sessionStorage: {
      getItem: (key) => (sessionStore.has(key) ? sessionStore.get(key) : null),
      setItem: (key, val) => sessionStore.set(key, val),
      removeItem: (key) => sessionStore.delete(key),
    },
    localStorage: {
      getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
      setItem: (key, val) => localStore.set(key, val),
      removeItem: (key) => localStore.delete(key),
    },
    document: {
      getElementById: (id) => domElements[id] || null,
    },
    activeMaritimeRoute: {
      coordinates: {
        pol: { lat: -23.96, lng: -46.33 },
        pod: { lat: 51.95, lng: 4.14 },
      },
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, reference: 'RDM/2026-5555' }),
      };
    },
  };

  vm.runInNewContext(contractRefSource, {
    window: windowMock,
    URL,
    URLSearchParams,
    Uint32Array,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    CustomEvent: windowMock.CustomEvent,
  });

  const api = windowMock.ContractReference;
  fetchCalls.length = 0;

  // Persist session with extra geographic payload
  await api.persistSessionToDatabase('RDM/2026-5555', null, true);

  const appStateFetch = fetchCalls.find((c) => c.url.includes('/api/app-state'));
  assert.ok(appStateFetch, 'Expected POST to /api/app-state');
  assert.equal(appStateFetch.body.reference, 'RDM/2026-5555');
  assert.equal(appStateFetch.body.pol, 'SANTOS');
  assert.equal(appStateFetch.body.pod, 'ROTTERDAM');
  assert.equal(appStateFetch.body.pol_latitude, -23.96);
  assert.equal(appStateFetch.body.pod_latitude, 51.95);
  assert.equal(appStateFetch.body.vessel_name, 'MV ATLANTIC STAR');
  assert.equal(appStateFetch.body.cargo_name, 'SOYBEANS');

  // Verify direct structural sync to /api/session-sync was also triggered
  const sessionSyncFetch = fetchCalls.find((c) => c.url.includes('/api/session-sync'));
  assert.ok(sessionSyncFetch, 'Expected direct POST to /api/session-sync');
  assert.equal(sessionSyncFetch.body.sync_id, 'RDM/2026-5555');
  assert.equal(sessionSyncFetch.body.last_sync_data.pol, 'SANTOS');
  assert.equal(sessionSyncFetch.body.last_sync_data.pod, 'ROTTERDAM');
});
