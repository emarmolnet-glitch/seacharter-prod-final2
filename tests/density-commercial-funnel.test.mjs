import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [filterSource, funnelSource, dueDiligenceSource, indexSource, cssSource, openShipsStatusSource, globeSource] = await Promise.all([
  readFile(new URL('../src/commercial-filter.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/density-commercial-funnel.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/css/density-globe.css', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/openships-live-status.ts', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
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
  assert.match(indexSource, /function getDensityReactiveVessels\(\)[\s\S]*GlobalStore\?\.matchingVessels/);
  assert.match(indexSource, /function getDensityMapSourceVessels\(\)[\s\S]*getDensityReactiveVessels\(\)/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf('function getDensityMapSourceVessels()'), indexSource.indexOf('window.getDensityMapSourceVessels')), /openShipsVesselsCache|rawVessels|filteredVessels|compatibleVessels|nearbyVessels/);
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
  assert.match(indexSource, /function renderDensityVesselsTable\(_vessels, _options = \{\}\)[\s\S]*const displayVessels = getDensityReactiveVessels\(\)[\s\S]*const visibleRows = displayVessels;/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf('function renderDensityVesselsTable'), indexSource.indexOf('window.renderDensityVesselsTable')), /slice\(0, maxRows\)/);
});

test('empty commercial results reuse the matching snapshot instead of blanking density', () => {
  assert.match(indexSource, /function getDensityReactiveVessels\(\)[\s\S]*Array\.isArray\(window\.GlobalStore\?\.matchingVessels\)[\s\S]*window\.GlobalStore\.matchingVessels/);
  assert.match(indexSource, /function renderDensitySnapshotFromGlobalStore\(\)[\s\S]*const count = matchingVessels\.length/);
  assert.match(indexSource, /set\(vessels\)[\s\S]*density-fleet-updated/);
});

test('matching-validation becomes the authoritative Density snapshot', () => {
  assert.match(indexSource, /Object\.defineProperty\(GlobalStore, 'matchingVessels'/);
  assert.match(indexSource, /GlobalStore\.nearbyVessels = densityMatchingVessels\.slice\(\)/);
  assert.match(indexSource, /GlobalStore\.compatibleVessels = densityMatchingVessels\.slice\(\)/);
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

test('density globe merges predictive vessels without geographic clipping', () => {
  assert.match(indexSource, /const visibleRenderFleet = displayVessels;/);
  assert.match(globeSource, /renderVesselLayer\(view, view\.vessels\)/);
  assert.match(globeSource, /const centralRadarVessels = getCentralRadarVessels\(\)/);
  assert.match(globeSource, /Array\.isArray\(window\.GlobalStore\.matchingVessels\)[\s\S]*return window\.GlobalStore\.matchingVessels/);
  assert.doesNotMatch(globeSource, /applyVesselDecluttering|getDeclutterBucketKey|buildVesselTacticalLabels/);
});

test('density table and header expose local versus inbound origin', () => {
  assert.match(indexSource, /data-density-origin="local-radius"/);
  assert.match(indexSource, /data-density-origin="global-inbound"/);
  assert.match(indexSource, /Inbound to POL/);
  assert.match(indexSource, /globales en tránsito/);
  assert.match(indexSource, /getDensityRadarOriginBreakdown/);
});

test('Density table infers spatial status and never fabricates missing speed', () => {
  assert.match(indexSource, /window\.inferSpatialVesselStatus\(vessel, getDensityReferencePortCoordinates\(\)\)/);
  assert.match(indexSource, /window\.readRealVesselSpeed\(vessel\)/);
  assert.match(indexSource, /Number\.isFinite\(speed\) \? `\$\{speed\.toFixed\(1\)\} kn` : 'N\/D'/);
  assert.doesNotMatch(indexSource, /statusLabel: v\.statusLabel \|\| \(speed >= 1 \? "Navegando" : "En Puerto"\)/);
});

test('Density table binds persisted Due Diligence keys before stale AIS aliases', () => {
  assert.match(indexSource, /\['gross_tonnage', 'gt', 'grossTonnage', 'GT'\]/);
  assert.match(indexSource, /\[\s*'vessel_type', 'clase', 'type', 'vesselClass', 'vessel_class'/);
  assert.match(indexSource, /\['loa_meters', 'loa', 'loaMeters', 'LOA'/);
  assert.match(indexSource, /\['year_built', 'year', 'yearBuilt', 'builtYear', 'built_year'\]/);
  assert.match(indexSource, /grossTonnage \? grossTonnage\.toLocaleString\('es-ES'\) : 'REQUERIDO'/);
  assert.match(indexSource, /loaMeters \? `\$\{loaMeters\.toLocaleString\('es-ES'\)\} m` : 'N\/D'/);
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
  assert.match(openShipsStatusSource, /technicalDataSource: "VESSELS_MASTER"/);
  assert.match(indexSource, /markVesselDiscarded\(identity = \{\}, metadata = \{\}\)/);
  assert.match(indexSource, /\['rawVessels', 'filteredVessels', 'vessels', 'renderedAisVessels', 'matchingVessels', 'compatibleVessels'\]/);
});
