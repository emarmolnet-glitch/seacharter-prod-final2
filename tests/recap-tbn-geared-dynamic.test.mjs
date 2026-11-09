import '../fixture-operating-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveReportVessel } from '../src/report-vessel.mjs';
import { buildVoyageStowagePlan } from '../src/voyage-stowage-builder.mjs';

for (const entry of ['index.html', 'decisiones.html']) {
  const source = fs.readFileSync(entry, 'utf8');
  const operations = source.slice(source.indexOf('function resolveFixtureRecapOperations('), source.indexOf('window.buildFixtureRecapHTMLTemplate ='));
  const render = new Function('state', `${operations}; return buildFixtureRecapHTMLTemplate({pol: "Bilbao", pod: "Lima", ...state});`);

  test(`${entry}: Paletizado - Grúa Barco renders Geared Coaster and certified onboard cranes`, () => {
    const state = { loadingMethod: 'Paletizado - Grúa Barco', cargoQty: 4500 };
    const vessel = resolveReportVessel(state);
    assert.equal(vessel.description, 'MV TBN - Geared Bulk Carrier / Open Holds (Geared Coaster)');
    const html = render(state);
    assert.match(html, /MV TBN - ABT 4,500 MT DWT GEARED OPERATIONS WITH CERTIFIED ONBOARD CRANES \(Geared Bulk Carrier \/ Open Holds \(Geared Coaster\)\)/);
    assert.match(html, /USE OF VESSEL'S CRANES IS MANDATORY/);
    assert.doesNotMatch(html, /GEARLESS BULK CARRIER/);
  });

  test(`${entry}: Big Bags - Grúa Barco renders Geared Coaster and ship's cranes`, () => {
    const state = { loadingMethod: 'Big Bags - Grúa Barco', cargoQty: 5000 };
    const vessel = resolveReportVessel(state);
    assert.equal(vessel.description, 'MV TBN - Geared Bulk Carrier / Open Holds (Geared Coaster)');
    const html = render(state);
    assert.match(html, /MV TBN - ABT 5,000 MT DWT GEARED OPERATIONS WITH CERTIFIED ONBOARD CRANES \(Geared Bulk Carrier \/ Open Holds \(Geared Coaster\)\)/);
    assert.doesNotMatch(html, /GEARLESS BULK CARRIER/);
  });

  test(`${entry}: Breakbulk cargo renders General Cargo (Geared Breakbulk)`, () => {
    const state = { cargoType: 'Breakbulk', cargoQty: 6000 };
    const vessel = resolveReportVessel(state);
    assert.equal(vessel.description, 'MV TBN - General Cargo (Geared Breakbulk)');
    const html = render(state);
    assert.match(html, /MV TBN - ABT 6,000 MT DWT GEARED OPERATIONS WITH CERTIFIED ONBOARD CRANES \(General Cargo \(Geared Breakbulk\)\)/);
    assert.doesNotMatch(html, /GEARLESS BULK CARRIER/);
  });

  test(`${entry}: Carga Unitizada renders Geared Bulk Carrier / Open Holds (Geared Coaster)`, () => {
    const state = { cargoType: 'Carga Unitizada', cargoQty: 3500 };
    const vessel = resolveReportVessel(state);
    assert.equal(vessel.description, 'MV TBN - Geared Bulk Carrier / Open Holds (Geared Coaster)');
    const html = render(state);
    assert.match(html, /MV TBN - ABT 3,500 MT DWT GEARED OPERATIONS WITH CERTIFIED ONBOARD CRANES \(Geared Bulk Carrier \/ Open Holds \(Geared Coaster\)\)/);
    assert.doesNotMatch(html, /GEARLESS BULK CARRIER/);
  });

  test(`${entry}: Pure bulk with port equipment falls back to Gearless Bulk Carrier`, () => {
    const state = { commodity: 'Minerales', loadingMethod: 'Cuchara (Grab) - Grúa Portuaria', cargoQty: 10000 };
    const vessel = resolveReportVessel(state);
    assert.equal(vessel.description, 'MV TBN - Gearless Bulk Carrier / Open Holds');
    const html = render(state);
    assert.match(html, /MV TBN - ABT 10,000 MT DWT \(Gearless Bulk Carrier \/ Open Holds\)/);
    assert.match(html, /GEARLESS BULK CARRIER \/ OPEN HOLDS: TERMINAL HANDLING ARRANGEMENTS/);
  });
}

test('Voyage stowage builder accompanies schematic with Geared for ship crane operative', () => {
  const gearedPlan = buildVoyageStowagePlan({ loadingMethod: 'Paletizado - Grúa Barco', cargoQty: 4000 });
  assert.equal(gearedPlan.vesselModel.isGeared, true);
  assert.match(gearedPlan.executiveJustification.join(' '), /operativa geared \(con grúas de a bordo\)/);

  const gearlessPlan = buildVoyageStowagePlan({ commodity: 'Minerales', loadingMethod: 'Free Flow', cargoQty: 4000 });
  assert.equal(gearlessPlan.vesselModel.isGeared, false);
  assert.match(gearlessPlan.executiveJustification.join(' '), /operativa gearless/);
});

test('VisualStowagePlan replaces GEARLESS with GEARED in textual label when operative requires cranes', async () => {
  const { transformSync } = await import('esbuild');
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createRequire } = await import('node:module');

  const require = createRequire(import.meta.url);
  const compiled = transformSync(fs.readFileSync('src/components/VisualStowagePlan.jsx', 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(require, mod, mod.exports);
  const VisualStowagePlan = mod.exports.VisualStowagePlan;

  // Geared coaster case: Paletizado - Grúa Barco
  const gearedVessel = resolveReportVessel({ loadingMethod: 'Paletizado - Grúa Barco', cargoQty: 4000 });
  const gearedPlan = buildVoyageStowagePlan({ loadingMethod: 'Paletizado - Grúa Barco', cargoQty: 4000, vesselType: gearedVessel.type });
  const gearedHtml = renderToStaticMarkup(React.createElement(VisualStowagePlan, {
    vesselType: gearedVessel.type,
    stowagePlan: gearedPlan,
  }));
  assert.match(gearedHtml, /1-2 BODEGAS DIÁFANAS · GEARED/);
  assert.doesNotMatch(gearedHtml, /1-2 BODEGAS DIÁFANAS · GEARLESS/);

  // Pure bulk fallback case: Free Flow
  const gearlessVessel = resolveReportVessel({ commodity: 'Minerales', loadingMethod: 'Free Flow', cargoQty: 4000 });
  const gearlessPlan = buildVoyageStowagePlan({ commodity: 'Minerales', loadingMethod: 'Free Flow', cargoQty: 4000, vesselType: gearlessVessel.type });
  const gearlessHtml = renderToStaticMarkup(React.createElement(VisualStowagePlan, {
    vesselType: gearlessVessel.type,
    stowagePlan: gearlessPlan,
  }));
  assert.match(gearlessHtml, /GEARLESS/);
});
