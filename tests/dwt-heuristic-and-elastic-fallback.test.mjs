import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { estimateDwtFromDimensions, evaluateCargoVesselEligibility } from '../cargo-taxonomy.mjs';

test('estimateDwtFromDimensions calculates DWT using formula LOA * Beam * Draft * 0.70 * 1.025', () => {
  // LOA = 120, Beam = 18, Draft = 7 -> 120 * 18 * 7 * 0.70 * 1.025 = 10848.6 -> 10849
  const dwt = estimateDwtFromDimensions(120, 18, 7);
  assert.equal(dwt, 10849);

  // Return 0 if any dimension is missing or invalid
  assert.equal(estimateDwtFromDimensions(0, 18, 7), 0);
  assert.equal(estimateDwtFromDimensions(120, -5, 7), 0);
  assert.equal(estimateDwtFromDimensions(120, 18, null), 0);
});

test('evaluateCargoVesselEligibility enforces a 40% hard DWT ceiling', () => {
  const oversizedEvaluation = evaluateCargoVesselEligibility({
    cargoTypeId: '100',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 25000,
    quantity: 7800,
    maxDwtTolerance: 1.40,
  });
  assert.equal(oversizedEvaluation.eligible, false);
  assert.match(oversizedEvaluation.criticalReasons.join(' '), /sobredimensionado/i);

  const preferredEvaluation = evaluateCargoVesselEligibility({
    cargoTypeId: '100',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 8500,
    quantity: 7800,
    maxDwtTolerance: 1.40,
  });
  assert.equal(preferredEvaluation.eligible, true);
  assert.deepEqual(preferredEvaluation.criticalReasons, []);

  const oversizedViableEvaluation = evaluateCargoVesselEligibility({
    cargoTypeId: '100',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 10_000,
    quantity: 7_800,
    maxDwtTolerance: 1.40,
  });
  assert.equal(oversizedViableEvaluation.eligible, true);
  assert.deepEqual(oversizedViableEvaluation.criticalReasons, []);
});

test('ai-ais-filter.ts keeps the +15% preferred band and enforces a +40% hard ceiling', async () => {
  const filterSource = await readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');

  // Verify import of estimateDwtFromDimensions
  assert.match(filterSource, /estimateDwtFromDimensions/);

  // Verify heuristic DWT assignment with ESTIMATED_BY_DIMENSIONS
  assert.match(filterSource, /ESTIMATED_BY_DIMENSIONS/);

  assert.match(filterSource, /strictPreferredMaximumDwt = quantity > 0 \? quantity \* 1\.15 : 0/);
  assert.match(filterSource, /strictMaximumDwt = quantity > 0 \? quantity \* 1\.40 : 0/);
  assert.match(filterSource, /evaluateVessels\(1\.40/);
  assert.match(filterSource, /OVERSIZED_VIABLE/);

  // Verify deactivation/removal of 500% elastic fallback pass
  assert.doesNotMatch(filterSource, /evaluateVessels\(5\.00/);
});

test('index.html renders estimated DWT and the preferred +15% / hard +40% bands', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /DWT ESTIMADO \(Vía Eslora\/Manga\)/);
  assert.match(indexHtml, /bg-blue-50 text-blue-700/);
  assert.match(indexHtml, /const STRICT_RADAR_DWT_PREFERRED_MAX_FACTOR = 1\.15/);
  assert.match(indexHtml, /const STRICT_RADAR_DWT_MAX_FACTOR = 1\.40/);
  assert.match(indexHtml, /Viable \(Sobredimensionado\)/);
  assert.match(indexHtml, /máximo comercial del 40%/);
});
