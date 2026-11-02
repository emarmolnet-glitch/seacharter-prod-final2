import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for (const file of ['index.html', 'decisiones.html', 'src/DecisionSupportModule.js']) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('async function generarFixtureRecapOpcionB()');
  const end = text.indexOf(file.endsWith('.js') ? "\nif (typeof window !== 'undefined')" : "\n        if (typeof window !== 'undefined') {\n            window.solicitarAuditoriaMadre", start);
  const source = text.slice(start, end);
  function setup(fail = false) {
    const steps = [], inputs = new Map();
    let captures = 0, updates = 0, prints = 0, approved;
    const snapshot = { state: { allInRateGross: 48.7 }, html: 'approved' };
    let resolveCapture;
    const captured = new Promise(resolve => { resolveCapture = resolve; });
    const window = { State: { loadRate: 5000, dischargeRate: 2000 }, dssBaseActualState: {}, dssFormState: {},
      madreUltimaAuditoria: { modificaciones_recap: { allInRateGross: 48.7, loadRate: 5000, dischargeRate: 2000 } },
      captureFixtureFinancialSnapshot: async state => { approved = state; captures++; await captured; if (fail) throw new Error('Save failed'); return snapshot; },
      sincronizarFormularioDesdeEstado() { steps.push('sync'); },
      actualizarDesdeFormulario() { updates++; steps.push('update'); context.generarFixtureRecapOpcionB(); },
      generateFixtureRecapPDF: async options => { prints++; assert.equal(options.fixtureRecapSnapshot, snapshot); },
      showToast() {},
    };
    const context = vm.createContext({ window, console: { error() {}, warn() {} },
      setTimeout(callback, delay) { assert.equal(delay, 20); steps.push('yield'); return setTimeout(callback, 0); },
      document: { getElementById(id) {
        if (!inputs.has(id)) inputs.set(id, { value: '', dispatchEvent() { throw new Error('Synthetic event storm'); } });
        return inputs.get(id);
      } },
    });
    const captureStub = window.captureFixtureFinancialSnapshot;
    vm.runInContext(fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8'), context);
    window.captureFixtureFinancialSnapshot = captureStub;
    vm.runInContext(source, context);
    return { window, context, inputs, steps, resolveCapture,
      counts: () => ({ captures, updates, prints }), approved: () => approved };
  }
  test(`${file}: strategic fields update silently once, with yielding and re-entry protection`, async () => {
    const ctx = setup();
    const first = ctx.context.generarFixtureRecapOpcionB();
    await ctx.context.generarFixtureRecapOpcionB();
    assert.equal(ctx.counts().captures, 1);
    ctx.resolveCapture();
    await first;
    assert.deepEqual(ctx.counts(), { captures: 1, updates: 1, prints: 1 });
    assert.deepEqual(ctx.steps, ['yield', 'sync', 'yield', 'update']);
    assert.equal(ctx.inputs.get('freight-sell').value, 48.7);
    assert.equal(ctx.inputs.get('input-loadRate').value, 5000);
    assert.equal(ctx.inputs.get('input-dischargeRate').value, 2000);
    assert.equal(ctx.window.fixtureRecapOptionBPending, false);
    await ctx.context.generarFixtureRecapOpcionB();
    assert.deepEqual(ctx.counts(), { captures: 2, updates: 2, prints: 2 });
  });
  test(`${file}: selects contract data before merging global state`, async () => {
    const ctx = setup();
    const garbage = new Proxy({}, { get() { throw new Error('Garbage must not be read'); } });
    ctx.window.State = new Proxy({ pol: 'Bilbao', cargoQty: 5000, allInRateGross: 35, route: garbage }, {
      ownKeys() { throw new Error('Global state must not be spread'); },
    });
    ctx.resolveCapture();
    await ctx.context.generarFixtureRecapOpcionB();
    assert.equal(ctx.counts().prints, 1);
    assert.equal(ctx.approved().route, undefined);
    assert.equal(ctx.approved().pol, 'Bilbao');
    assert.equal(ctx.approved().cargoQty, 5000);
    assert.equal(ctx.approved().allInRateGross, 48.7);
  });
  test(`${file}: failed capture releases the guard and skips DOM changes and printing`, async () => {
    const ctx = setup(true);
    ctx.resolveCapture();
    await ctx.context.generarFixtureRecapOpcionB();
    assert.deepEqual(ctx.counts(), { captures: 1, updates: 0, prints: 0 });
    assert.equal(ctx.inputs.size, 0);
    assert.equal(ctx.window.fixtureRecapOptionBPending, false);
  });
}
