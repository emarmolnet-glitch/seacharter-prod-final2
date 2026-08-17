import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('bunker toolbar keeps synchronization and arbitrage actions unified', () => {
  const toolbar = source.match(/<div id="bunker-arbitrage-toolbar"[\s\S]*?<div id="bunker-arbitrage-results"/)?.[0] || '';
  assert.match(toolbar, /role="toolbar"/);
  assert.match(toolbar, /Sincronizar Mercado \(Bunkerindex\)/);
  assert.match(toolbar, /Buscar Desvíos Rentables/);
  assert.doesNotMatch(toolbar, /<hr\b/i);
  assert.doesNotMatch(toolbar, /border-b/);
});

test('bunker market synchronization is manual and uses the real API route', () => {
  assert.match(source, /const BUNKER_MARKET_SYNC_ENDPOINT = '\/api\/market\/sync-bunkerindex'/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /function syncBunkerIndexMarket\(\)/);
  assert.match(source, /BUNKER_INDEX_CACHE_MAX_AGE_MS = 48 \* 60 \* 60 \* 1000/);
});

test('arbitrage payload uses maritime route geometry and automatic fuel grade', () => {
  assert.match(source, /State\.routeGeometry\?\.routes\?\.laden/);
  assert.match(source, /waypoints: route\.coordinates/);
  assert.match(source, /const fuelGrade = hasScrubber \? 'IFO380' : 'VLSFO'/);
  assert.match(source, /required_bunker_volume_mt/);
  assert.match(source, /tce_daily_usd/);
  assert.match(source, /opex_daily_usd/);
  assert.match(source, /sea_consumption_daily_mt/);
  assert.match(source, /pol_bunker_price_usd_mt/);
});

test('applying a suggestion updates bunker price and navigation days', () => {
  assert.match(source, /State\.bunkerArbitrageExtraDays = suggestion\.extraDays/);
  assert.match(source, /priceInput\.value = suggestion\.bunkerPrice\.toFixed\(2\)/);
  assert.match(source, /dBal \+ dLaden \+ marginDays \+ bunkerArbitrageExtraDays/);
  assert.match(source, /runEngine\(\)/);
});

test('bunker arbitrage introduces no polling', () => {
  const moduleSource = source.slice(source.indexOf("const BUNKER_INDEX_DATA_KEY"), source.indexOf("function useAlgorithmicFreight"));
  assert.doesNotMatch(moduleSource, /setInterval\s*\(/);
});
