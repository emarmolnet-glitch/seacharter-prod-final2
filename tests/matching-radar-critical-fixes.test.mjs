import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const filterSource = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');
const rankingSource = readFileSync(new URL('../netlify/functions/_shared/commercial-vessel-ranking.mjs', import.meta.url), 'utf8');
const matchingSources = readFileSync(new URL('../db/matching-sources.ts', import.meta.url), 'utf8');

test('strict technical filtering is permanently false across UI and scoring', () => {
  assert.match(indexSource, /window\.matchingStrictTechnicalFilter = false/);
  assert.match(indexSource, /id="hide-technical-problems-toggle"[^>]*disabled[^>]*aria-checked="false"/);
  assert.match(indexSource, /strictTechnicalFilter: false/);
  assert.match(indexSource, /const strictTechnicalFilter = false;[\s\S]*const viableMatches = matches\.slice\(\)/);
  assert.match(filterSource, /const strictTechnicalFilter = false/);
  assert.match(filterSource, /const matches = evaluatedMatches\.slice\(\)/);
});

test('absolute DWT difference is the first real comparator and distance is last', () => {
  const comparatorStart = rankingSource.indexOf('export function compareCommercialVesselRanks');
  const comparator = rankingSource.slice(comparatorStart);
  const dwtIndex = comparator.indexOf('left.dwtDifferenceMt');
  const laycanIndex = comparator.indexOf('left.laycanPriority');
  const transitIndex = comparator.indexOf('left.transitHours');
  const distanceIndex = comparator.indexOf('left.distanceNm');
  assert.ok(dwtIndex >= 0 && dwtIndex < laycanIndex);
  assert.ok(laycanIndex < transitIndex);
  assert.ok(transitIndex < distanceIndex);
  assert.doesNotMatch(comparator, /dwtSimilarityBand - right\.dwtSimilarityBand/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf('deduplicatedMatches.sort')), /eligibilityB - eligibilityA/);
});

test('initial render preserves incomplete and confirmed long-distance candidates', () => {
  assert.match(filterSource, /const hasValidPosition =/);
  assert.match(filterSource, /match\.ais\.hasValidPosition !== true/);
  assert.match(filterSource, /match\.ais\.longDistanceTransitToPol === true/);
  assert.match(filterSource, /!strictTechnicalFilter && isUnknownTechnicalValue\(vessel\.shipType\)/);
  assert.match(indexSource, /hasIncompleteRadarData:/);
  assert.match(indexSource, /incompleteRadarVessels/);
  assert.match(indexSource, /LONG_DISTANCE_POL/);
  assert.match(matchingSources, /payload->>'longDistanceTransitToPol' = 'true'/);
});
