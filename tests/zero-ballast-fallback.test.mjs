import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [routeSource, trackingSource, voyageStoreSource, charterPartySource] = await Promise.all([
  readFile(new URL('../netlify/functions/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/charter-party.ts', import.meta.url), 'utf8'),
]);

test('backend short-circuits ballast routes inside the anchorage radius', () => {
  assert.match(routeSource, /const ANCHORAGE_RADIUS_NM = 15/);
  assert.match(routeSource, /haversineDistanceNm\(origin, destination\)/);
  assert.match(routeSource, /isBallastRoute\(body\) && directDistanceNm < ANCHORAGE_RADIUS_NM/);
  assert.match(routeSource, /distance_nm: 0/);
  assert.match(routeSource, /duration_hours: 0/);
  assert.match(routeSource, /zeroBallast: true/);
});

test('frontend avoids routing calls and accepts a two-point zero-ballast route', () => {
  assert.match(trackingSource, /isBallastAudit && directDistanceNm < 15/);
  assert.match(trackingSource, /isBallastRoute && directDistanceNm < 15/);
  assert.match(trackingSource, /zeroBallastRoute \? null : await fetch\('\/api\/route'/);
  assert.match(trackingSource, /validZeroBallast/);
  assert.match(trackingSource, /routeKind: 'ballast'/);
});

test('voyage draft retains an explicit zero ballast distance and geometry', () => {
  assert.match(voyageStoreSource, /const normalizedDistance = cleanNonNegativeNumber\(ballastDistanceNm\)/);
  assert.match(voyageStoreSource, /ballastDistanceNm: normalizedDistance \?\? current\.draft\.ballastDistanceNm/);
  assert.match(voyageStoreSource, /ballastDistanceSource: normalizedDistance !== null/);
  assert.match(voyageStoreSource, /lastreCoordinates: normalizedCoordinates\.length >= 2/);
});

test('charter party persistence keeps zero as a valid audited distance', () => {
  assert.match(charterPartySource, /Number\.isFinite\(ballastDistanceNm\) && ballastDistanceNm >= 0/);
});
