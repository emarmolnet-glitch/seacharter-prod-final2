import '../fixture-operating-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolveReportVessel } from '../src/report-vessel.mjs';
import { buildVoyageStowagePlan } from '../src/voyage-stowage-builder.mjs';

for (const file of ['index.html', 'decisiones.html']) {
  function setup() {
    const html = fs.readFileSync(file, 'utf8');
    const window = { State: { id: 'cement-current', vessel_type: 'Pneumatic Cement Carrier', vesselName: 'MV CEMENT',
      pol: 'Bilbao', pod: 'Lima', cargoQty: 5000, commodity: 'Cemento a granel', loadingMethod: 'Pneumatic',
      loadRate: 1110, dischargeRate: 5184, allInRateGross: 48.7 },
      dssBaseActualState: { id: 'old', vesselType: 'Geared Bulker', pol: 'OLD POL', pod: 'OLD POD', loadRate: 2000 },
      dssFormState: { id: 'old', vesselType: 'Geared Bulker', commodity: 'Big Bags', pol: 'OLD POL', pod: 'OLD POD', loadRate: 2000 },
    };
    const context = vm.createContext({ window, setTimeout, fetch: async () => ({ ok: true }),
      document: { getElementById: () => { throw new Error('Renderer must not read stale inputs'); } },
      State: { vesselType: 'Geared Bulker', loadRate: 2000, dischargeRate: 2000 },
    });
    vm.runInContext((fs.readFileSync('fixture-operating-profile.js', 'utf8') + '\n' + fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8')), context);
    const start = html.indexOf('function resolveFixtureRecapOperations(');
    const end = html.indexOf('window.buildFixtureRecapHTMLTemplate =', start);
    vm.runInContext(`${html.slice(start, end)}; window.resolveFixtureRecapOperations = resolveFixtureRecapOperations; window.buildFixtureRecapHTMLTemplate = buildFixtureRecapHTMLTemplate;`, context);
    const getter = html.indexOf('function getDSSCurrentState()');
    const getterEnd = html.indexOf('window.getDSSCurrentState = getDSSCurrentState;', getter);
    vm.runInContext(`${html.slice(getter, getterEnd)}; window.getDSSCurrentState = getDSSCurrentState;`, context);
    const exportStart = html.indexOf('async function generateFixtureRecapPDF(options');
    const exportEnd = html.indexOf('window.generateFixtureRecapPDF =', exportStart);
    vm.runInContext(`${html.slice(exportStart, exportEnd)}; window.generateFixtureRecapPDF = generateFixtureRecapPDF;`, context);
    return { window, html, context };
  }
  test(`${file}: current estimation survives aliases, foreign DSS caches and hostile audit changes end to end`, async () => {
    const { window } = setup();
    const prepared = window.prepareCurrentFixtureRecapState({ pol: 'WRONG', pod: 'WRONG', vesselType: 'Geared Bulker',
      commodity: 'Big Bags', loadingMethod: 'Sacas', loadRate: 2000, dischargeRate: 2000, specialClauses: 'CRANES', allInRateGross: 48.7 });
    assert.equal(prepared.vesselType, 'Pneumatic Cement Carrier (Gearless / Sealed Holds)');
    assert.equal(prepared.pol, 'Bilbao');
    assert.equal(prepared.pod, 'Lima');
    assert.equal(prepared.loadRate, 1110);
    assert.equal(prepared.dischargeRate, 5184);
    assert.equal(prepared.specialClauses, undefined);
    window.buildFixtureExecutiveReportHTML = async state => {
      assert.equal(state.operationalProfile, 'PNEUMATIC');
      assert.equal(resolveReportVessel(state).operationalType, 'Pneumatic Cement Carrier (Gearless / Sealed Holds)');
      const plan = buildVoyageStowagePlan(state);
      assert.equal(plan.vesselModel.profile, 'PNEUMATIC');
      return plan.executiveJustification.join(' ');
    };
    const snapshot = await window.captureFixtureFinancialSnapshot(prepared, 'B', true);
    assert.match(snapshot.html, /PNEUMATIC EQUIPMENT & SEALED HOLDS/);
    assert.match(snapshot.html, /1,110 METRIC TONS/);
    assert.match(snapshot.html, /5,184 METRIC TONS/);
    assert.doesNotMatch(snapshot.html, /cranes?|grabs?|big bags|2,000|OLD POL|OLD POD/i);
    assert.equal(window.dssBaseActualState.fixtureRecapSnapshot, undefined);
    assert.equal(window.getFixtureRecapSnapshot(window.getDSSCurrentState(), snapshot), snapshot);
    assert.equal(window.getFixtureRecapSnapshot(window.getDSSCurrentState(), { ...snapshot, version: 1 }), null);
    let printed;
    window.printFixtureRecap = html => { printed = html; };
    await window.generateFixtureRecapPDF({ fixtureRecapSnapshot: snapshot, includeExecutiveReport: true });
    assert.match(printed, /PNEUMATIC EQUIPMENT & SEALED HOLDS/);
    assert.doesNotMatch(printed, /big bags|2,000|cranes?/i);
    window.State.pod = 'NEW POD';
    assert.equal(window.getFixtureRecapSnapshot(window.getDSSCurrentState(), snapshot), snapshot);
    printed = undefined;
    await window.generateFixtureRecapPDF({ fixtureRecapSnapshot: snapshot, includeExecutiveReport: true });
    assert.equal(printed, `<div>${snapshot.html}${snapshot.executiveHTML}</div>`);
    window.State = { id: 'another', pol: 'Other' };
    assert.equal(window.getFixtureRecapSnapshot(window.getDSSCurrentState(), snapshot), null);
  });
  test(`${file}: no global rate fallback and missing pneumatic rates stay TBA`, () => {
    const { window } = setup();
    const state = { vesselType: 'Cementero', cargoQty: 5000, pol: 'Bilbao', pod: 'Lima' };
    const output = window.buildFixtureRecapHTMLTemplate(state);
    assert.match(output, /LOADING RATE:[\s\S]*?TBA METRIC TONS/);
    assert.match(output, /DISDISCH RATE:[\s\S]*?TBA METRIC TONS/);
    assert.doesNotMatch(output, /2,000|cranes?|grabs?|big bags/i);
  });
  test(`${file}: exactly one DSS reader and form updates retain current commercial identity`, () => {
    const { html } = setup();
    assert.equal((html.match(/function getDSSCurrentState\(/g) || []).length, 1);
    assert.match(html, /dssFormState = \{\s*\.\.\.window.getCurrentFixtureRecapState\(\)/);
  });
}


test('definitive approval keeps the single durable snapshot save and never overwrites a generic current record', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const source = html.slice(html.indexOf('async function fijarCondicionesDefinitivas()'), html.indexOf('window.fijarCondicionesDefinitivas ='));
  assert.match(source, /captureFixtureFinancialSnapshot/);
  assert.doesNotMatch(source, /fetch\(['"]\/api\/estimations\/current/);
});
