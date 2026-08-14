import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const coordinatorFunction = await readFile(new URL('../netlify/functions/ais-coordinator.mts', import.meta.url), 'utf8');
const trackingSource = await readFile(new URL('../tracking-live.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const routeSource = await readFile(new URL('../netlify/functions/route.ts', import.meta.url), 'utf8');
const etaSource = await readFile(new URL('../src/executive-predictive-metrics.mjs', import.meta.url), 'utf8');
const pdaSource = await readFile(new URL('../netlify/functions/pda-vessel-confirmation.ts', import.meta.url), 'utf8');
const voyageCostSource = await readFile(new URL('../voyage-cost-engine.js', import.meta.url), 'utf8');

function sliceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('one coordinator function owns live, radar, and in-memory consumption routes', () => {
  assert.match(coordinatorFunction, /\/api\/internal\/ais\/live-position/);
  assert.match(coordinatorFunction, /\/api\/internal\/ais\/radar-traffic/);
  assert.match(coordinatorFunction, /\/api\/internal\/ais\/consumption/);
  assert.match(coordinatorFunction, /getAisConsumptionSnapshot/);
});

test('tracking marker and Radar fleet consume coordinator endpoints', () => {
  assert.match(trackingSource, /\/api\/internal\/ais\/live-position\?imo=/);
  assert.match(trackingSource, /\/api\/internal\/ais\/consumption/);
  assert.match(trackingSource, /tracking-ais-consumption-count/);
  assert.doesNotMatch(trackingSource, /setInterval\(refreshAisConsumptionMonitor/);
  assert.match(trackingSource, /ais:consumption-updated/);

  const radarSource = sliceFunction(indexSource, 'async function updateOpenShipsRadar', 'window.updateOpenShipsRadar = updateOpenShipsRadar');
  assert.match(radarSource, /\/api\/internal\/ais\/radar-traffic/);
  assert.doesNotMatch(radarSource, /\/api\/fleet\/live-ais/);
});

test('routing, ETA, and PDA remain isolated from Datalastic telemetry', () => {
  const trackingRouteSource = sliceFunction(trackingSource, 'async function requestTrackingMaritimeLeg', 'function syncTrackingRouteStores');
  for (const source of [trackingRouteSource, routeSource, etaSource, pdaSource, voyageCostSource]) {
    assert.doesNotMatch(source, /datalastic|\/api\/internal\/ais/i);
  }
  assert.match(trackingRouteSource, /\/api\/route/);
  assert.match(trackingSource, /calculateDynamicEta/);
});
