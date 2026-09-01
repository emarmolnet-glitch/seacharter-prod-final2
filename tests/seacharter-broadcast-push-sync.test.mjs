import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const contractRefSource = await readFile(new URL('../contract-reference.js', import.meta.url), 'utf8');
const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const dossiersSource = await readFile(new URL('../dossiers.js', import.meta.url), 'utf8');
const dataBridgeHtmlSource = await readFile(new URL('../public/databridge.html', import.meta.url), 'utf8');
const appJsxSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const statusBarSource = await readFile(new URL('../public/ConnectionStatusBar.js', import.meta.url), 'utf8');

test('Core PRO App.jsx defines global useEffect, BroadcastChannel, PING_SESSION handler, and visual chivatos', () => {
  assert.match(appJsxSource, /useEffect/);
  assert.match(appJsxSource, /new\s+BroadcastChannel\(['"]seacharter_sync_channel['"]\)/);
  assert.match(appJsxSource, /PING_SESSION/);
  assert.match(appJsxSource, /CORE_SESSION_ACTIVE/);
  assert.match(appJsxSource, /\[Core PRO\] Canal de sincronización abierto/);
  assert.match(appJsxSource, /\[Core PRO\] PING recibido, respondiendo con:/);
});

test('Core PRO ConnectionStatusBar defines global useEffect, BroadcastChannel, and visual chivatos', () => {
  assert.match(statusBarSource, /React\.useEffect/);
  assert.match(statusBarSource, /BroadcastChannel\(['"]seacharter_sync_channel['"]\)/);
  assert.match(statusBarSource, /PING_SESSION/);
  assert.match(statusBarSource, /CORE_SESSION_ACTIVE/);
  assert.match(statusBarSource, /\[Core PRO\] Canal de sincronización abierto/);
  assert.match(statusBarSource, /\[Core PRO\] PING recibido, respondiendo con:/);
});

test('Core PRO Contract Reference manager defines SYNC_BROADCAST_CHANNEL_NAME as seacharter_sync_channel', () => {
  assert.match(contractRefSource, /seacharter_sync_channel/);
  assert.match(contractRefSource, /CORE_SESSION_ACTIVE/);
  assert.match(contractRefSource, /PING_SESSION/);
  assert.match(contractRefSource, /broadcastCoreSessionActive/);
});

test('Core PRO index.html inline safety net defines seacharter_sync_channel and handles PING_SESSION', () => {
  assert.match(indexHtmlSource, /seacharter_sync_channel/);
  assert.match(indexHtmlSource, /CORE_SESSION_ACTIVE/);
  assert.match(indexHtmlSource, /PING_SESSION/);
  assert.match(indexHtmlSource, /broadcastCoreSessionActive/);
});

test('Dossiers module emits active session on dossier load and persist', () => {
  assert.match(dossiersSource, /broadcastCoreSessionActive/);
});

test('Data Bridge connects to seacharter_sync_channel and handles CORE_SESSION_ACTIVE and pings on startup', () => {
  assert.match(dataBridgeHtmlSource, /seacharter_sync_channel/);
  assert.match(dataBridgeHtmlSource, /CORE_SESSION_ACTIVE/);
  assert.match(dataBridgeHtmlSource, /PING_SESSION/);
});

function createMockEnvironment({ href = 'https://core-pro.test/?ref=RDM%2F2026-1234', initialStorage = {} } = {}) {
  const localStore = new Map(Object.entries(initialStorage.localStorage || {}));
  const sessionStore = new Map(Object.entries(initialStorage.sessionStorage || {}));
  const broadcastChannels = new Map();
  const allBroadcastMessages = [];
  const eventListeners = new Map();
  const dispatchedEvents = [];

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
      this.listeners = [];
      if (!broadcastChannels.has(channelName)) {
        broadcastChannels.set(channelName, []);
      }
      broadcastChannels.get(channelName).push(this);
    }

    addEventListener(event, handler) {
      if (event === 'message') {
        this.listeners.push(handler);
      }
    }

    set onmessage(handler) {
      this.listeners = handler ? [handler] : [];
    }

    postMessage(data) {
      allBroadcastMessages.push({ channel: this.name, data, sender: this });
      // Deliver to other channel instances on the same name (simulating cross-tab broadcast)
      const peers = broadcastChannels.get(this.name) || [];
      for (const peer of peers) {
        if (peer !== this) {
          for (const listener of peer.listeners) {
            listener({ data });
          }
        }
      }
    }

    close() {
      const peers = broadcastChannels.get(this.name) || [];
      const index = peers.indexOf(this);
      if (index !== -1) peers.splice(index, 1);
    }
  }

  const location = new URL(href);

  const windowMock = {
    BroadcastChannel: MockBroadcastChannel,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    addEventListener(event, handler) {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    },
    location,
    history: {
      state: null,
      replaceState(_state, _title, nextUrl) {
        windowMock.location = new URL(nextUrl, windowMock.location.href);
      },
    },
    sessionStorage: {
      getItem: (key) => (sessionStore.has(key) ? sessionStore.get(key) : null),
      setItem: (key, val) => sessionStore.set(key, String(val)),
      removeItem: (key) => sessionStore.delete(key),
    },
    localStorage: {
      getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
      setItem: (key, val) => localStore.set(key, String(val)),
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

  return {
    window: windowMock,
    api: windowMock.ContractReference,
    MockBroadcastChannel,
    broadcastChannels,
    allBroadcastMessages,
    dispatchedEvents,
  };
}

test('1. EMISIÓN POR BROADCAST CHANNEL al iniciar la aplicación', () => {
  const env = createMockEnvironment({ href: 'https://core-pro.test/?ref=RDM%2F2026-5555' });
  const initialRef = env.api.getActiveContractRef();
  assert.equal(initialRef, 'RDM/2026-5555');

  // Verify emission on seacharter_sync_channel
  const syncMessages = env.allBroadcastMessages.filter((m) => m.channel === 'seacharter_sync_channel');
  assert.ok(syncMessages.length > 0, 'Must emit to seacharter_sync_channel on initialization');

  // Verify payload structure
  const lastSync = syncMessages[syncMessages.length - 1];
  assert.equal(lastSync.data.type, 'CORE_SESSION_ACTIVE');
  assert.equal(lastSync.data.reference, 'RDM/2026-5555');
  assert.equal(typeof lastSync.data.timestamp, 'number');
  assert.ok(lastSync.data.timestamp > 0);
});

test('2. PAYLOAD ESTRUCTURADO al cambiar de sesión o generar nueva referencia', () => {
  const env = createMockEnvironment({ href: 'https://core-pro.test/?ref=RDM%2F2026-1000' });
  env.allBroadcastMessages.length = 0; // reset

  // Changing session
  const updatedRef = env.api.setActiveContractRef('RDM/2026-2000');
  assert.equal(updatedRef, 'RDM/2026-2000');

  const syncMessages = env.allBroadcastMessages.filter((m) => m.channel === 'seacharter_sync_channel');
  assert.ok(syncMessages.length > 0, 'Must emit to seacharter_sync_channel on session change');

  const sessionActiveMsg = syncMessages.find(
    (m) => m.data.type === 'CORE_SESSION_ACTIVE' && m.data.reference === 'RDM/2026-2000',
  );
  assert.ok(sessionActiveMsg, 'Must find structured CORE_SESSION_ACTIVE payload for new reference');
  assert.equal(typeof sessionActiveMsg.data.timestamp, 'number');

  // Creating a new voyage reference
  env.allBroadcastMessages.length = 0;
  const newRef = env.api.createNewReference();
  assert.equal(newRef, 'RDM/2026-2001');

  const newSyncMessages = env.allBroadcastMessages.filter((m) => m.channel === 'seacharter_sync_channel');
  const newSessionActiveMsg = newSyncMessages.find(
    (m) => m.data.type === 'CORE_SESSION_ACTIVE' && m.data.reference === 'RDM/2026-2001',
  );
  assert.ok(newSessionActiveMsg, 'Must find structured CORE_SESSION_ACTIVE payload for created reference');
});

test('3. RESPUESTA A "PING": Core PRO responde inmediatamente a PING_SESSION', () => {
  const env = createMockEnvironment({ href: 'https://core-pro.test/?ref=RDM%2F2026-7777' });
  env.api.getActiveContractRef();

  // Simulate an external client (e.g. DataBridge or another module) opening the channel
  const externalChannel = new env.MockBroadcastChannel('seacharter_sync_channel');
  const receivedByExternal = [];
  externalChannel.addEventListener('message', (event) => {
    receivedByExternal.push(event.data);
  });

  // External client sends PING_SESSION
  externalChannel.postMessage({ type: 'PING_SESSION', timestamp: Date.now() });

  // Verify Core PRO responded immediately with CORE_SESSION_ACTIVE
  const responseMsg = receivedByExternal.find((msg) => msg.type === 'CORE_SESSION_ACTIVE');
  assert.ok(responseMsg, 'Core PRO must immediately respond to PING_SESSION with CORE_SESSION_ACTIVE');
  assert.equal(responseMsg.reference, 'RDM/2026-7777');
  assert.equal(typeof responseMsg.timestamp, 'number');

  // Test string format 'PING_SESSION' as well
  receivedByExternal.length = 0;
  externalChannel.postMessage('PING_SESSION');
  const stringPingResponse = receivedByExternal.find((msg) => msg.type === 'CORE_SESSION_ACTIVE');
  assert.ok(stringPingResponse, 'Core PRO must respond to string PING_SESSION');
  assert.equal(stringPingResponse.reference, 'RDM/2026-7777');
});

test('4. SIMULACIÓN DE LISTENER REACT EN Core PRO (App.jsx / ConnectionStatusBar)', () => {
  const env = createMockEnvironment({ href: 'https://core-pro.test/?ref=RDM%2F2026-9999' });
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
  };

  try {
    // Instantiate React-like hook lifecycle
    const channel = new env.MockBroadcastChannel('seacharter_sync_channel');
    console.log('[Core PRO] Canal de sincronización abierto');

    channel.onmessage = (event) => {
      const data = event?.data;
      if (data?.type === 'PING_SESSION' || data === 'PING_SESSION') {
        const currentSessionRef = env.api.getActiveContractRef();
        console.log('[Core PRO] PING recibido, respondiendo con:', currentSessionRef);
        channel.postMessage({
          type: 'CORE_SESSION_ACTIVE',
          reference: currentSessionRef,
        });
      }
    };

    // External client (Data Bridge) connects and sends PING
    const bridgeChannel = new env.MockBroadcastChannel('seacharter_sync_channel');
    const received = [];
    bridgeChannel.addEventListener('message', (event) => {
      received.push(event.data);
    });

    bridgeChannel.postMessage({ type: 'PING_SESSION', timestamp: Date.now() });

    assert.ok(logs.some((l) => l.includes('[Core PRO] Canal de sincronización abierto')));
    assert.ok(logs.some((l) => l.includes('[Core PRO] PING recibido, respondiendo con: RDM/2026-9999')));

    const activeMsg = received.find((m) => m.type === 'CORE_SESSION_ACTIVE');
    assert.ok(activeMsg);
    assert.equal(activeMsg.reference, 'RDM/2026-9999');
  } finally {
    console.log = originalLog;
  }
});
