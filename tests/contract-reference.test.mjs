import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const utilitySource = await readFile(new URL('../contract-reference.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const trackingSource = await readFile(new URL('../tracking-live.js', import.meta.url), 'utf8');
const viteSource = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

function loadUtility({ href = 'https://example.test/', sessionReference = '', localStore = new Map() } = {}) {
  const session = new Map(sessionReference ? [['active_contract_ref', sessionReference]] : []);
  const local = localStore;
  const broadcastMessages = [];
  const location = new URL(href);
  let randomValue = 7;
  const listeners = new Map();

  class MockBroadcastChannel {
    constructor(channelName) {
      this.name = channelName;
    }
    postMessage(data) {
      broadcastMessages.push({ channel: this.name, data });
    }
    close() {}
  }

  const window = {
    BroadcastChannel: MockBroadcastChannel,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    crypto: {
      getRandomValues(values) {
        values.fill(randomValue);
        randomValue += 1;
        return values;
      },
    },
    addEventListener(event, handler) {
      listeners.set(event, handler);
    },
    dispatchEvent() {},
    history: {
      state: null,
      replaceState(_state, _title, nextUrl) {
        const updated = new URL(nextUrl, location.href);
        location.href = updated.href;
      },
    },
    location,
    sessionStorage: {
      getItem: (key) => (session.has(key) ? session.get(key) : null),
      setItem: (key, value) => session.set(key, value),
      removeItem: (key) => session.delete(key),
    },
    localStorage: {
      getItem: (key) => (local.has(key) ? local.get(key) : null),
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key),
    },
  };
  vm.runInNewContext(utilitySource, {
    window,
    URL,
    URLSearchParams,
    Uint32Array,
    Date,
    Math,
    CustomEvent: window.CustomEvent,
  });
  return { api: window.ContractReference, location, session, local, window, broadcastMessages, listeners };
}

test('URL ref has precedence and synchronizes session storage', () => {
  const { api, location, session } = loadUtility({
    href: 'https://example.test/app?ref=rdm%2Furl%2F2026-abcd',
    sessionReference: 'RDM/SESSION/2026-1111',
  });

  assert.equal(api.getActiveContractRef(), 'RDM/URL/2026-ABCD');
  assert.equal(session.get('active_contract_ref'), 'RDM/URL/2026-ABCD');
  assert.equal(location.searchParams.get('ref'), 'RDM/URL/2026-ABCD');
});

test('contract_ref is accepted and canonicalized as ref', () => {
  const { api, location } = loadUtility({ href: 'https://example.test/app?contract_ref=RDM%2FLEGACY%2F2026-2222' });

  assert.equal(api.getActiveContractRef(), 'RDM/LEGACY/2026-2222');
  assert.equal(location.searchParams.get('ref'), 'RDM/LEGACY/2026-2222');
  assert.equal(location.searchParams.has('contract_ref'), false);
});

test('session storage is used before generating a fallback', () => {
  const { api, location } = loadUtility({ sessionReference: 'RDM/SESSION/2026-3333' });

  assert.equal(api.getActiveContractRef(), 'RDM/SESSION/2026-3333');
  assert.equal(location.searchParams.get('ref'), 'RDM/SESSION/2026-3333');
});

test('fallback follows the maritime business format and persists immediately', () => {
  const { api, location, session } = loadUtility();
  const reference = api.getActiveContractRef();

  assert.match(reference, /^RDM\/\d{4}-\d{4}$/);
  assert.equal(session.get('active_contract_ref'), reference);
  assert.equal(location.searchParams.get('ref'), reference);
});

test('new estimation creates and persists a different temporary reference', () => {
  const { api, location, session } = loadUtility();
  const initialReference = api.getActiveContractRef();
  const nextReference = api.createNewReference();

  assert.match(nextReference, /^RDM\/\d{4}-\d{4}$/);
  assert.notEqual(nextReference, initialReference);
  assert.equal(session.get('active_contract_ref'), nextReference);
  assert.equal(location.searchParams.get('ref'), nextReference);
});

test('new estimation advances the active reference sequence', () => {
  const { api } = loadUtility({ sessionReference: 'RDM/2026-0042' });

  assert.equal(api.createNewReference(), 'RDM/2026-0043');
});

test('persists active session immediately to localStorage and emits via BroadcastChannel on active ref retrieval or change', () => {
  const { api, window, broadcastMessages } = loadUtility({ href: 'https://example.test/app?ref=RDM%2F2026-3306' });
  const activeRef = api.getActiveContractRef();

  assert.equal(activeRef, 'RDM/2026-3306');
  const stored = JSON.parse(window.localStorage.getItem('active_core_pro_session'));
  assert.equal(stored.reference, 'RDM/2026-3306');
  assert.ok(typeof stored.timestamp === 'number');

  assert.ok(broadcastMessages.some(
    (msg) => msg.channel === 'core_bridge_sync' && msg.data.reference === 'RDM/2026-3306',
  ));

  const updatedRef = api.setActiveContractRef('RDM/2026-4400');
  assert.equal(updatedRef, 'RDM/2026-4400');
  const updatedStored = JSON.parse(window.localStorage.getItem('active_core_pro_session'));
  assert.equal(updatedStored.reference, 'RDM/2026-4400');

  assert.ok(broadcastMessages.some(
    (msg) => msg.channel === 'core_bridge_sync' && msg.data.reference === 'RDM/2026-4400',
  ));
});

test('clears active session in localStorage and broadcasts on clear or pagehide', () => {
  const { api, window, broadcastMessages, listeners } = loadUtility({ href: 'https://example.test/app?ref=RDM%2F2026-3306' });
  api.getActiveContractRef();
  assert.ok(window.localStorage.getItem('active_core_pro_session') !== null);

  api.clearActiveSession();
  assert.equal(window.localStorage.getItem('active_core_pro_session'), null);
  assert.ok(broadcastMessages.some(
    (msg) => msg.channel === 'core_bridge_sync' && msg.data.type === 'active_core_pro_session_cleared',
  ));

  // Re-establish session then trigger pagehide
  api.setActiveContractRef('RDM/2026-5500');
  assert.ok(window.localStorage.getItem('active_core_pro_session') !== null);
  const pagehideHandler = listeners.get('pagehide');
  assert.ok(typeof pagehideHandler === 'function');
  pagehideHandler();
  assert.equal(window.localStorage.getItem('active_core_pro_session'), null);
});

test('all contractual modules consume the centralized reference', () => {
  assert.match(indexSource, /<script defer src="\/contract-reference\.js"><\/script>/);
  assert.match(indexSource, /function getSafeActiveContractRef/);
  assert.match(indexSource, /window\.ContractReference \|\| window\.ContractRefManager/);
  assert.match(indexSource, /\['quick-ref', 'gc-ref', 'asb-ref', 'tracking-live-contract-ref'\]/);
  assert.match(indexSource, /activeReference: window\.generateVoyageRef\?\.\(\) \|\| ''/);
  assert.match(indexSource, /referenceManager\?\.createNewReference\?\.\(\)/);
  assert.match(indexSource, /activeReference: nextActiveReference/);
  assert.doesNotMatch(indexSource, /RDM\/2026-0604|RDM\/GC\/2026-0727-XXXX/);
  assert.doesNotMatch(indexSource, /dynamicRefGC|dynamicRefASB|suffixGC|suffixASB/);
});

test('production build copies the contract manager before the SPA fallback can handle requests', () => {
  assert.match(viteSource, /"contract-reference\.js"/);
  assert.match(indexSource, /installContractReferenceSafetyNet/);
  assert.match(indexSource, /globalObject\.ContractRefManager = fallbackManager/);
  assert.match(indexSource, /globalObject\.ContractReference = globalObject\.ContractReference \|\| fallbackManager/);
});

test('tab navigation tolerates missing reference and form auxiliaries', () => {
  const switchStart = indexSource.indexOf('function switchTab(tabId)');
  const switchEnd = indexSource.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = indexSource.slice(switchStart, switchEnd);
  assert.match(switchSource, /if \(!targetView\)/);
  assert.doesNotMatch(switchSource, /ContractReference|ContractRefManager|syncGlobalStateToForms|SeaCharterStore|syncPrintPolicyClass/);
  assert.match(switchSource, /return true/);
});

test('tracking preserves the entered reference when the API fails', () => {
  assert.match(trackingSource, /contractInput\.value = contractRef/);
  assert.match(trackingSource, /La referencia se conserva para reintentar/);
  assert.match(trackingSource, /inputMessage\.dataset\.state = 'warning'/);
  assert.doesNotMatch(trackingSource, /clearTrackingContract\(`\$\{error\?\.message/);
});
