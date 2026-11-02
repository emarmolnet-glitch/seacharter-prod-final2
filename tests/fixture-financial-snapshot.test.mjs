import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8');
function setup(ok = true) {
  let stored;
  const window = {
    State: {}, dssFormState: {},
    buildFixtureRecapHTMLTemplate: state => `${state.fixtureFinancial.unitRateText}|${state.fixtureFinancial.totalFreightText}`,
    buildFixtureExecutiveReportHTML: async state => `EXEC:${state.freightSell}`,
  };
  vm.runInNewContext(source, { window, setTimeout, fetch: async (url, options) => {
    stored = JSON.parse(options.body); return { ok };
  } });
  return { window, stored: () => stored };
}
test('approved unit rates above 1000 remain unit rates and survive mutation and persistence', async () => {
  const ctx = setup();
  const input = { allInRateGross: 1234.56, cargoQty: 2000, nested: { value: 1 } };
  const snapshot = await ctx.window.captureFixtureFinancialSnapshot(input, 'B', true);
  input.allInRateGross = 3; input.nested.value = 2;
  ctx.window.dssFormState.allInRateGross = 7;
  assert.equal(snapshot.financial.unitRate, 1234.56);
  assert.equal(snapshot.financial.totalFreightGross, 2469120);
  assert.equal(snapshot.html, '1234.56|2,469,120');
  assert.equal(snapshot.executiveHTML, 'EXEC:1234.56');
  assert.equal(snapshot.state.nested, undefined);
  assert.ok(Object.isFrozen(snapshot.state));
  assert.deepEqual(ctx.stored().estimation.fixtureRecapSnapshot.financial, JSON.parse(JSON.stringify(snapshot.financial)));
});
test('failed persistence never publishes approved conditions', async () => {
  const ctx = setup(false);
  await assert.rejects(ctx.window.captureFixtureFinancialSnapshot({ allInRateGross: 42.37, cargoQty: 5000 }));
  assert.equal(ctx.window.State.fixtureRecapSnapshot, undefined);
});
test('missing or invalid approved amounts block capture', async () => {
  for (const allInRateGross of [undefined, NaN, 0, -1]) {
    await assert.rejects(setup().window.captureFixtureFinancialSnapshot({ allInRateGross, cargoQty: 5000 }));
  }
});
test('both HTML entry points render snapshot financial amounts without magnitude inference', () => {
  for (const file of ['index.html', 'decisiones.html']) {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('function buildFixtureRecapHTMLTemplate(state)');
    const end = html.indexOf('window.buildFixtureRecapHTMLTemplate =', start);
    const render = new Function('state', `const resolveFixtureRecapOperations = () => ({equipmentClause: [], loadRate: '5000', dischargeRate: '2000'}); ${html.slice(start, end)}; return buildFixtureRecapHTMLTemplate(state);`);
    const result = render({ cargoQty: 2000, allInRateGross: 9999, fixtureFinancial: { totalFreightGross: 2469120, unitRateText: '1234.56', totalFreightText: '2,469,120' } });
    assert.match(result, /1234\.56/);
    assert.match(result, /2,469,120/);
  }
});

test('snapshot histories are pruned before serialization, including nested copies', async () => {
  const ctx = setup();
  const old = { toJSON() { throw new Error('Previous snapshot must never be serialized'); } };
  const input = Object.freeze({ allInRateGross: 42.37, cargoQty: 5000,
    fixtureRecapSnapshot: old, nested: Object.freeze({ fixtureRecapSnapshot: old, value: 7 }) });
  const snapshot = await ctx.window.captureFixtureFinancialSnapshot(input, 'B', true);
  assert.equal(snapshot.state.fixtureRecapSnapshot, undefined);
  assert.equal(snapshot.state.nested, undefined);
  assert.equal(input.fixtureRecapSnapshot, old);
});

