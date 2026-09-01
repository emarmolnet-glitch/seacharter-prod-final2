import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const dataBridgeHtmlSource = await readFile(new URL('../public/databridge.html', import.meta.url), 'utf8');

test('Data Bridge HTML defines the header session badge and CARGAR DATOS button', () => {
  assert.match(dataBridgeHtmlSource, /id="databridge-session-badge"/);
  assert.match(dataBridgeHtmlSource, /id="databridge-session-dot"/);
  assert.match(dataBridgeHtmlSource, /id="databridge-session-text"/);
  assert.match(dataBridgeHtmlSource, /id="btn-databridge-load-data"/);
  assert.match(dataBridgeHtmlSource, /onclick="loadDataBridgeSessionPayload\(\)"/);
  assert.match(dataBridgeHtmlSource, /CARGAR DATOS/);
});

test('Data Bridge script provides aggressive reference detection and synchronization APIs', () => {
  assert.match(dataBridgeHtmlSource, /function extractReferenceFromValue/);
  assert.match(dataBridgeHtmlSource, /function detectActiveSessionReference/);
  assert.match(dataBridgeHtmlSource, /function updateSessionBadge/);
  assert.match(dataBridgeHtmlSource, /function updateActiveCoreProSession/);
  assert.match(dataBridgeHtmlSource, /function refreshActiveSessionState/);
  assert.match(dataBridgeHtmlSource, /function loadDataBridgeSessionPayload/);
});

const mainScriptMatch = dataBridgeHtmlSource.match(/<!-- Logic Script -->[\s\S]*?<script>([\s\S]*?)<\/script>/);
assert.ok(mainScriptMatch, 'Data Bridge must contain the main logic script');
const scriptSource = mainScriptMatch[1];

function createMockElement(id, initialProps = {}) {
  return {
    id,
    dataset: {},
    className: '',
    textContent: '',
    innerHTML: '',
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    ...initialProps,
  };
}

function createMockDomEnvironment(initialUrl = 'https://app.test/databridge.html', storageInit = {}) {
  const localStore = new Map(Object.entries(storageInit.localStorage || {}));
  const sessionStore = new Map(Object.entries(storageInit.sessionStorage || {}));
  const eventListeners = new Map();
  const broadcastMessages = [];
  const postedParentMessages = [];
  const postedOpenerMessages = [];
  const logs = [];

  const elements = {
    'databridge-session-badge': createMockElement('databridge-session-badge'),
    'databridge-session-dot': createMockElement('databridge-session-dot'),
    'databridge-session-text': createMockElement('databridge-session-text'),
    'databridge-datalastic-credit': createMockElement('databridge-datalastic-credit'),
    'logs-container': createMockElement('logs-container', {
      appendChild(child) {
        logs.push(child.textContent);
      },
      scrollTop: 0,
      scrollHeight: 100,
    }),
    'rate-count': createMockElement('rate-count', { textContent: '1,482' }),
    'vessel-count': createMockElement('vessel-count', { textContent: '0' }),
    'sync-cycle': createMockElement('sync-cycle'),
    'sync-status': createMockElement('sync-status'),
    'btn-pause-sync': createMockElement('btn-pause-sync'),
    'pause-icon': createMockElement('pause-icon'),
    'pause-text': createMockElement('pause-text'),
    'npl-file-input': createMockElement('npl-file-input', { files: [] }),
    'npl-status': createMockElement('npl-status'),
    'npl-result-preview': createMockElement('npl-result-preview'),
    'btn-process-npl': createMockElement('btn-process-npl'),
    'btn-download-npl-json': createMockElement('btn-download-npl-json', { disabled: true }),
    'btn-download-npl-pdf': createMockElement('btn-download-npl-pdf', { disabled: true }),
    'npl-image-preview-wrap': createMockElement('npl-image-preview-wrap'),
    'file-preview': createMockElement('file-preview'),
    'npl-comparative-summary': createMockElement('npl-comparative-summary'),
    'npl-comparative-summary-text': createMockElement('npl-comparative-summary-text'),
    'motor-npl-panel': createMockElement('motor-npl-panel', { style: { display: 'block' } }),
    'npl-paste-toast': createMockElement('npl-paste-toast'),
    'audit-vessels-container': createMockElement('audit-vessels-container'),
    'empty-audit-state': createMockElement('empty-audit-state'),
    'audit-badge': createMockElement('audit-badge', { textContent: '0 BUQUES' }),
    'ia-reports-container': createMockElement('ia-reports-container'),
    'ia-reports-badge': createMockElement('ia-reports-badge', { textContent: '0 INFORMES' }),
  };

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
      this.listeners = [];
    }
    addEventListener(event, listener) {
      if (event === 'message') this.listeners.push(listener);
    }
    postMessage(data) {
      broadcastMessages.push({ channel: this.name, data });
    }
    close() {}
  }

  const windowMock = {
    location: new URL(initialUrl),
    localStorage: {
      length: localStore.size,
      key(i) {
        return Array.from(localStore.keys())[i] || null;
      },
      getItem(k) {
        return localStore.has(k) ? localStore.get(k) : null;
      },
      setItem(k, v) {
        localStore.set(k, String(v));
        this.length = localStore.size;
      },
      removeItem(k) {
        localStore.delete(k);
        this.length = localStore.size;
      },
    },
    sessionStorage: {
      length: sessionStore.size,
      key(i) {
        return Array.from(sessionStore.keys())[i] || null;
      },
      getItem(k) {
        return sessionStore.has(k) ? sessionStore.get(k) : null;
      },
      setItem(k, v) {
        sessionStore.set(k, String(v));
        this.length = sessionStore.size;
      },
      removeItem(k) {
        sessionStore.delete(k);
        this.length = sessionStore.size;
      },
    },
    document: {
      hidden: false,
      getElementById(id) {
        return elements[id] || null;
      },
      querySelector(sel) {
        return null;
      },
      querySelectorAll(sel) {
        return [];
      },
      createElement(tag) {
        return { tagName: tag, className: '', textContent: '', appendChild() {} };
      },
      addEventListener(event, handler) {
        if (!eventListeners.has(event)) eventListeners.set(event, []);
        eventListeners.get(event).push(handler);
      },
    },
    addEventListener(event, handler) {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    dispatchEvent(event) {},
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    BroadcastChannel: MockBroadcastChannel,
    parent: {
      postMessage(data) {
        postedParentMessages.push(data);
      },
    },
    opener: null,
    setInterval() {},
    setTimeout() {},
    clearTimeout() {},
  };

  return {
    windowMock,
    elements,
    localStore,
    sessionStore,
    eventListeners,
    broadcastMessages,
    postedParentMessages,
    postedOpenerMessages,
    logs,
  };
}

