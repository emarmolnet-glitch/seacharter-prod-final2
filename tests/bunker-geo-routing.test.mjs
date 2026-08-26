import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const workspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
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

test('market latest records map hub_name and fuel_grade to the detected EMEA prices', () => {
  const { context } = loadGeoRouting();
  const payload = {
    data: [
      { hub_name: 'Americas', fuel_grade: 'VLSFO', price: 611.2 },
      { hub_name: 'EMEA', fuel_grade: 'VLSFO', price: '$642.75' },
      { hub_name: 'EMEA', fuel_grade: 'IFO380', price: '531.40 USD' },
      { hub_name: 'EMEA', fuel_grade: 'MGO', price: 812.1 },
    ],
  };

  const regionalPrices = context.geoApi.collectRegionalBunkerPrices(payload);
  const emea = context.geoApi.resolveRegionalBunkerSelection({ regionalPrices }, 'EMEA');

  assert.equal(emea.selectedRegion, 'EMEA');
  assert.deepEqual({ ...emea.prices }, { vlsfo: 642.75, ifo380: 531.4, mgo: 812.1 });
});

test('wrapped market latest payload extracts data.bunkers and normalizes grade spacing and case', () => {
  const { context } = loadGeoRouting();
  const payload = {
    success: true,
    data: {
      bunkers: [
        { hub_name: ' emea ', fuel_grade: ' vlsfo ', price: '645.10' },
        { hub_name: 'EMEA', fuel_grade: 'ifo 380', price: '534.20' },
        { hub_name: 'emea', fuel_grade: 'mgo', price: '815.30' },
      ],
    },
  };

  const regionalPrices = context.geoApi.collectRegionalBunkerPrices(payload);
  const emea = context.geoApi.resolveRegionalBunkerSelection({ regionalPrices }, 'EMEA');

  assert.deepEqual({ ...emea.prices }, { vlsfo: 645.1, ifo380: 534.2, mgo: 815.3 });
});

test('fuel labels display the effective regional hub', () => {
  const { context, elements } = loadGeoRouting();
  context.geoApi.updateBunkerRegionLabels('EMEA');
  assert.equal(elements.get('label-price-vlsfo').textContent, 'PRECIO VLSFO (EMEA)');
  assert.equal(elements.get('label-price-ifo').textContent, 'PRECIO IFO 380 (EMEA)');
  assert.equal(elements.get('label-price-mgo').textContent, 'PRECIO MGO (EMEA)');
});


test('programmatic POL updates emit the shared bunker route event only when the value changes', () => {
  const start = indexSource.indexOf("function notifyBunkerRouteChanged");
  const end = indexSource.indexOf('function readEffectiveBallastDistance', start);
  const source = indexSource.slice(start, end);
  const events = [];
  const polInput = { id: 'port-pol', type: 'text', value: '' };
  const context = {
    window: {
      dispatchEvent(event) { events.push(event); },
    },
    document: {
      getElementById(id) { return id === 'port-pol' ? polInput : null; },
    },
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  };

  vm.runInNewContext(`${source}\nglobalThis.setProgrammaticInput = setInputValue;`, context);
  context.setProgrammaticInput('port-pol', 'Rotterdam (NL)');
  context.setProgrammaticInput('port-pol', 'Rotterdam (NL)');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'seacharter:bunker-route-change');
  assert.equal(events[0].detail.source, 'setInputValue');
  assert.equal(events[0].detail.pol, 'Rotterdam (NL)');
});

test('map synchronization and session restore route programmatic POL changes through the bunker notifier', () => {
  const syncStart = indexSource.indexOf('function syncGlobalStateToForms');
  const syncEnd = indexSource.indexOf('function captureRouteStateFromMapInputs', syncStart);
  const syncSource = indexSource.slice(syncStart, syncEnd);
  const importStart = indexSource.indexOf('function setImportedFieldValue');
  const importEnd = indexSource.indexOf('function restoreSessionFields', importStart);
  const importSource = indexSource.slice(importStart, importEnd);
  const bootstrapStart = indexSource.indexOf("['port-pol', 'port-pod'].forEach");
  const bootstrapEnd = indexSource.indexOf('void hydrateLatestEuCarbonPrice', bootstrapStart);
  const bootstrapSource = indexSource.slice(bootstrapStart, bootstrapEnd);

  assert.match(syncSource, /updateInputIfNotFocused\('port-pol', State\.pol\)/);
  assert.match(syncSource, /setInputValue\(id, val\)/);
  assert.match(importSource, /notifyBunkerRouteChanged\('session-restore'\)/);
  assert.match(bootstrapSource, /addEventListener\('seacharter:bunker-route-change'/);
  assert.match(bootstrapSource, /autoFillBunkers\(\{ allowWithoutPol: true, managedByMaster: true, detectedRegion: 'World' \}\)/);
  assert.doesNotMatch(bootstrapSource, /scheduleRegionalBunkerSync/);
});

test('React calculator no longer refetches bunkers when the route region changes', () => {
  assert.doesNotMatch(workspaceSource, /seacharter:bunker-route-change/);
  assert.match(workspaceSource, /fetch\('\/api\/get-market-data'/);
});
