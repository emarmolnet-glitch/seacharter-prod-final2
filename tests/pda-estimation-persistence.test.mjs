import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const functionSource = await readFile(new URL('../netlify/functions/pda-estimations.ts', import.meta.url), 'utf8');
const schemaSource = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');

test('PDA persistence API stores a structured idempotent estimation', () => {
  assert.match(schemaSource, /export const pdaEstimations = pgTable/);
  assert.match(schemaSource, /pdaTotal: doublePrecision\("pda_total"\)/);
  assert.match(schemaSource, /polBreakdown: jsonb\("pol_breakdown"\)/);
  assert.match(schemaSource, /podBreakdown: jsonb\("pod_breakdown"\)/);
  assert.match(functionSource, /netlifyDb as db/);
  assert.match(functionSource, /target: pdaEstimations\.calculationKey/);
  assert.match(functionSource, /PDA total must equal POL plus POD/);
  assert.match(functionSource, /path: "\/api\/pda-estimations"/);
});

test('parametric PDA results persist automatically and skip duplicate writes', async () => {
  const persistenceBlock = indexSource.match(
    /function getPdaPersistenceIdentity\(\)[\s\S]*?window\.schedulePdaEstimationPersistence = schedulePdaEstimationPersistence;/,
  )?.[0];
  assert.ok(persistenceBlock, 'PDA persistence helpers must be present');

  const elements = {
    'pda-pol': { value: '12000', dataset: { calculationMode: 'global-estimate', basePda: '11500' } },
    'pda-pod': { value: '14000', dataset: { calculationMode: 'global-estimate', basePda: '13500' } },
    'port-pol': { value: 'Bilbao' },
    'port-pod': { value: 'Rotterdam' },
    'vessel-name': { value: 'CORE PRO TEST' },
    'cargo-qty': { value: '20000' },
    'cargo-type': { value: 'Dry Bulk' },
    'vessel-dwt': { value: '25000' },
    'vessel-identity-gt': { value: '15000' },
    'vessel-loa': { value: '175' },
    'rate-load': { value: '5000' },
    'rate-disch': { value: '4000' },
  };
  const requests = [];
  class MockCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  const window = {
    CalculatedState: { calculationId: 'calc-42', sessionId: 'session-42' },
    GlobalStore: { calculatorVessel: { imo: '1234567' } },
    State: {},
    sessionStorage: { getItem: () => null, setItem: () => {} },
    crypto: { randomUUID: () => 'browser-id' },
    dispatchEvent: () => {},
  };
  const context = {
    window,
    State: window.State,
    document: { getElementById: id => elements[id] || null },
    getPipelineSessionContext: () => ({ sessionId: 'session-42' }),
    getPortPdaBreakdown: side => side === 'pol'
      ? [{ item: 'POL dues', amount: 12000 }]
      : [{ item: 'POD dues', amount: 14000 }],
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 201, json: async () => ({ success: true, estimation: { id: 'saved' } }) };
    },
    CustomEvent: MockCustomEvent,
    setTimeout,
    clearTimeout,
    console,
    Date,
    Math,
    JSON,
    Error,
    Promise,
  };

  vm.runInNewContext(`${persistenceBlock}\nwindow.schedulePdaEstimationPersistence('test', 0);`, context);
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/pda-estimations');
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.calculationKey, 'estimation:calc-42');
  assert.equal(payload.pdaTotal, 26000);
  assert.equal(payload.pdaPol, 12000);
  assert.equal(payload.pdaPod, 14000);
  assert.deepEqual(payload.polBreakdown, [{ item: 'POL dues', amount: 12000 }]);
  assert.deepEqual(payload.podBreakdown, [{ item: 'POD dues', amount: 14000 }]);

  vm.runInNewContext("window.schedulePdaEstimationPersistence('test', 0);", context);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(requests.length, 1, 'unchanged PDA values must not create duplicate writes');
});

test('runEngine persists the operational PDA total immediately after publishing its breakdown', () => {
  assert.match(
    indexSource,
    /State\.pdaPolBreakdown = polBreakdown;\n\s*State\.pdaPodBreakdown = podBreakdown;\n\s*schedulePdaEstimationPersistence\('operational-pda-total', 0\);/,
  );
  assert.match(indexSource, /pdaPolIncrementalCost:/);
  assert.match(indexSource, /pdaPodIncrementalCost:/);
  assert.match(indexSource, /pdaIncrementalCost:/);
});
