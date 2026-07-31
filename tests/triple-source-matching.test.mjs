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

test('matching backend loads master, Data Bridge portfolio, and validated AIS concurrently', () => {
  assert.match(matchingSource, /Promise\.all\(\[/);
  assert.match(matchingSource, /listLocalVesselsMaster\(6000\)/);
  assert.match(matchingSource, /listDataBridgePortfolioVessels\(2000\)/);
  assert.match(matchingSource, /listValidatedAisVesselsNearPol\(loadingPortLat, loadingPortLon, matchRadiusNm, 2000\)/);
  assert.match(matchingSource, /mergeTripleVesselSources\(masterVessels, dataBridgeVessels, aisVessels\)/);
  assert.match(matchingSource, /searchMode: "triple_source_database"/);
});

test('Data Bridge and AIS queries enforce portfolio, validation, and POL proximity filters', () => {
  assert.match(matchingDbSource, /status = 'EN_CARTERA'[\s\S]*OR validation_status = 'VALIDADO'/);
  assert.match(matchingDbSource, /FROM ais_vessels/);
  assert.match(matchingDbSource, /audit_status = 'VALIDATED'/);
  assert.match(matchingDbSource, /WHERE distance_nm <= \$8/);
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
  assert.match(indexSource, /MASTER:[\s\S]*DATABRIDGE:[\s\S]*AIS_LIVE:/);
});

test('scoring preserves vessel key and combined source origins', () => {
  assert.match(filterSource, /source_origins: vessel\.sourceOrigins/);
  assert.match(filterSource, /source_origin: vessel\.sourceOrigin/);
  assert.match(filterSource, /vessel_key: vessel\.vesselKey/);
});
