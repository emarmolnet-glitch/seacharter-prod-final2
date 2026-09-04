import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as cargoTaxonomy from '../cargo-taxonomy.mjs';
import * as taxonomyCompatibility from '../netlify/functions/_shared/taxonomy-compatibility.mjs';

test('Triple-Sourcing: client merge deduplicates by IMO or name plus DWT and prioritizes live position', async () => {
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexSource, /function mergeTripleSourcedVessels/);
  assert.match(indexSource, /function mergeDualSourcedVessels/, 'mergeDualSourcedVessels function should be defined in index.html');

  const functionMatch = indexSource.match(/function getVesselFallbackKey[\s\S]*?window\.mergeDualSourcedVessels = mergeDualSourcedVessels;/);
  assert.ok(functionMatch, 'Should find triple-source merge definitions in index.html');

  const evalContext = new Function('window', `${functionMatch[0]}; return { mergeTripleSourcedVessels: window.mergeTripleSourcedVessels, mergeDualSourcedVessels: window.mergeDualSourcedVessels, getVesselKey: window.getVesselKey };`);
  const windowMock = {};
  const { mergeTripleSourcedVessels, mergeDualSourcedVessels, getVesselKey } = evalContext(windowMock);

  const dbVessels = [
    { imo: 9123456, mmsi: 123456789, vesselName: 'DB Vessel 1', latitude: 10.0, longitude: 20.0, dwt: 5000 },
    { imo: 9876543, mmsi: 987654321, vesselName: 'DB Vessel 2', latitude: 15.0, longitude: 25.0, dwt: 30000 }
  ];

  const radarVessels = [
    { imo: 9123456, mmsi: 123456789, vesselName: 'DB Vessel 1', latitude: 11.5, longitude: 21.5, dwt: 5000, speed: 12.4 }, // Updated position
    { imo: 9999999, mmsi: 555555555, vesselName: 'New Radar Vessel', latitude: 30.0, longitude: 40.0, dwt: 8000 } // New discovery
  ];

  const merged = mergeDualSourcedVessels(dbVessels, radarVessels);

  assert.equal(merged.length, 3, 'Should deduplicate 4 vessels down to 3 unique vessels by IMO');

  const v1 = merged.find(v => Number(v.imo) === 9123456);
  assert.ok(v1, 'Vessel 9123456 should exist in merged output');
  assert.equal(v1.data_source, 'radar_live', 'Vessel detected by Radar Live should have data_source = radar_live');
  assert.equal(v1.latitude, 11.5, 'Live position latitude from Radar AIS should override Data Bridge position');
  assert.equal(v1.longitude, 21.5, 'Live position longitude from Radar AIS should override Data Bridge position');
  assert.deepEqual(v1.source_origins, ['DATABRIDGE', 'AIS_LIVE']);

  const v2 = merged.find(v => Number(v.imo) === 9876543);
  assert.ok(v2, 'Vessel 9876543 should exist');
  assert.equal(v2.data_source, 'databridge', 'Vessel existing only in Data Bridge should have data_source = databridge');

  const v3 = merged.find(v => Number(v.imo) === 9999999);
  assert.ok(v3, 'New Radar vessel should exist');
  assert.equal(v3.data_source, 'radar_live', 'New discovery from Radar should have data_source = radar_live');

  const noImoDataBridge = { vesselName: 'M/V Baltic Cedar', dwt: 12620, status: 'EN_CARTERA', latitude: 8, longitude: 9 };
  const imoAis = { imo: 9312345, vesselName: 'Baltic Cedar', dwt: 12710, latitude: 10, longitude: 11, speed: 13.1 };
  const fallbackMerged = mergeTripleSourcedVessels([], [noImoDataBridge], [imoAis]);
  assert.equal(fallbackMerged.length, 1, 'Name and DWT fallback should link a no-IMO Data Bridge record to AIS');
  assert.equal(getVesselKey(fallbackMerged[0]), 'imo-9312345');
  assert.deepEqual(fallbackMerged[0].source_origins, ['DATABRIDGE', 'AIS_LIVE']);
  assert.equal(fallbackMerged[0].latitude, 10);
});

test('Map Visual Differentiation: GlobalFleetGlobe uses the Data Bridge HTML/SVG marker', async (t) => {
  const globeSource = await readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');

  assert.match(globeSource, /function createVesselMarker\(vessel\)/);
  assert.match(globeSource, /globe-vessel-marker-glyph/);
  assert.match(globeSource, /\.htmlElementsData\(\[\]\)/);
  assert.match(globeSource, /\.htmlElement\(createVesselMarker\)/);
  assert.doesNotMatch(globeSource, /\.pointsData\(vessels\)/, 'Vessels must not render through native WebGL points');
});

test('Coasters, Minibulkers, and Class B Transponders: Classification in cargo-taxonomy.mjs', async (t) => {
  const coasterVessel = { dwt: 3500, vesselClass: 'Coaster', shipType: 'General Cargo' };
  const minibulkerVessel = { dwt: 12000, vesselClass: 'Mini Bulker', shipType: 'Bulk Carrier' };
  const classBVessel = { dwt: 4000, isClassB: true, shipType: 'General Cargo' };

  const coasterEligibility = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: '10',
    vessel: coasterVessel,
    shipType: coasterVessel.shipType,
    dwt: coasterVessel.dwt,
    quantity: 3200
  });

  assert.ok(coasterEligibility.eligible, 'Coaster with 3500 DWT should be eligible for 3000 MT cargo');
  assert.ok(coasterEligibility.design.coaster, 'Should be classified as Coaster design');
  assert.ok(coasterEligibility.design.bulk || coasterEligibility.design.general, 'Coaster should be classified as bulk/general cargo');

  const minibulkerEligibility = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: '10',
    vessel: minibulkerVessel,
    shipType: minibulkerVessel.shipType,
    dwt: minibulkerVessel.dwt,
    quantity: 11000
  });

  assert.ok(minibulkerEligibility.eligible, 'Minibulker with 12000 DWT should be eligible for 11000 MT cargo');
  assert.ok(minibulkerEligibility.design.minibulker, 'Should be classified as Minibulker design');

  const classBEligibility = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: '10',
    vessel: classBVessel,
    shipType: classBVessel.shipType,
    dwt: classBVessel.dwt,
    quantity: 3500
  });

  assert.ok(classBEligibility.eligible, 'Class B vessel should be eligible for cargo');
  assert.ok(classBEligibility.design.isClassB, 'Should recognize Class B transponder');
});

test('Coasters and Minibulkers: Classification in taxonomy-compatibility.mjs', async (t) => {
  const coasterTypes = taxonomyCompatibility.classifyAisVesselTaxonomyTypes('Coaster General Cargo');
  assert.ok(coasterTypes.includes('general_cargo') || coasterTypes.includes('bulk_carrier'), 'Coaster should map to general_cargo or bulk_carrier');

  const minibulkerTypes = taxonomyCompatibility.classifyAisVesselTaxonomyTypes('Mini Bulker Dry Cargo');
  assert.ok(minibulkerTypes.includes('bulk_carrier') || minibulkerTypes.includes('general_cargo'), 'Minibulker should map to bulk_carrier');

  const classBTypes = taxonomyCompatibility.classifyAisVesselTaxonomyTypes('Class B Coastal Cargo');
  assert.ok(classBTypes.includes('general_cargo') || classBTypes.includes('bulk_carrier'), 'Class B should map to general_cargo or bulk_carrier');
});