test('repeated approvals do not accumulate history or grow the saved payload', async () => {
  const ctx = setup();
  const lengths = [];
  for (let i = 0; i < 15; i++) {
    const snapshot = await ctx.window.captureFixtureFinancialSnapshot({ ...ctx.window.State,
      allInRateGross: 42.37, cargoQty: 5000 }, 'B', true);
    assert.equal(snapshot.state.fixtureRecapSnapshot, undefined);
    lengths.push(JSON.stringify(ctx.stored()).length);
  }
  assert.equal(new Set(lengths).size, 1);
});

test('failed persistence preserves the previously approved session snapshot', async () => {
  const ctx = setup(false);
  const previous = Object.freeze({ html: 'Already approved' });
  ctx.window.State.fixtureRecapSnapshot = previous;
  await assert.rejects(ctx.window.captureFixtureFinancialSnapshot({ ...ctx.window.State,
    allInRateGross: 42.37, cargoQty: 5000 }));
  assert.equal(ctx.window.State.fixtureRecapSnapshot, previous);
});

test('capture yields to browser timers and keeps dates while excluding DOM/framework objects and accessors', async () => {
  const ctx = setup();
  class FrameworkState { get huge() { throw new Error('Must not traverse framework'); } }
  const record = { allInRateGross: 42.37, cargoQty: 5000, cancellingDate: new Date('2026-11-02T00:00:00Z'),
    framework: new FrameworkState(), nested: { value: 7 }, toJSON() { throw new Error('Must not invoke hooks'); } };
  Object.defineProperty(record, 'expensiveGetter', { enumerable: true, get() { throw new Error('Must not invoke getters'); } });
  let timerRan = false;
  const pending = ctx.window.captureFixtureFinancialSnapshot(record, 'B', true);
  setTimeout(() => { timerRan = true; }, 0);
  const snapshot = await pending;
  assert.equal(timerRan, true);
  assert.equal(snapshot.state.cancellingDate, '2026-11-02T00:00:00.000Z');
  assert.equal(snapshot.state.framework, undefined);
  assert.equal(snapshot.state.expensiveGetter, undefined);
  assert.equal(snapshot.state.nested, undefined);
});

test('massive caches, cycles and deep objects are ignored instead of failing the contract capture', async () => {
  const cyclic = {}; cyclic.self = cyclic;
  let deep = {}; for (let i = 0; i < 40; i++) deep = { child: deep };
  const wide = Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [`k${i}`, i]));
  const cases = [cyclic, deep, { large: 'x'.repeat(500001) }, { large: new Array(2001).fill(0) }, wide];
  for (const extra of cases) {
    const ctx = setup();
    const snapshot = await ctx.window.captureFixtureFinancialSnapshot({ allInRateGross: 42.37, cargoQty: 5000, extra }, 'B', true);
    assert.equal(snapshot.state.extra, undefined);
    assert.ok(JSON.stringify(ctx.stored()).length < 2000);
  }
});

test('shared references cannot amplify JSON serialization because unlisted graphs are never visited', async () => {
  const ctx = setup();
  let shared = { value: 'approved' };
  for (let i = 0; i < 18; i++) shared = { left: shared, right: shared };
  const snapshot = await ctx.window.captureFixtureFinancialSnapshot({ allInRateGross: 42.37, cargoQty: 5000, shared });
  assert.equal(snapshot.state.shared, undefined);
  assert.ok(JSON.stringify(ctx.stored()).length < 2000);
});

test('oversized executive markup is rejected before publication or persistence', async () => {
  const ctx = setup();
  ctx.window.buildFixtureExecutiveReportHTML = async () => 'x'.repeat(1000001);
  await assert.rejects(ctx.window.captureFixtureFinancialSnapshot({ allInRateGross: 42.37, cargoQty: 5000 }, 'B', true), /límites/);
  assert.equal(ctx.window.State.fixtureRecapSnapshot, undefined);
  assert.equal(ctx.stored(), undefined);
});

