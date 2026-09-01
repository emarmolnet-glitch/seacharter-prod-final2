import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const contractRefSource = await readFile(new URL('../contract-reference.js', import.meta.url), 'utf8');
const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appJsxSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const statusBarSource = await readFile(new URL('../public/ConnectionStatusBar.js', import.meta.url), 'utf8');
const dataBridgeHtmlSource = await readFile(new URL('../public/databridge.html', import.meta.url), 'utf8');
const schemaSource = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');
const connectionSource = await readFile(new URL('../db/connection-string.ts', import.meta.url), 'utf8');
const appStateFnSource = await readFile(new URL('../netlify/functions/app-state.ts', import.meta.url), 'utf8');

test('Schema defines appState and userSessions tables with currentSessionRef columns', () => {
  assert.match(schemaSource, /export const appState = pgTable\(\s*["']app_state["']/);
  assert.match(schemaSource, /currentSessionRef:\s*text\(["']current_session_ref["']\)/);
  assert.match(schemaSource, /export const userSessions = pgTable\(\s*["']user_sessions["']/);
});

test('Database connection string reader checks Netlify.env and standard connection variables', () => {
  assert.match(connectionSource, /DATABASE_URL/);
  assert.match(connectionSource, /NETLIFY_DATABASE_URL/);
  assert.match(connectionSource, /NEON_DATABASE_URL/);
  assert.match(connectionSource, /getDatabaseConnectionString/);
});

test('Backend endpoint netlify/functions/app-state.ts safely ensures app_state table with key and value columns and returns error.message on catch', () => {
  assert.match(appStateFnSource, /CREATE TABLE IF NOT EXISTS app_state/);
  assert.match(appStateFnSource, /key VARCHAR\(255\) PRIMARY KEY/);
  assert.match(appStateFnSource, /value VARCHAR\(255\) NOT NULL/);
  assert.match(appStateFnSource, /INSERT INTO app_state \(key, value, updated_at\)/);
  assert.match(appStateFnSource, /VALUES \('core_pro_active_session', \$1, NOW\(\)\)/);
  assert.match(appStateFnSource, /ON CONFLICT \(key\) DO UPDATE/);
  assert.match(appStateFnSource, /SET value = EXCLUDED\.value/);
  assert.match(appStateFnSource, /error:\s*error\?\.message/);
  assert.match(appStateFnSource, /createCorsHeaders/);
  assert.match(appStateFnSource, /path:\s*\[[\s\S]*?\/api\/app-state/);
});

test('Core PRO App.jsx and ConnectionStatusBar include isSaving flag and check response.ok', () => {
  assert.match(appJsxSource, /isSavingRef/);
  assert.match(appJsxSource, /!res\.ok/);
  assert.match(appJsxSource, /debounceTimerRef|500/);
  assert.match(appJsxSource, /lastPersistedRef/);
  assert.match(statusBarSource, /isSaving/);
  assert.match(statusBarSource, /!res\.ok/);
  assert.match(statusBarSource, /debounceTimer|500/);
  assert.match(statusBarSource, /lastPersistedRef/);
});

test('Data Bridge public/databridge.html includes remote session fetching via /api/app-state', () => {
  assert.match(dataBridgeHtmlSource, /fetchRemoteActiveSessionState/);
  assert.match(dataBridgeHtmlSource, /\/api\/app-state/);
});

test('Core PRO contract-reference.js handles 500 error gracefully without printing fake success logs', async () => {
  const loggedMessages = [];
  const warnedMessages = [];
  const localStore = new Map();
  const sessionStore = new Map();

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
      this.listeners = [];
    }
    addEventListener() {}
    postMessage() {}
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
    addEventListener() {},
    dispatchEvent() {},
    location: new URL('https://core-pro.test/?ref=RDM%2F2026-1122'),
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
    console: {
      log: (...args) => loggedMessages.push(args.join(' ')),
      warn: (...args) => warnedMessages.push(args.join(' ')),
      error: (...args) => warnedMessages.push(args.join(' ')),
    },
    fetch: async () => ({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'Database connection failed' }),
      json: async () => ({ error: 'Database connection failed' }),
    }),
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
    console: windowMock.console,
  });

  const api = windowMock.ContractReference;
  const result = await api.persistSessionToDatabase('RDM/2026-1122', null, true);

  assert.equal(result, null);
  // Must NOT have logged success
  assert.equal(
    loggedMessages.some((msg) => msg.includes('Sesión activa guardada en Neon')),
    false,
    'Must not print fake success log on 500 failure',
  );
  // Must have warned
  assert.ok(
    warnedMessages.some((msg) => msg.includes('No se pudo persistir la sesión activa en backend')),
    'Must log warning on 500 failure',
  );
});

test('Core PRO contract-reference.js dispatches debounced async POST to /api/app-state upon active session generation', async () => {
  const fetchCalls = [];
  const broadcastEvents = [];
  const localStore = new Map();
  const sessionStore = new Map();

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
      this.listeners = [];
    }
    addEventListener(evt, handler) {
      if (evt === 'message') this.listeners.push(handler);
    }
    set onmessage(handler) {
      this.listeners = handler ? [handler] : [];
    }
    postMessage(data) {
      broadcastEvents.push({ channel: this.name, data });
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
    addEventListener() {},
    dispatchEvent() {},
    location: new URL('https://core-pro.test/?ref=RDM%2F2026-7788'),
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
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, reference: 'RDM/2026-7788' }),
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
  const activeRef = api.getActiveContractRef();
  assert.equal(activeRef, 'RDM/2026-7788');

  // Assert BroadcastChannel emitted
  assert.ok(broadcastEvents.some(
    (e) => e.channel === 'seacharter_sync_channel' && e.data?.reference === 'RDM/2026-7788',
  ));

  // Wait for debounce timer (500ms)
  await new Promise((r) => setTimeout(r, 600));

  // Assert async backend fetch occurred to /api/app-state with currentSessionRef
  const appStateFetch = fetchCalls.find((c) => c.url.includes('/api/app-state'));
  assert.ok(appStateFetch, 'Expected fetch to /api/app-state');
  assert.equal(appStateFetch.options.method, 'POST');
  assert.equal(appStateFetch.body.currentSessionRef, 'RDM/2026-7788');
  assert.equal(appStateFetch.body.session_ref, 'RDM/2026-7788');
});

test('Core PRO contract-reference.js dispatches async POST to /api/app-state on reference change and prevents infinite duplicate saves', async () => {
  const fetchCalls = [];
  const localStore = new Map();
  const sessionStore = new Map();

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
      this.listeners = [];
    }
    addEventListener() {}
    postMessage() {}
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
    addEventListener() {},
    dispatchEvent() {},
    location: new URL('https://core-pro.test/'),
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
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
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

  // Change active session immediately
  await api.persistSessionToDatabase('RDM/2026-9999', null, true);
  const postCalls = fetchCalls.filter((c) => c.url.includes('/api/app-state'));
  assert.equal(postCalls.length, 1);
  assert.equal(postCalls[0].body.currentSessionRef, 'RDM/2026-9999');
  assert.equal(postCalls[0].body.session_ref, 'RDM/2026-9999');

  // Attempt duplicate save without change: must be prevented by lastPersistedReference
  await api.persistSessionToDatabase('RDM/2026-9999', null, true);
  assert.equal(fetchCalls.filter((c) => c.url.includes('/api/app-state')).length, 1);
});

test('Core PRO index.html inline script persists to Neon backend with debouncing and safe table support', async () => {
  const fetchCalls = [];
  const localStore = new Map();
  const sessionStore = new Map();
  const broadcastEvents = [];
  let syncHandler = null;

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
      if (channelName === 'seacharter_sync_channel') {
        syncChannelInstance = this;
      }
    }
    addEventListener(evt, handler) {
      if (evt === 'message') syncHandler = handler;
    }
    set onmessage(handler) {
      syncHandler = handler;
    }
    postMessage(data) {
      broadcastEvents.push({ channel: this.name, data });
    }
    close() {}
  }
  let syncChannelInstance = null;

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
    location: new URL('https://core-pro.test/?ref=RDM%2F2026-4455'),
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
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    },
  };

  const inlineScriptMatch = indexHtmlSource.match(/<script>\s*\(function installContractReferenceSafetyNet[\s\S]*?<\/script>/);
  assert.ok(inlineScriptMatch, 'Could not find installContractReferenceSafetyNet script in index.html');
  const inlineScript = inlineScriptMatch[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

  vm.runInNewContext(inlineScript, {
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

  const api = windowMock.ContractRefManager;
  assert.ok(api, 'ContractRefManager should be registered on global');
  const ref = api.getActiveContractRef();
  assert.equal(ref, 'RDM/2026-4455');

  // Verify immediate or debounced fetch
  await api.persistSessionToDatabase('RDM/2026-4455', null, true);
  assert.ok(fetchCalls.some((c) => c.body?.currentSessionRef === 'RDM/2026-4455'));

  // Simulate PING_SESSION
  fetchCalls.length = 0;
  assert.ok(typeof syncHandler === 'function', 'Sync message handler should be registered');
  syncHandler({ data: { type: 'PING_SESSION' } });

  // Verify response
  assert.ok(broadcastEvents.some(
    (e) => e.channel === 'seacharter_sync_channel' && e.data?.reference === 'RDM/2026-4455',
  ));
});

test('Shared CORS helper allows all Netlify subdomains (*.netlify.app)', async () => {
  const corsSource = await readFile(new URL('../netlify/functions/_shared/cors.ts', import.meta.url), 'utf8');
  assert.match(corsSource, /\.netlify\.app/);
  assert.match(corsSource, /isAllowedNetlifyOrigin/);
  assert.match(corsSource, /isAllowedCorsOrigin/);
});
