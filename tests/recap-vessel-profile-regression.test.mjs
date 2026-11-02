import '../fixture-operating-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveReportVessel } from '../src/report-vessel.mjs';
import { buildVoyageStowagePlan } from '../src/voyage-stowage-builder.mjs';

const require = createRequire(import.meta.url);
const compiled = transformSync(fs.readFileSync('src/components/VisualStowagePlan.jsx', 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
const { VisualStowagePlan, resolveVesselProfile } = module.exports;
const window = {};
vm.runInNewContext((fs.readFileSync('fixture-operating-profile.js', 'utf8') + '\n' + fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8')), { window, setTimeout });

test('approved cement type survives cleaning and overrides stale nested vessel and class', () => {
  const input = { vesselType: 'Pneumatic Cement Carrier', vessel: { type: 'Handysize' }, class: 'Handysize', shipProfile: 'Handysize', cargoQty: 5000 };
  for (const state of [input, window.selectFixtureRecapState(input)]) {
    const vessel = resolveReportVessel(state);
    assert.equal(vessel.type, 'Pneumatic Cement Carrier (Gearless / Sealed Holds)');
    const plan = buildVoyageStowagePlan({ ...state, vesselType: vessel.type });
    assert.equal(plan.vesselModel.profile, 'PNEUMATIC');
    assert.equal(plan.vesselModel.type, vessel.type);
    assert.equal(plan.weatherDeck.totalWeightTons, 0);
    assert.equal(plan.holds.reduce((sum, hold) => sum + hold.totalWeightTons, 0), 5000);
    const html = renderToStaticMarkup(React.createElement(VisualStowagePlan, { vesselType: vessel.type, stowagePlan: plan }));
    assert.match(html, /PNEUMATIC CEMENT CARRIER \(GEARLESS/);
    assert.match(html, /Bodega Sellada/);
    assert.doesNotMatch(html, /id="deck-cranes"|HANDYSIZE \/ BULK CARRIER/);
    assert.doesNotMatch(plan.executiveJustification.join(' '), /compatible con grúas/);
  }
});

test('cement keywords and RoRo aliases select the same technical and graphical profile', () => {
  for (const [type, expected] of [['Pneumatic', 'PNEUMATIC'], ['Cement Carrier', 'PNEUMATIC'], ['RoRo', 'RORO'], ['Roll-on / Roll-off', 'RORO'], ['Ro-Ro', 'RORO']]) {
    assert.equal(resolveVesselProfile(type, 'Handysize'), expected);
    const plan = buildVoyageStowagePlan({ vesselType: type, class: 'Handysize', cargoQty: 5000 });
    assert.equal(plan.vesselModel.profile, expected);
    const html = renderToStaticMarkup(React.createElement(VisualStowagePlan, { vesselType: type, stowagePlan: plan }));
    assert.doesNotMatch(html, /id="deck-cranes"/);
    if (expected === 'RORO') assert.match(html, /id="roro-horizontal-decks"/);
  }
  assert.equal(resolveVesselProfile('Handysize', 'Pneumatic Cement Carrier'), 'HANDYSIZE');
});

test('later nested defaults and empty fields cannot replace the selected Recap identity', () => {
  const recap = { vesselName: 'MV TBN', vesselType: 'Pneumatic Cement Carrier', cargoQty: 5000 };
  const defaults = { vessel: { name: 'MV GEARED BULKER', type: 'Handysize' } };
  for (const sources of [
    [recap, defaults],
    [defaults, recap],
    [recap, { vesselName: '', vesselType: ' ', ...defaults }],
    [recap, { vesselName: 'MV GEARED BULKER', vesselType: 'Handysize' }],
  ]) {
    const clean = window.selectFixtureRecapState(...sources);
    assert.equal(clean.vesselName, recap.vesselName);
    assert.equal(clean.vesselType, recap.vesselType);
    assert.equal(resolveReportVessel(clean).name, 'MV TBN');
  }
  assert.equal(resolveReportVessel({ ...recap, vessel: { name: 'MV RESIDUAL', type: 'Handysize' } }).name, 'MV TBN');
  const updated = window.selectFixtureRecapState(recap, { vesselName: 'MV CEMENT STAR', vesselType: 'RoRo' });
  assert.equal(updated.vesselName, 'MV CEMENT STAR');
  assert.equal(updated.vesselType, 'RoRo');
});

test('full executive report uses the clean cement Recap despite live Handysize state and a stale plan', async () => {
  const dependencies = Object.fromEntries(await Promise.all(
    ['report-vessel.mjs', 'voyage-stowage-builder.mjs', 'dry-bulk-clause-matrix.mjs'].map(async file => [file, await import(`../src/${file}`)]),
  ));
  const modalCode = transformSync(fs.readFileSync('src/components/VoyageExecutiveReportModal.jsx', 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
  const modalModule = { exports: {} };
  const modalRequire = specifier => {
    if (specifier === './VisualStowagePlan.jsx') return module.exports;
    if (specifier.startsWith('../')) return dependencies[specifier.slice(3)];
    return require(specifier);
  };
  new Function('require', 'module', 'exports', modalCode)(modalRequire, modalModule, modalModule.exports);
  const previousWindow = globalThis.window;
  globalThis.window = { State: { vesselName: 'MV GEARED BULKER', vesselType: 'Handysize' } };
  try {
    const clean = window.selectFixtureRecapState(
      { vesselName: 'MV TBN', vesselType: 'Pneumatic Cement Carrier', cargoQty: 5000 },
      { vessel: { name: 'MV GEARED BULKER', type: 'Handysize' } },
    );
    const html = renderToStaticMarkup(React.createElement(modalModule.exports.default, {
      voyageData: { ...clean, stowagePlan: buildVoyageStowagePlan({ vesselType: 'Handysize' }) },
    }));
    assert.match(html, /MV TBN/);
    assert.match(html, /PNEUMATIC CEMENT CARRIER/);
    assert.match(html, /Bodega Sellada/);
    assert.doesNotMatch(html, /MV GEARED BULKER|id="deck-cranes"|HANDYSIZE \/ BULK CARRIER/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

for (const entry of ['index.html', 'decisiones.html']) {
  const source = fs.readFileSync(entry, 'utf8');
  const operations = source.slice(source.indexOf('function resolveFixtureRecapOperations('), source.indexOf('window.buildFixtureRecapHTMLTemplate ='));
  const render = new Function('state', `${operations}; return buildFixtureRecapHTMLTemplate({pol: "Bilbao", pod: "Lima", ...state});`);
  test(`${entry}: contract vessel type overrides incompatible cargo methods and nested defaults`, () => {
    for (const [type, expected, forbidden] of [
      ['Pneumatic Cement Carrier', /PNEUMATIC EQUIPMENT & SEALED HOLDS/, /cranes?|grabs?|2,000|FULLY GEARED/i],
      ['RoRo', /DECK SURFACE \(M2\) AND LANE METRES/, /cranes?|grabs?|2,000|PNEUMATIC CLAUSE/i],
      ['Geared Bulk (Big Bags)', /USE OF VESSEL'S CRANES IS MANDATORY/, /PNEUMATIC CLAUSE|RORO OPERATIONS/],
    ]) {
      const state = { vesselType: type, vessel: { name: 'MV ACTUAL', type: 'Handysize' }, loadingMethod: 'Pneumatic', productoEspecifico: 'Cemento a granel', cargoQty: 5000 };
      const html = render(state);
      assert.match(html, expected);
      assert.doesNotMatch(html, forbidden);
      assert.match(html, /MV ACTUAL/);
      const profile = resolveVesselProfile(resolveReportVessel(state).type);
      const plan = buildVoyageStowagePlan(state);
      assert.equal(plan.vesselModel.profile, profile);
      const svg = renderToStaticMarkup(React.createElement(VisualStowagePlan, { vesselType: type, stowagePlan: plan }));
      assert.equal(svg.includes('id="deck-cranes"'), profile === 'HANDYSIZE');
      if (profile === 'RORO') assert.match(svg, /id="stern-ramp"/);
    }
  });
}

test('schematic inherits the pneumatic plan when no explicit vessel type is supplied', () => {
  const plan = buildVoyageStowagePlan({ vessel: { type: 'Cement Carrier' }, shipProfile: 'Handysize', cargoQty: 5000 });
  assert.equal(plan.vesselModel.profile, 'PNEUMATIC');
  const html = renderToStaticMarkup(React.createElement(VisualStowagePlan, { stowagePlan: plan }));
  assert.match(html, /SEALED HOLDS/);
  assert.doesNotMatch(html, /id="deck-cranes"/);
});

test('executive annex keeps operational clauses, narrative and SVG synchronized for every contract profile', async () => {
  const dependencies = Object.fromEntries(await Promise.all(
    ['report-vessel.mjs', 'voyage-stowage-builder.mjs', 'dry-bulk-clause-matrix.mjs'].map(async file => [file, await import(`../src/${file}`)]),
  ));
  const compiledModal = transformSync(fs.readFileSync('src/components/VoyageExecutiveReportModal.jsx', 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
  const modal = { exports: {} };
  new Function('require', 'module', 'exports', compiledModal)(specifier => {
    if (specifier === './VisualStowagePlan.jsx') return module.exports;
    if (specifier.startsWith('../')) return dependencies[specifier.slice(3)];
    return require(specifier);
  }, modal, modal.exports);
  for (const [type, expected, forbidden, cranes] of [
    ['Bulk Carrier', /Gearless operations: terminal handling equipment/, /cranes?|grabs?|derricks?|GRÚAS|compatible con grúas/i, false],
    ['Cementero', /Pneumatic Equipment &amp; Sealed Holds/, /grabs?|derricks?|Infraestructura de grúas/i, false],
    ['RoRo', /deck surface \(m²\) and lane metres/, /grabs?|derricks?|compatible con grúas/i, false],
    ['Carga General / Geared Bulk (Big Bags)', /use of certified onboard cranes is mandatory/, /Pneumatic Equipment|Roll-on \/ roll-off operations/, true],
  ]) {
    const html = renderToStaticMarkup(React.createElement(modal.exports.default, {
      voyageData: { vesselType: type, cargoType: 'Cemento', loadingMethod: type === 'Bulk Carrier' ? 'Free Flow' : '', class: 'Handysize', shipProfile: 'Handysize', cargoQty: 5000,
        stowagePlan: { ...buildVoyageStowagePlan({ vesselType: type }), executiveJustification: ['STALE NARRATIVE'] } },
    }));
    assert.match(html, expected);
    assert.doesNotMatch(html, forbidden);
    assert.doesNotMatch(html, /STALE NARRATIVE/);
    assert.equal(html.includes('id="deck-cranes"'), cranes);
  }
});

for (const entry of ['index.html', 'decisiones.html']) {
  const source = fs.readFileSync(entry, 'utf8');
  const code = source.slice(source.indexOf('function resolveFixtureRecapOperations('), source.indexOf('window.buildFixtureRecapHTMLTemplate ='));
  const resolve = new Function('state', `${code}; return resolveFixtureRecapOperations(state);`);
  const render = new Function('state', `${code}; return buildFixtureRecapHTMLTemplate({pol: "Bilbao", pod: "Lima", ...state});`);
  test(`${entry}: standard bulk never falls back to cranes, even with stale geared calculator inputs`, () => {
    for (const vesselType of ['', 'Bulk Carrier', 'Dry Bulk', 'Bulk Cargo / Free Flow', 'Gearless Bulk', 'Handysize Gearless', 'Bodegas Abiertas']) {
      const state = { vesselType, commodity: 'Minerales', loadingMethod: 'Free Flow', cargoQty: 5000, vesselName: 'MV GEARED BULKER' };
      const ops = resolve(state);
      assert.equal(ops.isGeared, false);
      assert.equal(ops.vesselType, 'Gearless Bulk Carrier / Open Holds');
      assert.doesNotMatch(render(state), /cranes?|grabs?|geared bulker|2,000/i);
      const vessel = resolveReportVessel(state);
      assert.equal(vessel.type, 'Gearless Bulk Carrier / Open Holds');
      const plan = buildVoyageStowagePlan(state);
      assert.equal(plan.vesselModel.profile, 'GEARLESS');
      const svg = renderToStaticMarkup(React.createElement(VisualStowagePlan, { vesselType: vessel.type, stowagePlan: plan }));
      assert.doesNotMatch(svg, /id="deck-cranes"|GRÚAS/);
      assert.doesNotMatch(plan.executiveJustification.join(' '), /grúas de a bordo/);
    }
    const staleRender = new Function('state', 'State', 'document', `${code}; return buildFixtureRecapHTMLTemplate({pol: "Bilbao", pod: "Lima", ...state});`);
    assert.doesNotMatch(staleRender({ vesselType: 'Bulk Carrier' }, { loadingMethod: 'Big Bags' }, { getElementById: () => ({ value: 'Big Bags' }) }), /cranes?|grabs?/i);
  });
  test(`${entry}: explicit bags enable geared handling without replacing the selected vessel type`, () => {
    for (const loadingMethod of ['Big Bags', 'Sacas', 'Sacos']) {
      const state = { vesselType: 'Bulk Carrier', loadingMethod, cargoQty: 5000 };
      assert.equal(resolve(state).vesselType, 'Geared General Cargo / Big Bags');
      assert.equal(resolve(state).isGeared, true);
      assert.match(render(state), /USE OF VESSEL'S CRANES IS MANDATORY/);
      const plan = buildVoyageStowagePlan(state);
      assert.equal(plan.vesselModel.profile, 'HANDYSIZE');
      const svg = renderToStaticMarkup(React.createElement(VisualStowagePlan, { vesselType: state.vesselType, stowagePlan: plan }));
      assert.match(svg, /id="deck-cranes"/);
    }
  });
}
