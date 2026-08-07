import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [filterSource, openShipsSource, sharedSource, aiFilterSource, matchingSources] = await Promise.all([
  readFile(new URL('../netlify/functions/vessels-filter.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/openships-live-status.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/_shared/verified-vessel-classes.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/matching-sources.ts', import.meta.url), 'utf8'),
]);

test('radar master enrichment uses one batch query and in-memory indexes', () => {
  assert.match(filterSource, /WHERE imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(filterSource, /mmsi = ANY\(\$2::text\[\]\)/);
  assert.equal((filterSource.match(/FROM vessels_master/g) || []).length, 1);
  assert.doesNotMatch(filterSource, /JOIN LATERAL/);
  assert.match(filterSource, /const masterByImo = new Map/);
  assert.match(filterSource, /const masterByMmsi = new Map/);
  assert.match(filterSource, /rawRows[\s\S]*flatMap/);
  assert.doesNotMatch(filterSource, /flatMap\([\s\S]{0,800}(?:getPool\(\)|\.query<)/);
});

test('matching source enrichment also avoids correlated master lookups', () => {
  assert.doesNotMatch(matchingSources, /LEFT JOIN LATERAL/);
  assert.match(matchingSources, /WHERE imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(matchingSources, /const masterByImo = new Map/);
  assert.match(matchingSources, /Batch master lookup failed; raw source rows preserved/);
  assert.doesNotMatch(matchingSources, /flatMap\([\s\S]{0,1000}(?:getPool\(\)|\.query<)/);
});

test('OpenShips sweep preserves the raw snapshot when master lookup fails', () => {
  assert.equal((openShipsSource.match(/FROM vessels_master/g) || []).length, 1);
  assert.match(openShipsSource, /imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(openShipsSource, /Batch master lookup failed; raw OpenShips snapshot preserved/);
  assert.match(openShipsSource, /if \(degraded\) return \[vessel\]/);
  assert.match(openShipsSource, /status: degraded \? 206 : 200/);
});

test('AI filter batch helper degrades to HTTP 206 without blanking the UI', () => {
  assert.equal((sharedSource.match(/FROM vessels_master/g) || []).length, 1);
  assert.match(sharedSource, /imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(sharedSource, /degraded: true/);
  assert.match(aiFilterSource, /if \(verifiedSnapshot\.degraded\)/);
  assert.match(aiFilterSource, /data: vessels/);
  assert.match(aiFilterSource, /nearbyVessels: vessels/);
  assert.match(aiFilterSource, /status: 206/);
});