test('selection reads only approved fields, never enumerates source keys and flattens vessel identity', async () => {
  const ctx = setup();
  const forbidden = new Proxy({}, { get() { throw new Error('Must not read garbage'); }, ownKeys() { throw new Error('Must not enumerate garbage'); } });
  const original = { allInRateGross: 48.7, cargoQty: 5000, pol: 'Bilbao', pod: 'Lima',
    vessel: { name: 'MV CLEAN', type: 'Pneumatic Cement Carrier', dwt: 28750, history: forbidden },
    mapRoute: forbidden, weatherPolygons: forbidden, portCache: forbidden, stowagePlan: forbidden };
  Object.defineProperty(original, 'freightTerms', { enumerable: true, get() { throw new Error('Must not invoke even allowed accessors'); } });
  const input = new Proxy(original, { ownKeys() { throw new Error('Must not enumerate global state'); } });
  const snapshot = await ctx.window.captureFixtureFinancialSnapshot(input, 'B', true);
  assert.equal(snapshot.state.vesselName, 'MV CLEAN');
  assert.equal(snapshot.state.vesselType, 'Pneumatic Cement Carrier');
  assert.equal(snapshot.state.dwt, 28750);
  assert.equal(snapshot.state.pol, 'Bilbao');
  for (const key of ['vessel', 'mapRoute', 'weatherPolygons', 'portCache', 'stowagePlan', 'freightTerms']) assert.equal(snapshot.state[key], undefined);
  for (const [key, value] of Object.entries(snapshot.state)) {
    if (key !== 'fixtureFinancial') assert.ok(value === null || typeof value !== 'object');
  }
  assert.ok(JSON.stringify(snapshot.state).length < 1024);
});

test('selection preserves source precedence and rejects an oversized allowed field without touching approval', async () => {
  const ctx = setup();
  const state = ctx.window.selectFixtureRecapState({ pol: 'Bilbao', allInRateGross: 35 }, { pol: 'Lima', allInRateGross: 48.7 });
  assert.equal(state.pol, 'Lima');
  assert.equal(state.allInRateGross, 48.7);
  const previous = Object.freeze({ html: 'approved' });
  ctx.window.State.fixtureRecapSnapshot = previous;
  await assert.rejects(ctx.window.captureFixtureFinancialSnapshot({ allInRateGross: 48.7, cargoQty: 5000, pol: 'x'.repeat(513) }), /campo pol/);
  assert.equal(ctx.window.State.fixtureRecapSnapshot, previous);
  assert.equal(ctx.stored(), undefined);
});

test('clean state retains the financial, operational and vessel fields consumed by both actual Recap templates', async () => {
  for (const file of ['index.html', 'decisiones.html']) {
    const ctx = setup();
    const entry = fs.readFileSync(file, 'utf8');
    const operationsStart = entry.indexOf('function resolveFixtureRecapOperations(');
    const start = operationsStart >= 0 ? operationsStart : entry.indexOf('function buildFixtureRecapHTMLTemplate(');
    const end = entry.indexOf('window.buildFixtureRecapHTMLTemplate =', start);
    ctx.window.buildFixtureRecapHTMLTemplate = new Function('state', `${entry.slice(start, end)}; return buildFixtureRecapHTMLTemplate(state);`);
    const snapshot = await ctx.window.captureFixtureFinancialSnapshot({
      estimationId: 'fixture-27', pol: 'Bilbao', pod: 'Lima', cargoQty: 5000, allInRateGross: 48.7,
      vesselName: 'MV CLEAN', dwt: 28750, commodity: 'Bulk cement', productoEspecifico: 'Bulk cement',
      loadingMethod: 'Pneumatic', loadRate: 5000, dischargeRate: 3000, demurrageRate: 17500,
      jwlaRiskActive: true, laycanDaysLeft: 12, portCache: new Array(10000).fill('ignored'),
    }, 'B', true);
    for (const text of ['BILBAO', 'LIMA', 'MV CLEAN', '28,750', '48.70', '243,500', '17,500', 'JWC WAR RISK']) assert.ok(snapshot.html.includes(text), `${file}: missing ${text}`);
    assert.equal(snapshot.state.estimationId, 'fixture-27');
    assert.equal(snapshot.state.portCache, undefined);
    assert.ok(JSON.stringify(snapshot.state).length < 2048);
  }
});
