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
  const helperStart = indexSource.indexOf('function getDensityPolCoordinates()');
  const helperEnd = indexSource.indexOf('function initAisMap()', helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const updaterStart = indexSource.indexOf('async function updateOpenShipsRadar(options = {})');
  const updaterEnd = indexSource.indexOf('window.updateOpenShipsRadar = updateOpenShipsRadar', updaterStart);
  const updaterSource = indexSource.slice(updaterStart, updaterEnd);

  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(helperSource, /State\?\.polCoordinates/);
  assert.match(helperSource, /window\.GlobalStore\?\.polCoordinates/);
  assert.match(helperSource, /if \(!getDensityPolCoordinates\(\)\) return \[\]/);
  assert.ok(updaterStart >= 0 && updaterEnd > updaterStart);
  assert.match(updaterSource, /const matchingPolContext = options\.polContext \|\| window\.getMatchingRadarPolContext\?\.\(\) \|\| null/);
  assert.match(updaterSource, /const polCoordinates = matchingPolContext\?\.coordinates \|\| window\.getDensityPolCoordinates\?\.\(\) \|\| null/);
  assert.match(updaterSource, /if \(!polCoordinates\) \{[\s\S]*return \[\];[\s\S]*fetch\(`\/api\/openships\/live-status\?\$\{params\.toString\(\)\}`/);
});

test('density globe starts from a neutral global camera without a POL', () => {
  assert.match(indexSource, /initialView: densityPolCoordinates[\s\S]*\{ lat: 20, lng: 0, altitude: 2\.45 \}/);
  assert.match(indexSource, /const displayVessels = densityPolCoordinates[\s\S]*\? getDensityMapSourceVessels\(\)[\s\S]*: \[\]/);
  assert.match(indexSource, /setView\(\[20\.0, 0\.0\], 2\)/);
  assert.match(globeSource, /function normalizeInitialView\(value\)/);
  assert.match(globeSource, /const initialView = normalizeInitialView\(options\.initialView\)/);
  assert.match(globeSource, /view\.globe\.pointOfView\(view\.initialView, view\.initialViewDuration\)/);
});

test('density globe flies close to the POL only on its initial mount', () => {
  assert.match(indexSource, /\{ lat: densityPolCoordinates\.lat, lng: densityPolCoordinates\.lon, altitude: 0\.15 \}/);
  assert.match(indexSource, /initialViewDuration: densityPolCoordinates \? 1000 : 0/);
  assert.match(indexSource, /focusFirstVessel: false/);
  assert.match(indexSource, /focusActiveVesselOnMount: false/);
  assert.match(globeSource, /altitude: Math\.max\(0\.15, altitude \?\? INITIAL_VIEW\.altitude\)/);
  assert.match(globeSource, /initialViewDuration: Math\.max\(0, toFiniteNumber\(options\.initialViewDuration, 0\) \|\| 0\)/);
});
