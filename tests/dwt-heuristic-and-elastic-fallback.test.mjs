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

test('evaluateCargoVesselEligibility supports configurable maxDwtTolerance', () => {
  // Standard 30% tolerance (1.30): 25,000 DWT for 7,500 MT cargo -> OVERSIZED (25000 > 7500 * 1.30 = 9750)
  const standardEvaluation = evaluateCargoVesselEligibility({
    cargoTypeId: '100',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 25000,
    quantity: 7500,
    maxDwtTolerance: 1.30,
  });
  assert.equal(standardEvaluation.eligible, false);
  assert.match(standardEvaluation.criticalReasons.join(' '), /sobredimensionado/i);

  // Expanded 500% tolerance (5.00): 25,000 DWT for 7,500 MT cargo -> ELIGIBLE (25000 <= 7500 * 5.00 = 37500)
  const fallbackEvaluation = evaluateCargoVesselEligibility({
    cargoTypeId: '100',
    shipType: 'Bulk Carrier',
    vessel: { vesselType: 'Bulk Carrier' },
    dwt: 25000,
    quantity: 7500,
    maxDwtTolerance: 5.00,
  });
  assert.equal(fallbackEvaluation.eligible, true);
  assert.deepEqual(fallbackEvaluation.criticalReasons, []);
});

test('ai-ais-filter.ts implements heuristic DWT inference and elastic fallback (500% tolerance)', async () => {
  const filterSource = await readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');

  // Verify import of estimateDwtFromDimensions
  assert.match(filterSource, /estimateDwtFromDimensions/);

  // Verify heuristic DWT assignment with ESTIMATED_BY_DIMENSIONS
  assert.match(filterSource, /ESTIMATED_BY_DIMENSIONS/);

  // Verify elastic fallback pass with 500% tolerance (5.00)
  assert.match(filterSource, /OVERSIZED_FALLBACK/);
  assert.match(filterSource, /isOversizedFallback/);
  assert.match(filterSource, /evaluateVessels\(5\.00,\s*true\)/);
});

test('index.html and dist/index.html render DWT ESTIMADO and OVERSIZED_FALLBACK warning badges', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const distIndexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

  for (const html of [indexHtml, distIndexHtml]) {
    // Badge 1: Blue badge for DWT ESTIMADO (Vía Eslora/Manga)
    assert.match(html, /DWT ESTIMADO \(Vía Eslora\/Manga\)/);
    assert.match(html, /bg-blue-50 text-blue-700/);

    // Badge 2: Highlighted warning badge for ADVERTENCIA: BUQUE SOBREDIMENSIONADO (MOSTRADO POR ESCASEZ DE MERCADO)
    assert.match(html, /ADVERTENCIA: BUQUE SOBREDIMENSIONADO \(MOSTRADO POR ESCASEZ DE MERCADO\)/);
    assert.match(html, /bg-amber-100 text-amber-900/);
  }
});
