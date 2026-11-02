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
vm.runInNewContext(fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8'), { window, setTimeout });

test('approved cement type survives cleaning and overrides stale nested vessel and class', () => {
  const input = { vesselType: 'Pneumatic Cement Carrier', vessel: { type: 'Handysize' }, class: 'Handysize', shipProfile: 'Handysize', cargoQty: 5000 };
  for (const state of [input, window.selectFixtureRecapState(input)]) {
    const vessel = resolveReportVessel(state);
    assert.equal(vessel.type, input.vesselType);
    const plan = buildVoyageStowagePlan({ ...state, vesselType: vessel.type });
    assert.equal(plan.vesselModel.profile, 'PNEUMATIC');
    assert.equal(plan.vesselModel.type, input.vesselType);
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
