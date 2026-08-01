import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, matchingSource, matchingDbSource, mergeSource, filterSource, openShipsStatusSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/matching-sources.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/_shared/vessel-source-merge.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/openships-live-status.ts', import.meta.url), 'utf8'),
]);

test('matching backend pages allowed sources and sends every page through Core PRO scoring', () => {
  assert.match(matchingSource, /normalizeAllowedMatchingSources\(matchingPayload\.allowedSources \|\| body\.allowedSources\)/);
  assert.match(matchingSource, /listPaginatedMatchingSources\(/);
  assert.match(matchingSource, /mergeTripleVesselSources\(\[\], dataBridgeVessels, aisVessels, openShipsVessels\)/);
  assert.match(matchingSource, /radarSnapshot: unifiedVessels/);
  assert.match(matchingSource, /searchMode: "filtered_source_database"/);
  assert.match(matchingSource, /pagination,/);
});

test('OpenShips technical data is enriched by IMO before source merging', () => {
  assert.match(matchingSource, /enrichOpenShipsTechnicalData/);
  assert.match(matchingSource, /findExactVesselsMasterRows\(imoNumbers, \[\], \[\]\)/);
  assert.match(matchingSource, /VERIFIED_VESSELS_MASTER/);
  assert.match(matchingSource, /technicalDataEnrichment/);
  assert.match(matchingSource, /const openShipsEnrichment = await enrichOpenShipsTechnicalData/);
  assert.match(matchingSource, /VESSELS_MASTER_LOOKUP_FAILED/);
  assert.match(matchingSource, /openShipsEnrichment: openShipsEnrichment\.diagnostics/);
});

test('OpenShips live status returns the current vessel snapshot for density initialization', () => {
  assert.match(openShipsStatusSource, /SELECT DISTINCT ON \(COALESCE\(NULLIF\(mmsi::text, ''\), vessel_key\)\)/);
  assert.match(openShipsStatusSource, /'source_origin', 'OPENSHIPS'/);
  assert.match(openShipsStatusSource, /\{ recent_vessels: vessels\.length, vessels \}/);
  assert.match(indexSource, /window\.openShipsVesselsCache = Array\.isArray\(payload\?\.vessels\)/);
  assert.match(indexSource, /window\.updateOpenShipsRadar = updateOpenShipsRadar/);
});

test('source query filters Data Bridge, AIS, and OpenShips before applying limit and offset', () => {
  assert.match(matchingDbSource, /status = 'EN_CARTERA'[\s\S]*OR vm\.validation_status = 'VALIDADO'/);
  assert.match(matchingDbSource, /FROM ais_vessels/);
  assert.match(matchingDbSource, /audit_status = 'VALIDATED'/);
  assert.match(matchingDbSource, /FROM ais_telemetry_buffer/);
  assert.match(matchingDbSource, /WHERE source_system = ANY\(\$1::text\[\]\)/);
  assert.match(matchingDbSource, /active_source AS \([\s\S]*WHEN 'OPENSHIPS' THEN 1[\s\S]*WHEN 'AIS_LIVE' THEN 2[\s\S]*WHEN 'DATABRIDGE' THEN 3/);
  assert.match(matchingDbSource, /WHERE source_system = \(SELECT source_system FROM active_source\)/);
  assert.match(matchingDbSource, /LIMIT \$5[\s\S]*OFFSET \$6/);
  assert.match(matchingDbSource, /ROW_NUMBER\(\) OVER/);
});

test('server identity uses valid IMO first and normalized name plus DWT range otherwise', () => {
  assert.match(mergeSource, /return `imo-\$\{imo\}`/);
  assert.match(mergeSource, /name-dwt-\$\{name \|\| "unknown"\}-\$\{dwtRange\(dwt\)\}/);
  assert.match(mergeSource, /DWT_BUCKET_SIZE = 2500/);
  assert.match(mergeSource, /keyAliases\.get\(primaryKey\) \|\| keyAliases\.get\(fallbackKey\)/);
});

test('source unification uses an exclusive OpenShips, AIS Live, Data Bridge priority cascade', () => {
  assert.match(mergeSource, /if \(validOpenShipsRows\.length > 0\) \{[\s\S]*mergeList\(validOpenShipsRows, "OPENSHIPS"\);[\s\S]*return Array\.from\(mergedByKey\.values\(\)\);[\s\S]*\}/);
  assert.match(mergeSource, /if \(validAisRows\.length > 0\) \{[\s\S]*mergeList\(validAisRows, "AIS_LIVE"\);[\s\S]*return Array\.from\(mergedByKey\.values\(\)\);[\s\S]*\}/);
  assert.match(mergeSource, /if \(validDataBridgeRows\.length > 0\) \{[\s\S]*mergeList\(validDataBridgeRows, "DATABRIDGE"\);[\s\S]*return Array\.from\(mergedByKey\.values\(\)\);[\s\S]*\}/);
  assert.match(mergeSource, /const tagged = applyOrigins\(merged, \[origin\]\)/);
  assert.match(mergeSource, /void masterRows;[\s\S]*return \[\]/);
  assert.doesNotMatch(mergeSource, /mergeList\(dataBridgeRows, "DATABRIDGE"\)[\s\S]*mergeList\(aisRows, "AIS_LIVE"\)[\s\S]*mergeList\(openShipsRows, "OPENSHIPS"\)/);
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

test('strict technical filtering exposes DWT assessment and compact-card penalties', () => {
  assert.match(filterSource, /strictTechnicalFilter/);
  assert.match(filterSource, /status: "UNKNOWN", label: "DWT Desconocido"/);
  assert.match(filterSource, /status: "INSUFFICIENT", label: "DWT Insuficiente"/);
  assert.match(indexSource, /DWT Desconocido/);
  assert.match(indexSource, /DWT Insuficiente/);
  assert.match(indexSource, /Vessel Type:/);
  assert.match(indexSource, /strictTechnicalFilter: document\.getElementById\('hide-technical-problems-toggle'\)/);
  assert.match(indexSource, /Modo Debug Filtros/);
  assert.match(indexSource, /debugIncludeUnknownDwt: window\.matchingDebugIncludeUnknownDwt === true/);
  assert.match(filterSource, /debugUnknownDwtAllowed/);
});
