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

test('activating radar from matching rehydrates matchingRequest before starting data flow', () => {
  const componentStart = source.indexOf('window.RadarGlobalControl = (() => {');
  const componentEnd = source.indexOf('window.startRadarLive = async function', componentStart);
  const componentSource = source.slice(componentStart, componentEnd);
  assert.match(componentSource, /fetchMatchingRequestFromGlobalStore/);
  assert.match(componentSource, /await window\.rehydrateCalculatedState\(\)/);
  assert.match(componentSource, /window\.startRadarLive\(\{ source: `\$\{source\}-global-control`, refresh: true, matchingRequest \}\)/);
  assert.ok(componentSource.indexOf('fetchMatchingRequestFromGlobalStore') < componentSource.indexOf('window.startRadarLive'));
});

test('switching tabs no longer freezes or restarts the global radar service', () => {
  const switchStart = source.indexOf('function switchTab(tabId)');
  const switchEnd = source.indexOf("if (tabId === 'auditor')", switchStart);
  const switchSource = source.slice(switchStart, switchEnd);
  assert.doesNotMatch(switchSource, /stopAisRadarPolling|stopAisProxyPolling/);
  assert.doesNotMatch(switchSource, /window\.isLiveTrackingEnabled =/);
});
