import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mapLoaderSource = readFileSync(new URL('../map_loader.js', import.meta.url), 'utf8');

test('matching starts empty and contains no legacy vessel fixtures', () => {
  assert.doesNotMatch(source, /TEST VESSEL ALPHA|VB COGNAC/i);
  assert.doesNotMatch(source, /BARCO FANTASMA/i);
  assert.doesNotMatch(mapLoaderSource, /buquesTest|ejecutarSimulacionRadarTest|sandbox-test/i);
  assert.match(source, /matchingVessels: \[\]/);
  assert.match(source, /window\.matchingResultsState = \{ vessels: \[\], count: 0/);
  assert.match(source, /window\.lastMatchingEngineResults = \[\]/);
  assert.match(source, /window\.renderedMatchingVessels = \[\]/);
  assert.match(source, /window\.aisMatchingCache = \[\]/);
  assert.match(source, /window\.openShipsVesselsCache = \[\]/);
  assert.match(source, /window\.backgroundAisData = \[\]/);
  assert.match(source, /window\.renderFleet = \[\]/);
  assert.match(source, /window\.listaBarcos = \[\]/);
});

test('matching only submits an OpenShips cache loaded by the real endpoint', () => {
  assert.match(source, /window\.openShipsVesselsCacheLoaded = false/);
  assert.match(source, /window\.openShipsVesselsCacheLoaded === true[\s\S]*window\.openShipsVesselsCache/);
  assert.match(source, /window\.openShipsVesselsCacheLoaded = true/);
});

test('matching empty state gives route-first instructions and renders no result rows', () => {
  assert.match(source, /Esperando parámetros de búsqueda/);
  assert.match(source, /Configure la ruta y haga clic en Encontrar Match para buscar buques\./);
  assert.match(source, /function showMatchingEmptyState\(\)[\s\S]*resultsList\.innerHTML = ''/);
  assert.match(source, /if \(rawMatches\.length === 0\)[\s\S]*window\.lastMatchingEngineResults = \[\]/);
  assert.doesNotMatch(source, /preservedAfterEmptyQuery|cache-preserved/);
});

test('matching requires a calculation while radar only requires a valid POL', () => {
  assert.match(source, /MATCHING_REQUIRES_ACTIVE_CALCULATION = true/);
  assert.match(source, /Configure una ruta en el Input Geográfico antes de buscar coincidencias/);
  assert.match(source, /function requireActiveMatchingRoute/);
  assert.match(source, /handleMatchingExecutionClick[\s\S]*requireActiveMatchingRoute/);
  assert.match(source, /function getMatchingRadarPolContext/);
  assert.match(source, /requiresMatchingRoute && window\.getMatchingRadarPolContext\?\.\(\)\.valid !== true/);
  assert.match(source, /button\.disabled = state\.status === 'loading' \|\| !hasActiveMatchingRoute/);
});

test('route and integrity banners only use active runtime data', () => {
  const routeOverrideStart = source.indexOf('function getMatchingExecutionRouteOverride');
  const routeOverrideEnd = source.indexOf('window.getMatchingExecutionRouteOverride', routeOverrideStart);
  const routeOverrideSource = source.slice(routeOverrideStart, routeOverrideEnd);
  assert.doesNotMatch(routeOverrideSource, /LAST_VALID_MATCHING_ROUTE|lastValidMatchingRoute|sessionStorage/);
  assert.match(source, /const hasRealSourceData = rawMatches\.length > 0/);
  assert.match(source, /else \{\s*window\.hideMatchingSourceIntegrity\?\.\(\);/);
});
