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
  assert.match(matchingSource, /findMatchingVessels\(\{/);
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

test('OpenShips live status returns a real POL-scoped vessel snapshot', () => {
  assert.match(openShipsStatusSource, /parseAisGeofence\(url\)/);
  assert.match(openShipsStatusSource, /fetchOpenShipsLive/);
  assert.match(openShipsStatusSource, /classifyCandidateMatch/);
  assert.match(openShipsStatusSource, /cache: "disabled"/);
  assert.doesNotMatch(openShipsStatusSource, /ais_telemetry_buffer|getOrSetCachedJson/);
  assert.match(openShipsStatusSource, /source: "OPENSHIPS_REST_LIVE"/);
  assert.match(openShipsStatusSource, /openshipsCount: vessels\.length/);
  assert.match(openShipsStatusSource, /geofence: \{ polLat: geofence\.latitude/);
  assert.match(indexSource, /const openShipsEndpoint = `\/api\/openships\/live-status\?\$\{params\.toString\(\)\}`[\s\S]*CoreNetworkGuard\.fetch\('openships-radar'/);
  assert.match(indexSource, /window\.openShipsVesselsCache = Array\.isArray\(payload\?\.vessels\)/);
  assert.match(indexSource, /window\.updateOpenShipsRadar = updateOpenShipsRadar/);
});

test('database source query excludes stale OpenShips buffers and enriches local sources before pagination', () => {
  assert.match(matchingDbSource, /\(vm\.status = 'EN_CARTERA'[\s\S]*OR vm\.validation_status = 'VALIDADO'\)/);
  assert.match(matchingDbSource, /COALESCE\(vm\.status, ''\)[\s\S]*NOT IN \('PENDING', 'PENDING_AUDIT'\)/);
  assert.match(matchingDbSource, /COALESCE\(vm\.audit_status, ''\)[\s\S]*NOT IN \('PENDING', 'IN_DUE_DILIGENCE', 'REJECTED'\)/);
  assert.match(matchingDbSource, /COALESCE\(vm\.process_status, ''\)[\s\S]*NOT IN \('PENDING_REVIEW', 'DUE_DILIGENCE'\)/);
  assert.match(matchingDbSource, /FROM ais_vessels/);
  assert.match(matchingDbSource, /audit_status = 'VALIDATED'/);
  assert.doesNotMatch(matchingDbSource, /ais_telemetry_buffer/);
  assert.match(matchingSource, /fetchOpenShipsLive\(\{[\s\S]*latitude: loadingPortLat,[\s\S]*longitude: loadingPortLon,[\s\S]*limit: 5000/);
  assert.match(matchingSource, /prepareOpenShipsCommercialCandidates/);
  assert.match(matchingDbSource, /WHERE source_system = ANY\(\$1::text\[\]\)/);
  assert.doesNotMatch(matchingDbSource, /LEFT JOIN LATERAL/);
  assert.match(matchingDbSource, /WHERE imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(matchingDbSource, /const masterByImo = new Map/);
  assert.match(matchingDbSource, /verifiedDwt < minDwt/);
  assert.match(matchingDbSource, /sortCandidates\(commercialCandidates\)/);
  assert.match(matchingDbSource, /slice\(safeOffset, safeOffset \+ safeLimit\)/);
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
  assert.doesNotMatch(executionSource, /openShipsCandidates/);
  assert.match(executionSource, /requestMatchingLocal\('execute', \[\], payload\)/);
  assert.doesNotMatch(matchingSource, /candidates\.map\(\(candidate\) => serializeOpenShipsVessel\(candidate\.source\)\)/);
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
  assert.match(filterSource, /status: "INSUFFICIENT", label: "DWT Insuficiente \(margen operativo 5%\)"/);
  assert.match(indexSource, /DWT Desconocido/);
  assert.match(indexSource, /DWT Insuficiente/);
  assert.match(indexSource, /Vessel Type:/);
  assert.match(indexSource, /strictTechnicalFilter: window\.matchingStrictTechnicalFilter === true/);
  assert.match(indexSource, /Modo Debug Filtros/);
  assert.match(indexSource, /debugIncludeUnknownDwt: window\.matchingDebugIncludeUnknownDwt === true/);
  assert.match(filterSource, /debugUnknownDwtAllowed/);
  assert.match(filterSource, /!strictTechnicalFilter && isUnknownTechnicalValue\(vessel\.shipType\)/);
  assert.match(filterSource, /operationallyEligible = taxonomyCompatibility\.compatible !== false[\s\S]*!strictTechnicalFilter/);
});
