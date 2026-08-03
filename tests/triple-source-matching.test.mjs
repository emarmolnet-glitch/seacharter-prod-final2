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
  assert.doesNotMatch(matchingDbSource, /active_source AS/);
  assert.doesNotMatch(matchingDbSource, /WHERE source_system = \(SELECT source_system FROM active_source\)/);
  assert.match(matchingDbSource, /LIMIT \$6[\s\S]*OFFSET \$7/);
  assert.match(matchingDbSource, /ABS\(COALESCE\(payload->>'dwt', payload->>'DWT'\)::double precision - \$5\)/);
  assert.match(matchingDbSource, /ROW_NUMBER\(\) OVER/);
});

test('server identity uses IMO, MMSI, and normalized name plus DWT without collapsing raw OpenShips vessels', () => {
  assert.match(mergeSource, /return `imo-\$\{imo\}`/);
  assert.match(mergeSource, /return `mmsi-\$\{mmsi\}`/);
  assert.match(mergeSource, /name-dwt-\$\{name \|\| "unknown"\}-\$\{dwtRange\(dwt\)\}/);
  assert.match(mergeSource, /DWT_BUCKET_SIZE = 2500/);
  assert.match(mergeSource, /keyAliases\.get\(primaryKey\) \|\| keyAliases\.get\(fallbackKey\)/);
});

test('source unification concatenates every selected source and preserves combined origins', () => {
  assert.match(mergeSource, /mergeList\(dataBridgeRows, "DATABRIDGE"\)[\s\S]*mergeList\(aisRows, "AIS_LIVE"\)[\s\S]*mergeList\(openShipsRows, "OPENSHIPS"\)/);
  assert.match(mergeSource, /existingOrigins[\s\S]*applyOrigins\(merged, \[\.\.\.existingOrigins, origin\]\)/);
  assert.doesNotMatch(mergeSource, /validOpenShipsRows\.length > 0/);
});

test('matching execution uses the unified backend response and exposes source badges', () => {
  const executionStart = indexSource.indexOf('async function executeMatchingEngine');
  const executionEnd = indexSource.indexOf('function getMatchingExecutionRouteOverride', executionStart);
  const executionSource = indexSource.slice(executionStart, executionEnd);
  assert.match(executionSource, /const openShipsCandidates = !isAppending[\s\S]*payload\.allowedSources\.includes\('OPENSHIPS'\)/);
  assert.match(executionSource, /requestMatchingLocal\('execute', openShipsCandidates, payload\)/);
  assert.match(matchingSource, /candidates\.map\(\(candidate\) => serializeOpenShipsVessel\(candidate\.source\)\)/);
  assert.doesNotMatch(executionSource, /radarLiveRes|dataBridgeRes|Promise\.allSettled/);
  assert.match(indexSource, /sourceBadgesHtml/);
  assert.match(indexSource, /data-source-origin="\$\{sourceOriginLabel\}"/);
  assert.match(indexSource, /DATABRIDGE:[\s\S]*AIS_LIVE:[\s\S]*OPENSHIPS:/);
  assert.match(indexSource, /DATABRIDGE: 'Data Bridge'/);
  assert.match(indexSource, /value="OPENSHIPS" checked/);
  assert.match(indexSource, /selectedSources\.length > 0 \? selectedSources : \['DATABRIDGE', 'AIS_LIVE', 'OPENSHIPS'\]/);
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
  assert.match(indexSource, /strictTechnicalFilter: false/);
  assert.match(indexSource, /Modo Debug Filtros/);
  assert.match(indexSource, /debugIncludeUnknownDwt: window\.matchingDebugIncludeUnknownDwt === true/);
  assert.match(filterSource, /debugUnknownDwtAllowed/);
  assert.match(filterSource, /!strictTechnicalFilter && isUnknownTechnicalValue\(vessel\.shipType\)/);
  assert.match(filterSource, /operationallyEligible = taxonomyCompatibility\.compatible !== false[\s\S]*!strictTechnicalFilter/);
});
