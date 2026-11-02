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
  vm.runInNewContext(source, { window, fetch: async (url, options) => {
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
  assert.equal(snapshot.state.nested.value, 1);
  assert.ok(Object.isFrozen(snapshot.state.nested));
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
  assert.equal(snapshot.state.nested.fixtureRecapSnapshot, undefined);
  assert.equal(snapshot.state.nested.value, 7);
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
