import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyCandidateMatch,
  estimateBallastStatus,
  normalizePortDestination,
  sortCandidates,
} from '../netlify/functions/_shared/commercial-vessel-search.mjs';

const matchingSources = readFileSync(new URL('../db/matching-sources.ts', import.meta.url), 'utf8');
const matchingEndpoint = readFileSync(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8');
const aiFilter = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');

test('normalizes UN/LOCODE, official name and Bejaia anchorage aliases', () => {
  const polData = { unLocode: 'DZBJA', name: 'Béjaïa', aliases: ['Bejaia Port'] };
  assert.equal(normalizePortDestination('BJA ANCH', polData), true);
  assert.equal(normalizePortDestination('DZ BJA', polData), true);
  assert.equal(normalizePortDestination('SKIKDA', polData), false);
});

test('classifies near and coherent inbound candidates independently of radius', () => {
  const now = new Date('2026-08-04T00:00:00Z');
  const polData = { name: 'Bejaia' };
  assert.equal(classifyCandidateMatch({ distanceNm: 120, radiusNm: 300, destination: 'SKIKDA', polData, now }), 'NEAR_POL');
  assert.equal(classifyCandidateMatch({
    distanceNm: 900,
    radiusNm: 300,
    destination: 'BJA ANCH',
    polData,
    eta: '2026-08-08T12:00:00Z',
    laycanEnd: '2026-08-10T23:59:59Z',
    speedKnots: 10,
    now,
  }), 'INBOUND_TO_POL');
  assert.equal(classifyCandidateMatch({
    distanceNm: 900,
    radiusNm: 300,
    destination: 'DZBJA',
    polData,
    eta: '2026-08-11T00:00:00Z',
    laycanEnd: '2026-08-10',
    speedKnots: 12,
    now,
  }), 'INBOUND_TO_POL');
  assert.equal(classifyCandidateMatch({
    distanceNm: 900,
    radiusNm: 300,
    destination: 'DZBJA',
    polData,
    eta: '2026-08-11T00:00:00Z',
    laycanEnd: '2026-08-05',
    speedKnots: 5,
    now,
  }), null);
});

test('global source query filters radial or fuzzy destination rows before limiting', () => {
  assert.match(matchingSources, /distance_nm <= \$5/);
  assert.match(matchingSources, /FROM unnest\(\$6::text\[\]\) AS destination_alias/);
  assert.match(matchingSources, /destination_text/);
  assert.match(matchingSources, /searchVector: matchReason === "INBOUND_TO_POL" \? "DESTINATION_GLOBAL" : "RADIAL"/);
});

test('ranking prioritizes DWT, ballast, laycan and distance in that order', () => {
  const ranked = sortCandidates([
    { id: 'near', dwtDifference: 100, estimatedBallastStatus: false, laycanCompliant: true, distanceNm: 50 },
    { id: 'ballast', dwtDifference: 100, estimatedBallastStatus: true, laycanCompliant: false, distanceNm: 500 },
    { id: 'best-dwt', dwtDifference: 50, estimatedBallastStatus: false, laycanCompliant: false, distanceNm: 1000 },
  ]);
  assert.deepEqual(ranked.map((candidate) => candidate.id), ['best-dwt', 'ballast', 'near']);
  assert.equal(estimateBallastStatus(6, 10), true);
  assert.equal(estimateBallastStatus(9, 10), false);
});

test('database search verifies and filters DWT before slicing the ranked page', () => {
  const dwtFilterIndex = matchingSources.indexOf('verifiedDwt < minDwt');
  const rankingIndex = matchingSources.indexOf('sortCandidates(commercialCandidates)');
  const paginationIndex = matchingSources.indexOf('.slice(safeOffset, safeOffset + safeLimit)');
  assert.doesNotMatch(matchingSources, /LEFT JOIN LATERAL/);
  assert.match(matchingSources, /WHERE imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(matchingSources, /const masterByImo = new Map/);
  assert.ok(dwtFilterIndex >= 0 && dwtFilterIndex < rankingIndex && rankingIndex < paginationIndex);
  assert.match(matchingSources, /const minDwt = cargoQuantity \* 1\.05/);
  assert.match(matchingEndpoint, /findMatchingVessels\(\{/);
});

test('frontend payload exposes the commercial matching contract', () => {
  assert.match(aiFilter, /matchReason: vessel\.matchReason/);
  assert.match(aiFilter, /verifiedDwt: vessel\.verifiedDwt/);
  assert.match(aiFilter, /dwtDifference: commercialRank\.dwtDifferenceMt/);
  assert.match(aiFilter, /estimatedBallastStatus: vessel\.estimatedBallastStatus/);
});
