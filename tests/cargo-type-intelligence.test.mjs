import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CARGO_TAXONOMY,
  DEFAULT_CARGO_TYPE_ID,
  calculateCargoIntelligenceBoost,
  evaluateCargoVesselEligibility,
} from '../cargo-taxonomy.mjs';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const aiFilterSource = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');

test('cargo taxonomy exposes the standardized ten-value selector with Otros by default', () => {
  assert.equal(CARGO_TAXONOMY.length, 10);
  assert.equal(DEFAULT_CARGO_TYPE_ID, '100');
  assert.equal(CARGO_TAXONOMY.at(-1)?.label, 'Otros');
  assert.match(indexSource, /window\.CargoTypeSelector/);
  assert.match(indexSource, /MATCHING_CARGO_TYPE_STORAGE_KEY/);
  assert.match(indexSource, /data-cargo-type-selector="calculator"/);
});

test('master calculator payload maps the selected cargo strictly to its code', () => {
  const builderStart = indexSource.indexOf('function buildMatchingRequest');
  const builderEnd = indexSource.indexOf('window.buildMatchingRequest = buildMatchingRequest;', builderStart);
  const builderSource = indexSource.slice(builderStart, builderEnd);
  assert.match(builderSource, /type: String\(document\.getElementById\('cargo-type-manual'\)\?\.value/);
  assert.match(builderSource, /typeId: String\(document\.getElementById\('cargo-type-manual'\)\?\.value/);
  assert.match(builderSource, /specification: String\(window\.getCargoTaxonomyLabel/);
});

test('cargo intelligence applies the Rules of Gold signals', () => {
  assert.equal(calculateCargoIntelligenceBoost('10', { vesselType: 'Cement Carrier', equipment: 'Self-Discharger' }).boost, 20);
  assert.equal(calculateCargoIntelligenceBoost('60', { certificates: 'Grain Fitted', holdCleanliness: 'Clean holds' }).boost, 20);
  assert.equal(calculateCargoIntelligenceBoost('20', { design: 'Open Hatch Gantry Crane with box-shaped holds' }).boost, 20);
  assert.equal(calculateCargoIntelligenceBoost('70', { ventilation: 'High ventilation', rating: 'Ventilation rating A' }).boost, 20);
  assert.equal(calculateCargoIntelligenceBoost('90', { gear: 'Heavy Lift gear' }).boost, 18);
});

test('matching scoring includes cargo boost and LIVE recalculation preserves radar state', () => {
  assert.match(aiFilterSource, /calculateCargoIntelligenceBoost\(cargoTypeId, vessel\.source\)/);
  assert.match(aiFilterSource, /cargoBoost: cargoIntelligence\.boost/);
  assert.match(indexSource, /preserveRadarLive: true/);
  assert.match(indexSource, /mode !== 'live'/);
});

test('strict eligibility accepts a correctly sized bulk carrier for grain', () => {
  const result = evaluateCargoVesselEligibility({
    cargoTypeId: '60',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 28_000,
    quantity: 20_000,
  });

  assert.equal(result.eligible, true);
  assert.deepEqual(result.criticalReasons, []);
});

test('strict eligibility rejects incompatible designs and unrealistic DWT', () => {
  const tanker = evaluateCargoVesselEligibility({
    cargoTypeId: '60',
    shipType: 'Oil Tanker',
    vessel: { vesselType: 'Oil Tanker' },
    dwt: 28_000,
    quantity: 20_000,
  });
  const undersized = evaluateCargoVesselEligibility({
    cargoTypeId: '60',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 18_000,
    quantity: 20_000,
  });
  const oversized = evaluateCargoVesselEligibility({
    cargoTypeId: '60',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 90_000,
    quantity: 20_000,
  });

  assert.equal(tanker.eligible, false);
  assert.match(tanker.criticalReasons.join(' '), /Diseño de buque incompatible/);
  assert.equal(undersized.eligible, false);
  assert.match(undersized.criticalReasons.join(' '), /inferior a la carga/);
  assert.equal(oversized.eligible, false);
  assert.match(oversized.criticalReasons.join(' '), /sobredimensionado/);
});

test('strict eligibility enforces required cranes and grab capacity', () => {
  const missingEquipment = evaluateCargoVesselEligibility({
    cargoTypeId: '60',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier', hasCranes: false },
    dwt: 28_000,
    quantity: 20_000,
    gearedRequired: true,
    grabRequired: true,
    requiredGrabCapacityCbm: 10,
    requiredCraneSwlMt: 25,
  });
  const equipped = evaluateCargoVesselEligibility({
    cargoTypeId: '60',
    shipType: 'Bulk Carrier',
    vessel: {
      vesselType: 'Bulk Carrier',
      hasCranes: true,
      hasGrab: true,
      grabCapacityCbm: 12,
      craneSwlMt: 30,
    },
    dwt: 28_000,
    quantity: 20_000,
    gearedRequired: true,
    grabRequired: true,
    requiredGrabCapacityCbm: 10,
    requiredCraneSwlMt: 25,
  });

  assert.equal(missingEquipment.eligible, false);
  assert.match(missingEquipment.criticalReasons.join(' '), /grúas|grab|Crane SWL/);
  assert.equal(equipped.eligible, true);
});

test('technical warnings are hidden by default and remain reviewable', () => {
  assert.match(indexSource, /id="hide-technical-problems-toggle"[^>]*checked/);
  assert.match(indexSource, /Array\.isArray\(data\.technicalWarnings\)/);
  assert.match(indexSource, /m\.technicalEligibility\?\.eligible === false/);
  assert.match(indexSource, /Advertencia técnica/);
  assert.match(indexSource, /technicalProblemsToggle\.addEventListener\('change'/);
});
