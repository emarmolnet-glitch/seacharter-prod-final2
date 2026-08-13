import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [dashboardSource, indexSource, globeSource] = await Promise.all([
  readFile(new URL('../src/components/DashboardExecutive.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
]);

test('executive dashboard renders explicit empty states without legacy voyage defaults', () => {
  assert.doesNotMatch(dashboardSource, /BEJAIA|AVEIRO|TEST VESSEL ALPHA|10[.,]000 MT/i);
  assert.match(dashboardSource, /function displayText\(value\)/);
  assert.match(dashboardSource, /const hasVesselData = Boolean\(vesselName \|\| vesselImo\)/);
  assert.match(dashboardSource, /const hasRouteData = Boolean\(loadPort && dischargePort\)/);
  assert.match(dashboardSource, /const routeProgress = hasRouteData \?/);
  assert.match(dashboardSource, /Esperando datos del mapa/);
  assert.doesNotMatch(dashboardSource, /voyageData\?\.cargoUnit \|\| 'MT'/);
});

test('density module blocks automatic AIS reads until POL coordinates exist', () => {
  const initStart = indexSource.indexOf('function initAisMap()');
  const initEnd = indexSource.indexOf('function destroyAisMap()', initStart);
  const initSource = indexSource.slice(initStart, initEnd);
  assert.ok(initStart >= 0 && initEnd > initStart);
  assert.doesNotMatch(initSource, /fetch\s*\(|updateOpenShipsRadar|ensureOpenShipsDensitySnapshot/);
  assert.match(initSource, /const displayVessels = getDensityMapSourceVessels\(\)/);
  assert.match(indexSource, /function getDensityReactiveVessels\(\)[\s\S]*GlobalStore\?\.matchingVessels/);
});

test('density globe starts from a neutral global camera without a POL', () => {
  assert.match(indexSource, /initialView: densityPolCoordinates[\s\S]*\{ lat: 24, lng: -24, altitude: 2\.5 \}/);
  assert.match(indexSource, /const displayVessels = getDensityMapSourceVessels\(\)/);
  assert.doesNotMatch(indexSource, /const displayVessels = densityPolCoordinates[\s\S]*: \[\]/);
  assert.match(globeSource, /function normalizeInitialView\(value\)/);
  assert.match(globeSource, /const initialView = normalizeInitialView\(options\.initialView\)/);
  assert.match(globeSource, /view\.globe\.pointOfView\(view\.initialView, view\.initialViewDuration\)/);
});

test('density globe keeps a panoramic POL-centered camera on its initial mount', () => {
  assert.match(indexSource, /\{ lat: densityPolCoordinates\.lat, lng: densityPolCoordinates\.lon, altitude: 2\.5 \}/);
  assert.match(indexSource, /initialViewDuration: densityPolCoordinates \? 700 : 0/);
  assert.match(indexSource, /focusFirstVessel: false/);
  assert.match(indexSource, /focusActiveVesselOnMount: false/);
  assert.match(globeSource, /altitude: Math\.max\(0\.15, altitude \?\? INITIAL_VIEW\.altitude\)/);
  assert.match(globeSource, /initialViewDuration: Math\.max\(0, toFiniteNumber\(options\.initialViewDuration, 0\) \|\| 0\)/);
});

test('density and matching modules expose professional AIS empty states', () => {
  assert.match(indexSource, /data-density-empty-state="true"/);
  assert.match(indexSource, /Esperando conexión AIS\.\.\./);
  assert.match(indexSource, /0 buques detectados en el área/);
  assert.match(indexSource, /id="matching-empty-title"/);
  assert.match(indexSource, /emptyState\.dataset\.matchingEmptyState = options\.searched === true \? 'search-complete' : 'awaiting-parameters'/);
  assert.match(indexSource, /Media mercado/);
});

test('frontend no longer seeds static demo vessel fleets', () => {
  assert.doesNotMatch(indexSource, /Stella di Mare|Baltic Explorer|Aegean Wave|Acqua Stella|Sea Empress|Pacific Pioneer/);
  assert.doesNotMatch(indexSource, /function loadScaleVessels\(/);
  assert.doesNotMatch(indexSource, /const defaultSaved = \[/);
  assert.match(indexSource, /localStorage\.getItem\('rodahmar_saved_vessels'\) \|\| '\[\]'/);
});
