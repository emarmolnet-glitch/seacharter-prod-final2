import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [filterSource, funnelSource, dueDiligenceSource, indexSource, cssSource, openShipsStatusSource] = await Promise.all([
  readFile(new URL('../src/commercial-filter.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/density-commercial-funnel.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/css/density-globe.css', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/openships-live-status.ts', import.meta.url), 'utf8'),
]);

const filterModule = await import(`data:text/javascript;base64,${Buffer.from(filterSource).toString('base64')}`);

test('commercial filter enforces 105 percent capacity and ranks by absolute DWT delta', () => {
  const result = filterModule.useCommercialFilter([
    { vesselName: 'Non Preferred Fit', shipType: 'Bulk Carrier', dwt: 10510, latitude: 1, longitude: 1, navigationalStatus: 'Under Way' },
    { vesselName: 'Anchor Delta 600', shipType: 'General Cargo', dwt: 10600, latitude: 2, longitude: 2, navigationalStatus: 'At Anchor' },
    { vesselName: 'Anchor Delta 550', shipType: 'Bulk Carrier', dwt: 10550, latitude: 3, longitude: 3, navigationalStatus: 'At Anchor' },
    { vesselName: 'Too Small', shipType: 'Bulk Carrier', dwt: 10499, latitude: 4, longitude: 4, navigationalStatus: 'At Anchor' },
    { vesselName: 'Tanker Noise', shipType: 'Oil Tanker', dwt: 10520, latitude: 5, longitude: 5, navigationalStatus: 'At Anchor' },
  ], {
    targetCargoDwt: 10000,
    capacityTolerance: 1.05,
    polCoordinates: { lat: 0, lon: 0 },
    limit: 5,
  });

  assert.equal(result.minimumViableDwt, 10500);
  assert.deepEqual(result.filteredVessels.map(vessel => vessel.vesselName), [
    'Anchor Delta 550',
    'Anchor Delta 600',
  ]);
  assert.equal(result.topMatches[0].commercialMatch.deltaDwt, 550);
});

test('distance to POL is used only when DWT deltas are tied', () => {
  const result = filterModule.useCommercialFilter([
    { vesselName: 'Far Twin', shipType: 'Bulk Carrier', dwt: 11000, latitude: 10, longitude: 10, navigationalStatus: 'At Anchor' },
    { vesselName: 'Near Twin', shipType: 'Bulk Carrier', dwt: 11000, latitude: 1, longitude: 1, navigationalStatus: 'At Anchor' },
  ], {
    targetCargoDwt: 10000,
    polCoordinates: { lat: 0, lon: 0 },
  });

  assert.equal(result.topMatches[0].vesselName, 'Near Twin');
});

test('density map toggles between complete OpenShips traffic and strict commercial matches', () => {
  assert.match(indexSource, /window\.useCommercialFilter\(sourceVessels/);
  assert.match(indexSource, /capacityTolerance: 1\.05/);
  assert.match(indexSource, /limit: 6/);
  assert.match(indexSource, /const displayVessels = isGlobalDebugActive \? filteredVessels : rawVessels/);
  assert.match(indexSource, /vesselsData: displayVessels/);
  assert.match(indexSource, /renderFilteredAisCounters\?\.\(displayVessels\)/);
  assert.match(indexSource, /renderDensityVesselsTable\?\.\(displayVessels\)/);
  assert.match(funnelSource, /\[data-commercial-filter-toggle\]/);
  assert.match(funnelSource, /setIsGlobalDebugActive/);
  assert.match(funnelSource, /setIsGlobalDebugActive\?\.\(!isGlobalDebugActive/);
  assert.match(funnelSource, /DEBUG DWT · \$\{active \? 'ON' : 'OFF'\}/);
  assert.match(indexSource, /const displayVessels = densityPolCoordinates[\s\S]*\? getDensityMapSourceVessels\(\)/);
});

test('Densidad and Coincidencia bind to the same global commercial state', () => {
  assert.match(indexSource, /id="density-commercial-filter-toggle"[\s\S]*data-commercial-filter-toggle/);
  assert.match(indexSource, /id="matching-commercial-filter-toggle"[\s\S]*data-commercial-filter-toggle/);
  assert.match(indexSource, /isGlobalDebugActive: false/);
  assert.match(indexSource, /targetCargoDwt: 0/);
  assert.match(indexSource, /setCommercialVesselState\(nextState = \{\}/);
  assert.match(indexSource, /commercial-vessel-state-updated/);
  assert.match(indexSource, /window\.GlobalStore\?\.setTargetCargoDwt\?\.\(matchingQuantity/);
  assert.match(indexSource, /sharedOpenShipsCandidates = commercialVesselState\.isGlobalDebugActive === true/);
  assert.match(indexSource, /setIsGlobalDebugActive\(isActive/);
});

test('density removes Top 6 and renders the shared display fleet only in the native table', () => {
  assert.doesNotMatch(indexSource, /density-commercial-matches-panel|Top 6 Matches/);
  assert.doesNotMatch(funnelSource, /renderCommercialMatches|density-commercial-card|EmptyState/);
  assert.doesNotMatch(cssSource, /\.density-commercial-panel|\.density-commercial-card|\.density-commercial-empty/);
  assert.match(indexSource, /function renderDensityVesselsTable\(vessels/);
  assert.match(indexSource, /const visibleRows = displayVessels\.slice\(0, maxRows\)/);
  assert.match(indexSource, /id="ais-vessels-tbody"/);
  assert.match(cssSource, /\.density-due-diligence-panel \{/);
  assert.match(cssSource, /inset: 12px auto 12px 12px/);
  assert.match(cssSource, /z-index: 50/);
  assert.match(cssSource, /width: min\(440px, calc\(100% - 24px\)\)/);
  assert.match(cssSource, /transform: translateX\(-18px\)/);
});

test('empty commercial results reuse the matching snapshot instead of blanking density', () => {
  assert.match(indexSource, /const matchingFilteredVessels = normalizeDensityVesselCollection/);
  assert.match(indexSource, /commercialState\.filteredVessels\.length > 0[\s\S]*\? commercialState\.filteredVessels[\s\S]*: matchingFilteredVessels/);
  assert.match(indexSource, /commercialFilterReady: false/);
  assert.match(indexSource, /if \(window\.GlobalStore\.commercialFilterReady !== true\)/);
});

test('matching-validation becomes the authoritative Density snapshot', () => {
  assert.match(indexSource, /this\.aisMatchingStateSource === 'matching-validation'[\s\S]*filteredVessels: this\.compatibleVessels[\s\S]*isGlobalDebugActive: true/);
  assert.match(indexSource, /const hasCommittedMatchingSnapshot = store\?\.aisMatchingStateSource === 'matching-validation'/);
  assert.match(indexSource, /if \(hasCommittedMatchingSnapshot\) \{[\s\S]*const displayVessels = getDensityDisplayVessels\(\)[\s\S]*return window\.setRenderFleet\(displayVessels\)/);
});

test('Density table identifies OpenShips as its live source', () => {
  assert.match(indexSource, /BUQUES DETECTADOS EN TIEMPO REAL \(OPENSHIPS\)/);
  assert.doesNotMatch(indexSource, /BUQUES DETECTADOS EN TIEMPO REAL \(AIS LIVE\)/);
  assert.match(indexSource, /<th class="py-2\.5 px-3">GT<\/th>/);
  assert.match(indexSource, /<th class="py-2\.5 px-3">DWT<\/th>/);
  assert.match(indexSource, /<th class="py-2\.5 px-3">LOA<\/th>/);
  assert.match(indexSource, /<th class="py-2\.5 px-3">Bandera<\/th>/);
  assert.match(indexSource, /<th class="py-2\.5 px-3">Año<\/th>/);
  assert.match(indexSource, /onclick="event\.stopPropagation\(\)" data-due-diligence-button/);
  assert.match(indexSource, /row\.dataset\.densityCommercialMatch = 'true'/);
});

test('Density table infers spatial status and never fabricates missing speed', () => {
  assert.match(indexSource, /window\.inferSpatialVesselStatus\(vessel, getDensityReferencePortCoordinates\(\)\)/);
  assert.match(indexSource, /window\.readRealVesselSpeed\(vessel\)/);
  assert.match(indexSource, /Number\.isFinite\(speed\) \? `\$\{speed\.toFixed\(1\)\} kn` : 'N\/D'/);
  assert.doesNotMatch(indexSource, /statusLabel: v\.statusLabel \|\| \(speed >= 1 \? "Navegando" : "En Puerto"\)/);
});

test('Due Diligence separates discard, save, and calculator handoff actions', () => {
  const persistenceIndex = dueDiligenceSource.indexOf('const persistenceResult = await persistDueDiligenceVessel');
  const storeIndex = dueDiligenceSource.indexOf('commitVerifiedVesselToGlobalState(verifiedVessel)', persistenceIndex);
  const calculatorIndex = dueDiligenceSource.indexOf("globalScope.switchTab('estimator')", storeIndex);
  assert.ok(persistenceIndex >= 0 && storeIndex > persistenceIndex && calculatorIndex > storeIndex);
  assert.match(dueDiligenceSource, /commitVerifiedVesselToGlobalState/);
  assert.match(dueDiligenceSource, /Descartar Buque/);
  assert.match(dueDiligenceSource, /Guardar Datos/);
  assert.match(dueDiligenceSource, /Calcular Flete/);
  assert.match(dueDiligenceSource, /discard\.type = 'button'/);
  assert.match(dueDiligenceSource, /discard\.disabled = !normalizeImo[\s\S]*&& !normalizeMmsi/);
  assert.match(dueDiligenceSource, /save\.type = 'button'/);
  assert.match(dueDiligenceSource, /globalScope\.applyResolvedVesselToCalculator/);
  assert.match(dueDiligenceSource, /globalScope\.switchTab\('estimator'\)/);
  assert.match(dueDiligenceSource, /if \(!densityCommercialFlow \|\| calculateFreight\) commitVerifiedVesselToGlobalState/);
  assert.match(dueDiligenceSource, /discardDueDiligenceVessel\(vessel/);
  assert.match(dueDiligenceSource, /mergeVerifiedVesselIntoDensityState\(verifiedVessel\)/);
  assert.match(dueDiligenceSource, /syncDensityDisplayConsumers\?\.\(\{ updateGlobe: false \}\)/);
  assert.match(dueDiligenceSource, /vessel:density-optimistic-update/);
  assert.match(indexSource, /window\.applyResolvedVesselToCalculator = applyResolvedVesselToCalculator/);
});

test('OpenShips polling treats vessels_master as the authoritative technical source', () => {
  assert.match(openShipsStatusSource, /FROM vessels_master/);
  assert.match(openShipsStatusSource, /imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(openShipsStatusSource, /mmsi = ANY\(\$2::text\[\]\)/);
  assert.match(openShipsStatusSource, /function mergeMasterTechnicalData/);
  assert.match(openShipsStatusSource, /\.\.\.vessel,[\s\S]*\.\.\.masterFields/);
  assert.match(openShipsStatusSource, /technicalDataSource: "VESSELS_MASTER"/);
  assert.match(openShipsStatusSource, /DWT: dwt/);
  assert.match(openShipsStatusSource, /String\(master\.status \|\| ""\)\.toLowerCase\(\) === "discarded"/);
  assert.match(indexSource, /discardedVesselImos: \[\]/);
  assert.match(indexSource, /discardedVesselMmsis: \[\]/);
  assert.match(indexSource, /markVesselDiscarded\(identity = \{\}, metadata = \{\}\)/);
  assert.match(indexSource, /const discardedImos = new Set/);
  assert.match(indexSource, /const discardedMmsis = new Set/);
  assert.match(indexSource, /discardedByImo[\s\S]*discardedByMmsi/);
  assert.match(indexSource, /return !discardedByImo && !discardedByMmsi/);
});
