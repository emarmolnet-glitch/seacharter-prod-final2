import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [storeSource, entrySource, trackingSource, indexSource, charterSource, routeConfiguratorSource, globeSource] = await Promise.all([
  readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/voyage-draft-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/charter-party.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/RouteConfigurator.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
]);

test('DraftVoyage centralizes route, laycan, cargo and audited vessel data', () => {
  assert.match(storeSource, /export const voyageStore = createStore/);
  assert.match(storeSource, /pol: null/);
  assert.match(storeSource, /pod: null/);
  assert.match(storeSource, /laycan:/);
  assert.match(storeSource, /quantityMt/);
  assert.match(storeSource, /ballastDistanceNm/);
  assert.match(storeSource, /ballastDistanceSource/);
  assert.match(storeSource, /lastreCoordinates: \[\]/);
  assert.match(storeSource, /distanceNm: null/);
  assert.match(storeSource, /routeGeometry: null/);
  assert.match(storeSource, /applyTrackingAudit/);
  assert.match(storeSource, /applyTrackingRoute/);
  assert.match(storeSource, /applyMatchingCandidate/);
  assert.match(storeSource, /matching-neon-maritime/);
  assert.match(storeSource, /lastreCoordinates: normalizedCoordinates\.length > 2/);
  assert.match(entrySource, /window\.VoyageDraftStore = voyageStore/);
  assert.match(entrySource, /calculatorStore\.subscribe/);
});

