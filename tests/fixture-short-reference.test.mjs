import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../fixture-operating-profile.js';

const client = readFileSync('public/fixture-reference-client.js', 'utf8');
const snapshotSource = readFileSync('public/fixture-financial-snapshot.js', 'utf8');

test('async reference creation shares one allocation and publishes only the server reference', async () => {
  let finish;
  let requests = 0;
  const events = [];
  const root = {
    State: {}, crypto: { randomUUID: () => 'internal-idempotency-key' },
    fetch: async (url, options) => {
      requests++;
      assert.equal(url, '/api/fixture-reference');
      assert.equal(JSON.parse(options.body).identity, 'internal-idempotency-key');
      return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ reference: 'RDM/2026-6025' }) }); });
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent: event => events.push(event),
  };
  vm.runInNewContext(client, root);
  assert.equal(root.FixtureReferenceService.create(), '');
  assert.equal(root.FixtureReferenceService.create(), '');
  assert.equal(requests, 1);
  assert.equal(root.State.activeReference, undefined);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(root.State.estimationId, 'RDM/2026-6025');
  assert.equal(root.State.activeReference, 'RDM/2026-6025');
  assert.equal(events[0].detail.reference, 'RDM/2026-6025');
});

test('short reference survives approval, encoded PUT and legacy/current snapshot aliases', async () => {
  const legacy = '12345678-1234-4567-89ab-123456789abc';
  const ref = 'RDM/2026-6025';
  let savedURL;
  const window = {
    State: { estimationId: 'current', activeReference: legacy },
    FixtureReferenceService: { ensure: async identity => { assert.equal(identity, legacy); return ref; } },
    buildFixtureRecapHTMLTemplate: state => `${state.activeReference}|${state.pol}|${state.pod}`,
  };
  vm.runInNewContext(snapshotSource, { window, setTimeout, fetch: async (url, options) => {
    savedURL = url;
    const data = JSON.parse(options.body).estimation;
    assert.equal(data.estimationId, ref);
    assert.equal(data.fixtureRecapSnapshot.state.activeReference, ref);
    return { ok: true };
  }});
  const snapshot = await window.captureFixtureFinancialSnapshot({ ...window.State, pol: 'Bilbao', pod: 'Lima', cargoQty: 5000, allInRateGross: 35 });
  assert.equal(savedURL, '/api/estimations/RDM%2F2026-6025');
  assert.equal(window.State.activeReference, ref);
  assert.equal(window.getFixtureRecapSnapshot({ estimationId: 'current', activeReference: ref }, snapshot), snapshot);
  assert.equal(window.getFixtureRecapSnapshot({ estimationId: legacy }, snapshot), snapshot);
  assert.equal(window.getFixtureRecapSnapshot({ estimationId: 'RDM/2026-6026' }, snapshot), null);
  assert.equal(window.getFixtureRecapSnapshot({ estimationId: ref, pol: 'live edit' }, snapshot), snapshot);
  assert.equal(snapshot.html, `${ref}|Bilbao|Lima`);
});

test('cement, bags, pure bulk and RoRo use isolated equipment clauses', () => {
  const resolve = globalThis.FixtureOperatingProfile.resolve;
  for (const [state, expected] of [
    [{ vesselType: 'Cementero', commodity: 'Big bags', shipProfile: 'Handysize' }, 'PNEUMATIC'],
    [{ vesselType: 'Handysize', commodity: 'Cemento' }, 'PNEUMATIC'],
    [{ vesselType: 'Bulk Carrier', loadingMethod: 'Sacas' }, 'GEARED'],
    [{ vesselType: 'Bulk Carrier', loadingMethod: 'Free Flow' }, 'GEARLESS'],
    [{ vesselType: 'RoRo', commodity: 'Cement' }, 'RORO'],
  ]) {
    const operation = resolve(state);
    assert.equal(operation.operationalProfile, expected);
    if (expected === 'PNEUMATIC' || expected === 'GEARLESS') assert.doesNotMatch(operation.equipmentClause.join(' '), /cranes?|SWL|big bags|2,000/i);
  }
});

test('an in-flight allocation cannot replace a different dossier selected meanwhile', async () => {
  let finish;
  const root = {
    State: { activeReference: 'RDM/2026-6025' },
    crypto: { randomUUID: () => 'new-request' },
    fetch: () => new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ reference: 'RDM/2026-6026' }) }); }),
  };
  vm.runInNewContext(client, root);
  root.FixtureReferenceService.create();
  root.State.activeReference = 'RDM/2026-7000';
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(root.State.activeReference, 'RDM/2026-7000');
});
