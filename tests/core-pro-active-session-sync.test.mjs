import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const contractRefSource = await readFile(new URL('../contract-reference.js', import.meta.url), 'utf8');
const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const dataBridgeHtmlSource = await readFile(new URL('../public/databridge.html', import.meta.url), 'utf8');

test('Core PRO Contract Reference manager defines SHARED_STORAGE_KEY and BROADCAST_CHANNEL_NAME', () => {
  assert.match(contractRefSource, /active_core_pro_session/);
  assert.match(contractRefSource, /core_bridge_sync/);
  assert.match(contractRefSource, /writeSharedActiveSession/);
  assert.match(contractRefSource, /clearSharedActiveSession/);
});

test('Core PRO index.html inline fallback defines SHARED_STORAGE_KEY and BROADCAST_CHANNEL_NAME', () => {
  assert.match(indexHtmlSource, /active_core_pro_session/);
  assert.match(indexHtmlSource, /core_bridge_sync/);
  assert.match(indexHtmlSource, /clearCalculatorLocalStorage/);
});

test('Data Bridge listens to core_bridge_sync and reads active_core_pro_session', () => {
  assert.match(dataBridgeHtmlSource, /active_core_pro_session/);
  assert.match(dataBridgeHtmlSource, /core_bridge_sync/);
  assert.match(dataBridgeHtmlSource, /updateActiveCoreProSession/);
});

test('Core PRO lifecycle: active session is stored and broadcasted on change and cleared on reset/exit', () => {
  const localStore = new Map();
  const sessionStore = new Map();
  const broadcastEvents = [];
  const eventListeners = new Map();

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
    }
    postMessage(message) {
      broadcastEvents.push({ channel: this.name, message });
    }
    close() {}
  }

  const windowMock = {
    BroadcastChannel: MockBroadcastChannel,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    addEventListener(event, handler) {
      eventListeners.set(event, handler);
    },
    dispatchEvent() {},
    location: new URL('https://core-pro.test/?ref=RDM%2F2026-3306'),
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

  const api = windowMock.ContractReference;

  // 1. Initial active reference emission
  const initialRef = api.getActiveContractRef();
  assert.equal(initialRef, 'RDM/2026-3306');
  assert.ok(localStore.has('active_core_pro_session'));

  const parsedActive = JSON.parse(localStore.get('active_core_pro_session'));
  assert.equal(parsedActive.reference, 'RDM/2026-3306');
  assert.ok(typeof parsedActive.timestamp === 'number');

  assert.ok(broadcastEvents.some(
    (e) => e.channel === 'core_bridge_sync' && e.message.reference === 'RDM/2026-3306',
  ));

  // 2. Change estimation reference
  const nextRef = api.createNewReference();
  assert.equal(nextRef, 'RDM/2026-3307');
  const parsedNext = JSON.parse(localStore.get('active_core_pro_session'));
  assert.equal(parsedNext.reference, 'RDM/2026-3307');
  assert.ok(broadcastEvents.some(
    (e) => e.channel === 'core_bridge_sync' && e.message.reference === 'RDM/2026-3307',
  ));

  // 3. User sets arbitrary reference
  api.setActiveContractRef('RDM/2026-9999');
  const parsedCustom = JSON.parse(localStore.get('active_core_pro_session'));
  assert.equal(parsedCustom.reference, 'RDM/2026-9999');
  assert.ok(broadcastEvents.some(
    (e) => e.channel === 'core_bridge_sync' && e.message.reference === 'RDM/2026-9999',
  ));

  // 4. Session clear / close
  api.clearActiveSession();
  assert.equal(localStore.get('active_core_pro_session'), undefined);
  assert.ok(broadcastEvents.some(
    (e) => e.channel === 'core_bridge_sync' && e.message.type === 'active_core_pro_session_cleared',
  ));
});