test('DraftVoyage preserves cancelling when calculator updates omit it and accepts snake-case aliases', () => {
  assert.match(storeSource, /state\.laycan_start[\s\S]*\|\| current\.draft\.laycan\.laydays/);
  assert.match(storeSource, /state\.laycan_end[\s\S]*\|\| current\.draft\.laycan\.cancelling/);
  assert.match(storeSource, /laycan: \{[\s\S]*laydays,[\s\S]*cancelling,/);
});

test('audited ballast distance survives calculator recalculation until a manual edit', () => {
  assert.match(storeSource, /if \(incomingDistance === 0 && retainedDistance > 0\) return retainedDistance/);
  assert.match(storeSource, /setBallastDistance/);
  assert.match(storeSource, /ballastDistanceSource: cleanNumber\(ballastDistanceNm\) > 0[\s\S]*'tracking-audit'/);
  assert.match(storeSource, /ballastDistanceSource: cleanNumber\(ballastDistanceNm\) > 0[\s\S]*'tracking-route'/);
  assert.match(entrySource, /bindManualBallastDistance/);
  assert.match(entrySource, /source: 'calculator-manual'/);
  assert.match(entrySource, /source: 'voyage-draft-ballast-restore'/);
  assert.match(entrySource, /setValue\('dist-ballast', retainedBallastDistance\)/);
  assert.match(indexSource, /function readEffectiveBallastDistance\(\)/);
  assert.match(indexSource, /const distBal = typeof readEffectiveBallastDistance === 'function'[\s\S]*\? readEffectiveBallastDistance\(\)/);
  assert.match(indexSource, /const dBal = readEffectiveBallastDistance\(\) \/ \(\(parseFloat\(document\.getElementById\('spd-ballast'\)\.value\) \|\| 11\) \* 24\)/);
});

test('Tracking keeps free, audit and contract data paths structurally separate', () => {
  assert.match(trackingSource, /flowMode: 'free'/);
  assert.match(trackingSource, /hasAuditDraft\(\) \? 'audit' : 'free'/);
  assert.match(trackingSource, /trackingState\.flowMode === 'contract'/);
  assert.match(trackingSource, /trackingState\.flowMode === 'audit'/);
  assert.match(trackingSource, /Tracking Libre solo geolocaliza/);
  assert.match(trackingSource, /applyTrackingAudit/);
  assert.doesNotMatch(trackingSource, /applyBasicAisDestination\(payload\.vessel\.destination\)/);
});

test('calculator confirms the final snapshot in Neon and clears the draft', () => {
  assert.doesNotMatch(indexSource, /Paso 9 · Cierre del Draft Voyage/);
  assert.match(routeConfiguratorSource, /Confirmar y Generar Charter Party/);
  assert.match(routeConfiguratorSource, /fetch\("\/api\/v1\/charter-party"/);
  assert.match(routeConfiguratorSource, /draftVoyage\.ballastDistanceNm/);
  assert.match(routeConfiguratorSource, /const sanitizedPayload: CharterPartyPayload = \{/);
  assert.match(routeConfiguratorSource, /body: JSON\.stringify\(sanitizedPayload\)/);
  assert.match(routeConfiguratorSource, /vesselDwt: payload\.vesselDwt/);
  assert.match(routeConfiguratorSource, /vesselGt: payload\.vesselGt/);
  assert.match(routeConfiguratorSource, /vesselFlag: payload\.vesselFlag/);
  assert.match(routeConfiguratorSource, /vesselYearBuilt: payload\.vesselYearBuilt/);
  assert.match(routeConfiguratorSource, /mmsi: payload\.mmsi/);
  assert.match(routeConfiguratorSource, /voyageStore\.getState\(\)\.clearDraft\(\)/);
  assert.doesNotMatch(entrySource, /fetch\('\/api\/v1\/charter-party'/);
  assert.doesNotMatch(charterSource, /vesselTechnical|draftSnapshot/);
  assert.doesNotMatch(routeConfiguratorSource, /draftValidationJson|JSON\.stringify\(validation\)/);
  assert.doesNotMatch(charterSource, /draftValidationJson/);
  assert.match(charterSource, /db\.insert\(voyagesTracking\)/);
});

test('pre-fixture footer renders audited distance and AIS speed', () => {
  assert.match(trackingSource, /const auditDistance = Number\(totalDistance \?\? getVoyageDraft\(\)\?\.ballastDistanceNm\)/);
  assert.match(trackingSource, /const aisSpeed = Number\(trackingState\.basicVessel\?\.speedKnots \?\? trackingState\.basicVessel\?\.speed\)/);
  assert.match(trackingSource, /\(hasVoyageData \|\| auditMode\)/);
});

test('pre-fixture ballast uses the shared maritime routing engine', () => {
  assert.match(trackingSource, /fetch\('\/api\/route'/);
  assert.match(trackingSource, /\[origin\.lng, origin\.lat\]/);
  assert.match(trackingSource, /\[destination\.lng, destination\.lat\]/);
  assert.match(trackingSource, /coordinateOrder: 'lonLat'/);
  assert.match(trackingSource, /payload\.coordinates\.length < 3/);
  assert.doesNotMatch(indexSource, /window\.calculateMaritimeRouteBetweenPoints/);
});

test('pre-fixture GIS injects and restores the complete ballast polyline', () => {
  assert.match(trackingSource, /routes: isBallastAudit[\s\S]*ballast: \{ \.\.\.payload/);
  assert.match(trackingSource, /ballast: \{ \.\.\.origin, name: `POS - \${origin\.name}` \}/);
  assert.match(trackingSource, /pol: \{ \.\.\.destination, name: `POL - \${destination\.name}` \}/);
  assert.match(trackingSource, /lastreCoordinates: result\.routes\?\.ballast\?\.coordinates/);
  assert.match(trackingSource, /function hydrateDraftBallastRoute\(\)/);
  assert.match(trackingSource, /const coordinates = Array\.isArray\(draft\?\.lastreCoordinates\)/);
  assert.match(trackingSource, /hydrateDraftBallastRoute\(\);/);
  assert.match(globeSource, /prepareRoutePoints\(routes\?\.ballast, ballast, pol\)/);
  assert.match(globeSource, /supplied\.length > 2 \? supplied : interpolateGreatCircle/);
});
test('cost synchronization exits before reading missing financial results', () => {
  assert.match(indexSource, /if \(!sharedCostBasis \|\| !Number\.isFinite\(Number\(sharedCostBasis\?\.totalCosts\)\)\) return null/);
  assert.match(indexSource, /if \(!sharedCostBasis \|\| !Number\.isFinite\(Number\(sharedCostBasis\?\.totalCosts\)\)\) return false/);
  assert.match(indexSource, /if \(!costPlusResults\) return false/);
  assert.match(indexSource, /function forceRefreshCalculations[\s\S]*\.some\(\(value\) => Number\.isFinite/);
});
