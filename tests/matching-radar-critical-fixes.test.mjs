import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const filterSource = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');
const rankingSource = readFileSync(new URL('../netlify/functions/_shared/commercial-vessel-ranking.mjs', import.meta.url), 'utf8');
const matchingSources = readFileSync(new URL('../db/matching-sources.ts', import.meta.url), 'utf8');

test('strict technical filtering preserves live telemetry with pending DWT and enforces known DWT ranges', () => {
  assert.match(indexSource, /window\.matchingStrictTechnicalFilter = false/);
  assert.match(indexSource, /id="hide-technical-problems-toggle"[^>]*aria-disabled="false"[^>]*aria-checked="false"/);
  assert.match(indexSource, /strictTechnicalFilter: window\.matchingStrictTechnicalFilter === true/);
  assert.match(indexSource, /const strictRequiredDwt = quantity > 0 \? quantity \* 1\.05 : 0/);
  assert.match(indexSource, /const STRICT_RADAR_DWT_PREFERRED_MAX_FACTOR = 1\.15/);
  assert.match(indexSource, /const strictMaximumDwt = quantity > 0 \? quantity \* 1\.40 : 0/);
  assert.match(indexSource, /if \(missingCriticalType\) return false/);
  assert.match(indexSource, /if \(!Number\.isFinite\(dwt\) \|\| dwt <= 0\) return pendingLiveAudit/);
  assert.match(indexSource, /return dwt >= strictRequiredDwt && dwt <= strictMaximumDwt/);
  assert.match(filterSource, /body\.strictTechnicalFilter === true/);
  assert.match(filterSource, /const strictRequiredDwt = quantity > 0 \? quantity \* 1\.05 : 0/);
  assert.match(filterSource, /const strictPreferredMaximumDwt = quantity > 0 \? quantity \* 1\.15 : 0/);
  assert.match(filterSource, /const strictMaximumDwt = quantity > 0 \? quantity \* 1\.40 : 0/);
  assert.match(filterSource, /status: "BLOCKED_MISSING", label: "DWT obligatorio no verificado"/);
  assert.match(filterSource, /status: "PENDING_AUDIT", label: "DWT pendiente de auditar"/);
  assert.match(filterSource, /telemetryVisible: telemetryVisibleWithoutDwt/);
  assert.match(filterSource, /status: "OVERSIZED", label: "DWT Sobredimensionado \(máximo comercial \+40%\)"/);
  assert.match(filterSource, /status: "OVERSIZED_VIABLE", label: "Viable \(Sobredimensionado\) · penalización comercial"/);
  assert.match(filterSource, /const oversizePenalty = isOversizedUnderStandard/);
  assert.match(filterSource, /Number\(vessel\.dwt\) <= strictMaximumDwt/);
  assert.match(filterSource, /\["SUFFICIENT", "OVERSIZED_VIABLE"\]\.includes/);
  assert.match(filterSource, /blockedForMissingCriticalData: missingCriticalData/);
  assert.match(filterSource, /discardedForMissingDataCount/);
});

test('absolute DWT difference, ballast and laycan precede distance', () => {
  const comparatorStart = rankingSource.indexOf('export function compareCommercialVesselRanks');
  const comparator = rankingSource.slice(comparatorStart);
  const dwtIndex = comparator.indexOf('left.dwtDifferenceMt');
  const ballastIndex = comparator.indexOf('left.ballastPriority');
  const laycanIndex = comparator.indexOf('left.laycanPriority');
  const transitIndex = comparator.indexOf('left.transitHours');
  const distanceIndex = comparator.indexOf('left.distanceNm');
  assert.ok(dwtIndex >= 0 && dwtIndex < ballastIndex);
  assert.ok(ballastIndex < laycanIndex);
  assert.ok(laycanIndex < distanceIndex);
  assert.ok(distanceIndex < transitIndex);
  assert.doesNotMatch(comparator, /dwtSimilarityBand - right\.dwtSimilarityBand/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf('deduplicatedMatches.sort')), /eligibilityB - eligibilityA/);
});

test('initial render preserves confirmed long-distance candidates but blocks unknown taxonomy data', () => {
  assert.match(filterSource, /const hasValidPosition =/);
  assert.match(filterSource, /match\.ais\.hasValidPosition !== true/);
  assert.match(filterSource, /match\.ais\.longDistanceTransitToPol === true/);
  assert.match(filterSource, /!activeTaxonomyRequiresVerifiedData && !strictTechnicalFilter && isUnknownTechnicalValue\(vessel\.shipType\)/);
  assert.match(indexSource, /hasIncompleteRadarData:/);
  assert.match(indexSource, /incompleteRadarVessels/);
  assert.match(indexSource, /LONG_DISTANCE_POL/);
  assert.match(matchingSources, /matchReason: matchReason as MatchReason/);
  assert.match(matchingSources, /longDistanceTransitToPol: matchReason === "INBOUND_TO_POL"/);
});
