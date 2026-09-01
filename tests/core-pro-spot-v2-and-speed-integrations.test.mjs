import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, hydrationSource, connectionStatusSource, tceWorkspaceSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/market-intelligence-hydration.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/ConnectionStatusBar.js', import.meta.url), 'utf8'),
  readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8'),
]);

const {
  createMarketIntelligenceHydration,
  normalizeMarketIntelligencePayload,
} = await import(`data:text/javascript,${encodeURIComponent(hydrationSource)}`);

test('1. RE-MAPEO DE TCE SPOT (V2): market intelligence hydration extracts predictive_v2 metrics and populates Spot V2 benchmark', () => {
  const payload = {
    source: 'DATA_BRIDGE',
    status: 'OK',
    predictive_v2: {
      metrics: {
        capesize: { tceSpot: 45200, spreadUsd: 3100, spreadPct: 7.3, updatedAt: '2026-09-01T12:00:00Z' },
        panamax: { tceSpot: 21500, spreadUsd: 1800, spreadPct: 9.1, updatedAt: '2026-09-01T12:00:00Z' },
        supramax: { tceSpot: 19200, spreadUsd: 1200, spreadPct: 6.6, updatedAt: '2026-09-01T12:00:00Z' },
        handysize: { tceSpot: 15800, spreadUsd: 950, spreadPct: 6.4, updatedAt: '2026-09-01T12:00:00Z' },
      },
    },
    bdi_index: 2450,
    vlsfo: 640.0,
    hsfo: 490.0,
    mgo: 780.0,
    aisstream_coaster_speed: 9.6,
    aisstream_minibulker_speed: 10.4,
  };

  const snapshot = normalizeMarketIntelligencePayload(payload, '2026-09-01T12:00:00Z');

  assert.equal(snapshot.tceSpotByClass.Capesize.theoreticalSpotTce, 45200);
  assert.equal(snapshot.tceSpotByClass.Panamax.theoreticalSpotTce, 21500);
  assert.equal(snapshot.tceSpotByClass.Supramax.theoreticalSpotTce, 19200);
  assert.equal(snapshot.tceSpotByClass.Handysize.theoreticalSpotTce, 15800);
  assert.equal(snapshot.speeds.coaster, 9.6);
  assert.equal(snapshot.speeds.minibulker, 10.4);
  assert.equal(snapshot.aisstream_coaster_speed, 9.6);
  assert.equal(snapshot.aisstream_minibulker_speed, 10.4);
  assert.equal(snapshot.dataBridgeStatus, 'OK');
});

test('1. RE-MAPEO DE TCE SPOT (V2): index.html and TceCalculatorWorkspace map predictive V2 metrics', () => {
  assert.match(indexSource, /record\[field\]\s*=\s*classSnapshot\?\.theoreticalSpotTce\s*\?\?\s*classSnapshot\?\.baseTc/);
  assert.match(indexSource, /metrics\.capesize\?\.tceSpot/);
  assert.match(indexSource, /updateBalticSpotSourceLabel\(`\$\{vesselClass\} TCE Spot/);

  assert.match(tceWorkspaceSource, /metrics\.capesize\?\.tceSpot/);
  assert.match(tceWorkspaceSource, /TCE Spot \(V2\)/);
  assert.match(tceWorkspaceSource, /fetch\('\/api\/get-market-data'/);
});

test('2. INYECCIÓN DE VELOCIDADES COASTER/MINI-BULKER: Pricing router injects real speeds into Cost-Plus mode', () => {
  assert.match(indexSource, /if\s*\(vesselClass\.type\s*===\s*'Cost-Plus'\)/);
  assert.match(indexSource, /isCoaster/);
  assert.match(indexSource, /isMinibulker/);
  assert.match(indexSource, /aisstream_coaster_speed/);
  assert.match(indexSource, /aisstream_minibulker_speed/);
  assert.match(indexSource, /spdBalInput\.value\s*=\s*speedVal\.toFixed\(1\)/);
  assert.match(indexSource, /spdLadenInput\.value\s*=\s*speedVal\.toFixed\(1\)/);
  assert.match(indexSource, /State\.speedInferenceSource\s*=\s*isCoaster\s*\?\s*'aisstream_coaster_speed'\s*:\s*'aisstream_minibulker_speed'/);
  assert.match(indexSource, /calculateAdjustedEtaAndDays\(\)/);
  assert.match(indexSource, /syncCostPlusFromRoute\(false\)/);
});

test('3. FIX DEL ESTADO DE CONEXIÓN: ConnectionStatusBar and index.html listen for OK and PERSISTED status', () => {
  assert.match(connectionStatusSource, /ok:\s*\{[\s\S]*label:\s*"CONNECTED"[\s\S]*state:\s*"secure"/);
  assert.match(connectionStatusSource, /persisted:\s*\{[\s\S]*label:\s*"CONNECTED"[\s\S]*state:\s*"secure"/);
  assert.match(connectionStatusSource, /connected:\s*\{[\s\S]*label:\s*"CONNECTED"[\s\S]*state:\s*"secure"/);
  assert.match(connectionStatusSource, /resolveStatusKey/);

  assert.match(indexSource, /raw === 'ok' \|\| raw === 'persisted' \|\| raw === 'connected' \|\| raw === 'secure'/);
  assert.match(indexSource, /dataBridgeStatus === 'OK' \|\| dataBridgeStatus === 'PERSISTED' \|\| dataBridgeStatus === 'CONNECTED'/);
});
