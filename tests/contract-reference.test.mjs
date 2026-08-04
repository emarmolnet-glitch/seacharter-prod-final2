import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const utilitySource = await readFile(new URL('../contract-reference.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const trackingSource = await readFile(new URL('../tracking-live.js', import.meta.url), 'utf8');
const viteSource = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

function loadUtility({ href = 'https://example.test/', sessionReference = '' } = {}) {
  const session = new Map(sessionReference ? [['active_contract_ref', sessionReference]] : []);
  const location = new URL(href);
  const window = {
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    crypto: { getRandomValues: (values) => values.fill(7) },
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
      getItem: (key) => session.get(key) || null,
      setItem: (key, value) => session.set(key, value),
    },
  };
  vm.runInNewContext(utilitySource, { window, URL, URLSearchParams, Uint32Array, Date, Math, CustomEvent: window.CustomEvent });
  return { api: window.ContractReference, location, session };
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

  assert.match(reference, /^RDM\/ASB\/\d{4}-[A-Z2-9]{4}$/);
  assert.equal(session.get('active_contract_ref'), reference);
  assert.equal(location.searchParams.get('ref'), reference);
});

test('all contractual modules consume the centralized reference', () => {
  assert.match(indexSource, /<script src="\/contract-reference\.js"><\/script>/);
  assert.match(indexSource, /function getSafeActiveContractRef/);
  assert.match(indexSource, /window\.ContractReference \|\| window\.ContractRefManager/);
  assert.match(indexSource, /\['quick-ref', 'gc-ref', 'asb-ref', 'tracking-live-contract-ref'\]/);
  assert.doesNotMatch(indexSource, /dynamicRefGC|dynamicRefASB|suffixGC|suffixASB/);
});

test('production build copies the contract manager before the SPA fallback can handle requests', () => {
  assert.match(viteSource, /"contract-reference\.js"/);
  assert.match(indexSource, /installContractReferenceSafetyNet/);
  assert.match(indexSource, /globalObject\.ContractRefManager = fallbackManager/);
  assert.match(indexSource, /globalObject\.ContractReference = globalObject\.ContractReference \|\| fallbackManager/);
});

test('tab navigation tolerates missing reference and form auxiliaries', () => {
  assert.match(indexSource, /if \(!targetView\)/);
  assert.match(indexSource, /Navigation continued without URL synchronization/);
  assert.match(indexSource, /Form synchronization was skipped/);
  assert.match(indexSource, /typeof syncPrintPolicyClass === 'function'/);
});

test('tracking preserves the entered reference when the API fails', () => {
  assert.match(trackingSource, /contractInput\.value = contractRef/);
  assert.match(trackingSource, /La referencia se conserva para reintentar/);
  assert.match(trackingSource, /inputMessage\.dataset\.state = 'warning'/);
  assert.doesNotMatch(trackingSource, /clearTrackingContract\(`\$\{error\?\.message/);
});
