import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const tceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');

test('bunker toolbar keeps synchronization and arbitrage actions unified', () => {
  const toolbar = source.match(/<div id="bunker-arbitrage-toolbar"[\s\S]*?<div id="bunker-arbitrage-results"/)?.[0] || '';
  assert.match(toolbar, /role="toolbar"/);
  assert.match(toolbar, /Sincronizar Mercado Regional/);
  assert.match(toolbar, /Buscar Desvíos Rentables/);
  assert.doesNotMatch(toolbar, /<hr\b/i);
  assert.doesNotMatch(toolbar, /border-b/);
});

test('bunker market synchronization uses Market Latest on load and on demand', () => {
  assert.match(source, /const BUNKER_MARKET_LATEST_ENDPOINT = '\/api\/market\/bunkers-latest'/);
  assert.match(source, /method: 'GET'/);
  assert.match(source, /if \(initialBunkerRegion\.hasPol\)/);
  assert.match(source, /if \(!routeRegion\.hasPol && options\.allowWithoutPol !== true\)/);
  assert.match(source, /Raw Bunkers Array extraído/);
  assert.match(source, /function fetchRegionalBunkers\(regionName, options = \{\}\)/);
  assert.match(source, /portInput\.addEventListener\('input'/);
  assert.match(source, /scheduleRegionalBunkerSync\(\{ immediate: true \}\)/);
  assert.match(source, /function syncBunkerIndexMarket\(\)/);
  assert.match(source, /BUNKER_INDEX_CACHE_MAX_AGE_MS = 48 \* 60 \* 60 \* 1000/);
});

test('master calculation waits for valid non-fallback regional bunker prices', () => {
  assert.match(source, /function hasValidRegionalBunkerPrices\(\)/);
  assert.match(source, /new Set\(\[600, 800\]\)/);
  assert.match(source, /async function ensureRegionalBunkersForCalculation\(\)/);
  assert.match(source, /forceRefresh: true/);
  assert.match(source, /bunkerFetchPromise/);
});

test('React TCE calculator refetches when the derived bunker region changes', () => {
  assert.match(tceSource, /const \[regionalBunkerRegion, setRegionalBunkerRegion\] = useState\(''\)/);
  assert.match(tceSource, /const fetchRegionalBunkers = async \(regionName = regionalBunkerRegion, forceRefresh = false\)/);
  assert.match(tceSource, /useEffect\(\(\) => \{[\s\S]*setRegionalBunkerRegion\(region\)/);
  assert.match(tceSource, /useEffect\(\(\) => \{[\s\S]*void fetchRegionalBunkers\(regionalBunkerRegion, false\)/);
  assert.match(tceSource, /Sincronizar Mercado Regional/);
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
