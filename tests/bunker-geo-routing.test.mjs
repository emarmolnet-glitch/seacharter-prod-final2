import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const helperStart = indexSource.indexOf('const BUNKER_REGION_NAMES');
const helperEnd = indexSource.indexOf('function updateBunkerIndexCacheLabel', helperStart);
const helperSource = indexSource.slice(helperStart, helperEnd);

function loadGeoRouting() {
  const elements = new Map([
    ['port-pol', { value: '' }],
    ['port-pod', { value: '' }],
    ['label-price-vlsfo', { textContent: '' }],
    ['label-price-ifo', { textContent: '' }],
    ['label-price-mgo', { textContent: '' }],
  ]);
  const context = {
    window: {},
    document: { getElementById: id => elements.get(id) || null },
    console,
  };
  vm.runInNewContext(`${helperSource}\nglobalThis.geoApi = { getRegionFromCountry, getBunkerRegionForVoyage, collectRegionalBunkerPrices, resolveRegionalBunkerSelection, updateBunkerRegionLabels };`, context);
  return { context, elements };
}

test('country codes map to the supported bunker hubs', () => {
  const { context } = loadGeoRouting();
  assert.equal(context.geoApi.getRegionFromCountry('BR'), 'Americas');
  assert.equal(context.geoApi.getRegionFromCountry('ES'), 'EMEA');
  assert.equal(context.geoApi.getRegionFromCountry('CN'), 'APAC');
  assert.equal(context.geoApi.getRegionFromCountry('ZZ'), 'World');
});

test('interregional voyages use the POL region', () => {
  const { context } = loadGeoRouting();
  const route = context.geoApi.getBunkerRegionForVoyage('Santos (BR)', 'Shanghai (CN)');
  assert.equal(route.region, 'Americas');
  assert.equal(route.polRegion, 'Americas');
  assert.equal(route.podRegion, 'APAC');
  assert.equal(route.isInterregional, true);
});

test('regional market rows select the requested hub and fall back to World', () => {
  const { context } = loadGeoRouting();
  const payload = {
    prices: [
      { hub_name: 'Americas', fuel_type: 'VLSFO', price: 610 },
      { hub_name: 'Americas', fuel_type: 'IFO380', price: 520 },
      { hub_name: 'Americas', fuel_type: 'MGO', price: 790 },
      { hub_name: 'World', vlsfo: 600, ifo380: 500, mgo: 780 },
    ],
  };
  const regionalPrices = context.geoApi.collectRegionalBunkerPrices(payload);
  const americas = context.geoApi.resolveRegionalBunkerSelection({ regionalPrices }, 'Americas');
  const apacFallback = context.geoApi.resolveRegionalBunkerSelection({ regionalPrices }, 'APAC');

  assert.equal(americas.selectedRegion, 'Americas');
  assert.deepEqual({ ...americas.prices }, { vlsfo: 610, ifo380: 520, mgo: 790 });
  assert.equal(apacFallback.selectedRegion, 'World');
  assert.deepEqual({ ...apacFallback.prices }, { vlsfo: 600, ifo380: 500, mgo: 780 });
});

test('fuel labels display the effective regional hub', () => {
  const { context, elements } = loadGeoRouting();
  context.geoApi.updateBunkerRegionLabels('EMEA');
  assert.equal(elements.get('label-price-vlsfo').textContent, 'PRECIO VLSFO (EMEA)');
  assert.equal(elements.get('label-price-ifo').textContent, 'PRECIO IFO 380 (EMEA)');
  assert.equal(elements.get('label-price-mgo').textContent, 'PRECIO MGO (EMEA)');
});
