import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [filterSource, funnelSource, dueDiligenceSource, indexSource, cssSource] = await Promise.all([
  readFile(new URL('../src/commercial-filter.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/density-commercial-funnel.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/css/density-globe.css', import.meta.url), 'utf8'),
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

test('density map consumes the commercial OpenShips result before rendering', () => {
  assert.match(indexSource, /window\.useCommercialFilter\(openShipsData/);
  assert.match(indexSource, /capacityTolerance: 1\.05/);
  assert.match(indexSource, /return window\.setRenderFleet\(commercialState\.filteredVessels\)/);
  assert.match(indexSource, /const openShipsData = densityPolCoordinates[\s\S]*\? getDensityMapSourceVessels\(\)/);
});

test('Top Matches panel launches Due Diligence and never links directly to calculator', () => {
  assert.match(indexSource, /id="density-commercial-matches-panel"/);
  assert.match(funnelSource, /data-density-commercial-match="true"/);
  assert.match(funnelSource, /data-due-diligence-button/);
  assert.doesNotMatch(funnelSource, /switchTab\('estimator'\)/);
  assert.match(cssSource, /\.density-commercial-panel \{/);
  assert.match(cssSource, /\.density-due-diligence-panel \{/);
});

test('persisted Due Diligence exposes the calculator handoff only after database success', () => {
  const persistenceIndex = dueDiligenceSource.indexOf('const persistenceResult = await persistDueDiligenceVessel');
  const handoffIndex = dueDiligenceSource.indexOf('renderCalculatorHandoff(card, key, verifiedVessel)', persistenceIndex);
  assert.ok(persistenceIndex >= 0 && handoffIndex > persistenceIndex);
  assert.match(dueDiligenceSource, /commitVerifiedVesselToGlobalState/);
  assert.match(dueDiligenceSource, /Continuar a Calculadora de Costes/);
  assert.match(dueDiligenceSource, /globalScope\.applyResolvedVesselToCalculator\(vessel/);
  assert.match(dueDiligenceSource, /globalScope\.switchTab\('estimator'\)/);
  assert.match(indexSource, /window\.applyResolvedVesselToCalculator = applyResolvedVesselToCalculator/);
});