test('detectActiveSessionReference aggressive detection from URL query params', () => {
  const env = createMockDomEnvironment('https://app.test/databridge.html?ref=RDM%2F2026-0080');
  vm.runInNewContext(scriptSource, {
    window: env.windowMock,
    document: env.windowMock.document,
    localStorage: env.windowMock.localStorage,
    sessionStorage: env.windowMock.sessionStorage,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    decodeURIComponent: globalThis.decodeURIComponent,
    CustomEvent: env.windowMock.CustomEvent,
    BroadcastChannel: env.windowMock.BroadcastChannel,
    setInterval: () => {},
    setTimeout: () => {},
  });

  assert.equal(env.windowMock.detectActiveSessionReference(), 'RDM/2026-0080');
  assert.equal(env.elements['databridge-session-badge'].dataset.sessionActive, 'true');
  assert.equal(env.elements['databridge-session-badge'].dataset.reference, 'RDM/2026-0080');
  assert.match(env.elements['databridge-session-text'].textContent, /🟢 RDM\/2026-0080/);
});

test('detectActiveSessionReference aggressive detection from localStorage and cross-tab sync', () => {
  const env = createMockDomEnvironment('https://app.test/databridge.html', {
    localStorage: {
      active_core_pro_session: JSON.stringify({ reference: 'RDM/2026-0080', timestamp: Date.now() }),
    },
  });

  vm.runInNewContext(scriptSource, {
    window: env.windowMock,
    document: env.windowMock.document,
    localStorage: env.windowMock.localStorage,
    sessionStorage: env.windowMock.sessionStorage,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    decodeURIComponent: globalThis.decodeURIComponent,
    CustomEvent: env.windowMock.CustomEvent,
    BroadcastChannel: env.windowMock.BroadcastChannel,
    setInterval: () => {},
    setTimeout: () => {},
  });

  assert.equal(env.elements['databridge-session-badge'].dataset.sessionActive, 'true');
  assert.equal(env.elements['databridge-session-badge'].dataset.reference, 'RDM/2026-0080');
  assert.match(env.elements['databridge-session-text'].textContent, /🟢 RDM\/2026-0080/);

  // Simulate cross-tab session update via storage event
  const storageListeners = env.eventListeners.get('storage') || [];
  env.localStore.set('active_core_pro_session', JSON.stringify({ reference: 'RDM/2026-0099', timestamp: Date.now() }));
  storageListeners.forEach((listener) => {
    listener({
      key: 'active_core_pro_session',
      newValue: JSON.stringify({ reference: 'RDM/2026-0099', timestamp: Date.now() }),
    });
  });

  assert.equal(env.elements['databridge-session-badge'].dataset.reference, 'RDM/2026-0099');
  assert.match(env.elements['databridge-session-text'].textContent, /🟢 RDM\/2026-0099/);
});

test('CARGAR DATOS button packages the active session reference and delivers payload to Core PRO', async () => {
  const env = createMockDomEnvironment('https://app.test/databridge.html?session=RDM/2026-0080');

  vm.runInNewContext(scriptSource, {
    window: env.windowMock,
    document: env.windowMock.document,
    localStorage: env.windowMock.localStorage,
    sessionStorage: env.windowMock.sessionStorage,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    decodeURIComponent: globalThis.decodeURIComponent,
    CustomEvent: env.windowMock.CustomEvent,
    BroadcastChannel: env.windowMock.BroadcastChannel,
    setInterval: () => {},
    setTimeout: () => {},
    alert: () => {},
  });

  await env.windowMock.loadDataBridgeSessionPayload();

  // Verify postMessage sent to parent
  const loadMessage = env.postedParentMessages.find((msg) => msg.type === 'SEACHARTER_DATABRIDGE_LOAD_DATA');
  assert.ok(loadMessage, 'Must post SEACHARTER_DATABRIDGE_LOAD_DATA to parent');
  assert.equal(loadMessage.reference, 'RDM/2026-0080');
  assert.equal(loadMessage.payload.reference, 'RDM/2026-0080');
  assert.equal(loadMessage.payload.session.reference, 'RDM/2026-0080');

  // Verify BroadcastChannel emission
  const broadcastMsg = env.broadcastMessages.find((msg) => msg.channel === 'core_bridge_sync' && msg.data.type === 'active_core_pro_session');
  assert.ok(broadcastMsg, 'Must broadcast active_core_pro_session on core_bridge_sync');
  assert.equal(broadcastMsg.data.reference, 'RDM/2026-0080');
});
