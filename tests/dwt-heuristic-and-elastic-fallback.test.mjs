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

test('evaluateCargoVesselEligibility enforces strict +/- 15% DWT capacity tolerance', () => {
  // Strict 15% tolerance (1.15): 25,000 DWT for 7,800 MT cargo -> OVERSIZED (25000 > 7800 * 1.15 = 8970)
  const oversizedEvaluation = evaluateCargoVesselEligibility({
    cargoTypeId: '100',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 25000,
    quantity: 7800,
    maxDwtTolerance: 1.15,
  });
  assert.equal(oversizedEvaluation.eligible, false);
  assert.match(oversizedEvaluation.criticalReasons.join(' '), /sobredimensionado/i);

  // Real coaster in range (8,500 DWT for 7,800 MT cargo) -> ELIGIBLE (8500 <= 7800 * 1.15 = 8970)
  const validEvaluation = evaluateCargoVesselEligibility({
    cargoTypeId: '100',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 8500,
    quantity: 7800,
    maxDwtTolerance: 1.15,
  });
  assert.equal(validEvaluation.eligible, true);
  assert.deepEqual(validEvaluation.criticalReasons, []);
});

test('ai-ais-filter.ts enforces strict 15% DWT tolerance and deactivates elastic fallback pass', async () => {
  const filterSource = await readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');

  // Verify import of estimateDwtFromDimensions
  assert.match(filterSource, /estimateDwtFromDimensions/);

  // Verify heuristic DWT assignment with ESTIMATED_BY_DIMENSIONS
  assert.match(filterSource, /ESTIMATED_BY_DIMENSIONS/);

  // Verify strict 1.15 evaluation pass
  assert.match(filterSource, /evaluateVessels\(1\.15/);

  // Verify deactivation/removal of 500% elastic fallback pass
  assert.doesNotMatch(filterSource, /evaluateVessels\(5\.00/);
});

test('index.html and dist/index.html enforce strict 15% DWT tolerance and render DWT ESTIMADO badge', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const distIndexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

  for (const html of [indexHtml, distIndexHtml]) {
    // Badge: Blue badge for DWT ESTIMADO (Vía Eslora/Manga)
    assert.match(html, /DWT ESTIMADO \(Vía Eslora\/Manga\)/);
    assert.match(html, /bg-blue-50 text-blue-700/);

    // Enforce strict 1.15 maxDwtTolerance
    assert.match(html, /maxDwtTolerance = 1\.15/);
    assert.match(html, /MÁX 15% DE TOLERANCIA/);
  }
});
