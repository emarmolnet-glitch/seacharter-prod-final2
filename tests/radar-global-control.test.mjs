import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('RadarGlobalControl mounts the same reusable control in map and matching', () => {
  assert.equal((source.match(/data-radar-global-control/g) || []).length >= 3, true);
  assert.match(source, /data-radar-global-control data-radar-context="map"/);
  assert.match(source, /data-radar-global-control data-radar-context="matching"/);
  assert.match(source, /document\.querySelectorAll\('\[data-radar-global-control\]'\)/);
  assert.doesNotMatch(source, /id="btn-freeze-radar"/);
});

test('RadarGlobalControl publishes one shared state through GlobalStore and session storage', () => {
  const componentStart = source.indexOf('window.RadarGlobalControl = (() => {');
  const componentEnd = source.indexOf('window.startRadarLive = async function', componentStart);
  const componentSource = source.slice(componentStart, componentEnd);
  assert.match(source, /radarState: null/);
  assert.match(componentSource, /window\.GlobalStore\.radarState = \{ \.\.\.state \}/);
  assert.match(componentSource, /window\.sessionStorage\.setItem\(RADAR_GLOBAL_STATE_STORAGE_KEY/);
  assert.match(componentSource, /new CustomEvent\('RADAR_GLOBAL_STATE_CHANGED'/);
  assert.match(componentSource, /button\.setAttribute\('aria-pressed', String\(state\.mode === 'live'\)\)/);
});

test('global radar preserves the requested LIVE, FROZEN, and LOADING visual language', () => {
  assert.match(source, /data-radar-state="live"[\s\S]*background: #10b981/);
  assert.match(source, /data-radar-state="loading"[\s\S]*background: #0284c7/);
  assert.match(source, /radar-global-control__button[\s\S]*background: #475569/);
  assert.match(source, /Radar: LIVE/);
  assert.match(source, /Radar: FROZEN/);
});

test('matching radar executes a POL-scoped sweep without requiring a full calculation', () => {
  const componentStart = source.indexOf('window.RadarGlobalControl = (() => {');
  const componentEnd = source.indexOf('window.startRadarLive = async function', componentStart);
  const componentSource = source.slice(componentStart, componentEnd);
  assert.match(componentSource, /EJECUTAR BARRIDO RADAR/);
  assert.match(componentSource, /Escaneando zona\.\.\./);
  assert.match(componentSource, /window\.getMatchingRadarPolContext\?\.\(\)\.valid === true/);
  assert.match(componentSource, /context === 'matching'[\s\S]*window\.executeMatchingRadarSweep\?\.\(\)/);
  assert.match(componentSource, /fetchMatchingRequestFromGlobalStore/);
  assert.doesNotMatch(componentSource, /requiresMatchingRoute && !window\.requireActiveMatchingRoute/);
  assert.match(componentSource, /window\.startRadarLive\(\{ source: `\$\{source\}-global-control`, refresh: true, matchingRequest \}\)/);
});

test('matching radar runs predictive destination matching beside radial sources', () => {
  assert.match(source, /const \[aisVessels, openShipsVessels, predictiveResult\] = await Promise\.all/);
  assert.match(source, /requestMatchingLocal\?\.\('execute', \[\], predictivePayload\)/);
  assert.match(source, /predictiveVessels/);
  assert.match(source, /\.\.\.polScopedAisVessels, \.\.\.openShipsVessels, \.\.\.predictiveVessels/);
});

test('leaving the radar map freezes LIVE mode and cleans up the on-demand transport', () => {
  const switchStart = source.indexOf('function switchTab(tabId)');
  const switchEnd = source.indexOf("if (tabId === 'auditor')", switchStart);
  const switchSource = source.slice(switchStart, switchEnd);
  assert.match(switchSource, /leavingReadOnlyDensityMap/);
  assert.match(switchSource, /window\.RadarGlobalControl\?\.freeze\?\.\('map-view-exit'\)/);
  assert.match(switchSource, /window\.deactivateDataBridgeLiveTracking\?\.\('map-view-exit'\)/);
  assert.doesNotMatch(switchSource, /window\.isLiveTrackingEnabled =/);
});
