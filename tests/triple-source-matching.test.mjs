import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, matchingSource, matchingDbSource, mergeSource, filterSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/matching-sources.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/_shared/vessel-source-merge.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8'),
]);

test('matching backend pages allowed sources and sends every page through Core PRO scoring', () => {
  assert.match(matchingSource, /normalizeAllowedMatchingSources\(matchingPayload\.allowedSources \|\| body\.allowedSources\)/);
  assert.match(matchingSource, /listPaginatedMatchingSources\(/);
  assert.match(matchingSource, /mergeTripleVesselSources\(\[\], dataBridgeVessels, aisVessels, openShipsVessels\)/);
  assert.match(matchingSource, /radarSnapshot: unifiedVessels/);
  assert.match(matchingSource, /searchMode: "filtered_source_database"/);
  assert.match(matchingSource, /pagination,/);
});

test('source query filters Data Bridge, AIS, and OpenShips before applying limit and offset', () => {
  assert.match(matchingDbSource, /status = 'EN_CARTERA'[\s\S]*OR vm\.validation_status = 'VALIDADO'/);
  assert.match(matchingDbSource, /FROM ais_vessels/);
  assert.match(matchingDbSource, /audit_status = 'VALIDATED'/);
  assert.match(matchingDbSource, /FROM ais_telemetry_buffer/);
  assert.match(matchingDbSource, /WHERE source_system = ANY\(\$1::text\[\]\)/);
  assert.match(matchingDbSource, /LIMIT \$5[\s\S]*OFFSET \$6/);
  assert.match(matchingDbSource, /ROW_NUMBER\(\) OVER/);
});

test('server identity uses valid IMO first and normalized name plus DWT range otherwise', () => {
  assert.match(mergeSource, /return `imo-\$\{imo\}`/);
  assert.match(mergeSource, /name-dwt-\$\{name \|\| "unknown"\}-\$\{dwtRange\(dwt\)\}/);
  assert.match(mergeSource, /DWT_BUCKET_SIZE = 2500/);
  assert.match(mergeSource, /keyAliases\.get\(primaryKey\) \|\| keyAliases\.get\(fallbackKey\)/);
});

test('matching execution uses the unified backend response and exposes source badges', () => {
  const executionStart = indexSource.indexOf('async function executeMatchingEngine');
  const executionEnd = indexSource.indexOf('function getMatchingExecutionRouteOverride', executionStart);
  const executionSource = indexSource.slice(executionStart, executionEnd);
  assert.match(executionSource, /const data = await requestMatchingLocal\('execute', \[\], payload\)/);
  assert.doesNotMatch(executionSource, /radarLiveRes|dataBridgeRes|Promise\.allSettled/);
  assert.match(indexSource, /sourceBadgesHtml/);
  assert.match(indexSource, /data-source-origin="\$\{sourceOriginLabel\}"/);
  assert.match(indexSource, /DATABRIDGE:[\s\S]*AIS_LIVE:[\s\S]*OPENSHIPS:/);
  assert.match(indexSource, /matching-source-toggle/);
  assert.match(indexSource, /matching-load-more-button/);
  assert.match(indexSource, /previousMatches\.concat/);
});

test('scoring preserves vessel key and combined source origins', () => {
  assert.match(filterSource, /source_origins: vessel\.sourceOrigins/);
  assert.match(filterSource, /source_origin: vessel\.sourceOrigin/);
  assert.match(filterSource, /vessel_key: vessel\.vesselKey/);
});
