import '../fixture-operating-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = (fs.readFileSync('fixture-operating-profile.js', 'utf8') + '\n' + fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8'));
const activeId = '12345678-1234-4567-89ab-123456789abc';
const foreignId = 'abcdef12-3456-4789-abcd-abcdef123456';
function setup(state) {
  const requests = [];
  const window = { State: state, buildFixtureRecapHTMLTemplate: state => `APPROVED:${state.vesselType}:${state.loadRate}`,
    buildFixtureExecutiveReportHTML: async () => 'APPROVED ANNEX' };
  vm.runInNewContext(script, { window, setTimeout, fetch: async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) });
    return { ok: true };
  } });
  const capture = window.captureFixtureFinancialSnapshot;
  window.captureFixtureFinancialSnapshot = (state, ...args) => capture({ pol: 'Bilbao', pod: 'Lima', ...state }, ...args);
  return { window, requests };
}

for (const identity of [
  { estimationId: 'current', activeReference: activeId },
  { estimationId: 'current', id: activeId },
  { id: 'current', estimationId: activeId },
  { estimationId: 'current', activeReference: activeId.toUpperCase() },
]) {
  test(`real UUID wins over temporary alias: ${JSON.stringify(identity)}`, async () => {
    const { window, requests } = setup({ ...identity, vesselType: 'Cementero', loadRate: 1110, allInRateGross: 48.7, cargoQty: 5000 });
    window.dssFormState = { estimationId: 'current', pol: 'Bilbao', loadRate: 1110, allInRateGross: 48.7, cargoQty: 5000 };
    const prepared = window.prepareCurrentFixtureRecapState();
    assert.equal(prepared.estimationId, activeId);
    const snapshot = await window.captureFixtureFinancialSnapshot(prepared, 'B', true);
    assert.equal(snapshot.state.estimationId, activeId);
    assert.equal(requests[0].url, `/api/estimations/${activeId}`);
    assert.equal(requests[0].payload.estimation.estimationId, activeId);
    assert.equal(requests[0].payload.estimation.fixtureRecapSnapshot.state.estimationId, activeId);
    assert.equal(window.getFixtureRecapSnapshot({ estimationId: 'current', activeReference: activeId }, snapshot), snapshot);
    assert.doesNotThrow(() => window.activateFixtureRecapSnapshot(snapshot));
    // Switching ID representation and recalculating fields cannot change the approved document.
    window.State = { estimationId: activeId, pod: 'LIMA', loadRate: 1110.00001, allInRateGross: 48.700001, cargoType: 'Refreshed label' };
    assert.equal(window.getFixtureRecapSnapshot(window.State, snapshot), snapshot);
    assert.equal(snapshot.html, 'APPROVED:Cementero:1110');
    window.State = { estimationId: 'current', activeReference: foreignId };
    assert.equal(window.getFixtureRecapSnapshot(window.State, snapshot), null);
    assert.throws(() => window.activateFixtureRecapSnapshot(snapshot), /estimación actual cambió/);
  });
}

test('capture binds current to the UUID before asynchronous work and never republishes it to another estimation', async () => {
  const { window, requests } = setup({ estimationId: 'current', activeReference: activeId });
  const pending = window.captureFixtureFinancialSnapshot({ estimationId: 'current', allInRateGross: 48.7, cargoQty: 5000 }, 'B', true);
  window.State = { estimationId: 'current', activeReference: foreignId };
  const snapshot = await pending;
  assert.equal(requests[0].url, `/api/estimations/${activeId}`);
  assert.equal(snapshot.state.estimationId, activeId);
  assert.equal(window.State.fixtureRecapSnapshot, undefined);
  assert.equal(window.getFixtureRecapSnapshot(window.State, snapshot), null);
});

test('a concrete foreign UUID is never treated as an alias of the active UUID', () => {
  const { window } = setup({ estimationId: 'current', activeReference: activeId });
  const snapshot = { version: 2, state: { estimationId: foreignId }, html: 'FOREIGN', executiveHTML: '' };
  assert.equal(window.getFixtureRecapSnapshot(window.State, snapshot), null);
});

for (const entry of ['index.html', 'decisiones.html']) {
  test(`${entry}: Option B prints the approved Recap and annex after ID normalization and live recalculation`, async () => {
    const { window } = setup({ estimationId: 'current', activeReference: activeId, vesselType: 'Cementero', allInRateGross: 48.7, cargoQty: 5000 });
    const snapshot = await window.captureFixtureFinancialSnapshot(window.prepareCurrentFixtureRecapState(), 'B', true);
    window.activateFixtureRecapSnapshot(snapshot);
    window.State.pod = 'Updated port label';
    window.State.dischargeRate = 5184.00001;
    let printed;
    window.printFixtureRecap = html => { printed = html; };
    const source = fs.readFileSync(entry, 'utf8');
    const start = source.indexOf('async function generateFixtureRecapPDF(options');
    const end = source.indexOf('window.generateFixtureRecapPDF =', start);
    const context = vm.createContext({ window, getDSSCurrentState: () => window.getCurrentFixtureRecapState() });
    vm.runInContext(`${source.slice(start, end)}; window.generateFixtureRecapPDF = generateFixtureRecapPDF;`, context);
    await window.generateFixtureRecapPDF({ fixtureRecapSnapshot: snapshot, includeExecutiveReport: true });
    assert.equal(printed, `<div>${snapshot.html}${snapshot.executiveHTML}</div>`);
  });
}
