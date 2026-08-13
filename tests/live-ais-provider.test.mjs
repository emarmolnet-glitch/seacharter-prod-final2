import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  fetchOpenShipsBoundingBox,
  isAisMacroCompatibleVessel,
  mapAisMacroCategoryToTypes,
  normalizeLiveAisVessel,
} from '../netlify/functions/_shared/live-ais-provider.mjs';

test('normalizes provider payloads to the strict live AIS contract', () => {
  const vessel = normalizeLiveAisVessel({
    MetaData: { MMSI: 123456789, ShipName: 'Atlas Trader', ShipType: 'Bulk Carrier' },
    Message: {
      PositionReport: { Latitude: 36.75, Longitude: 5.08, Sog: 11.4, NavigationalStatus: 0 },
      ShipStaticData: { ImoNumber: 9876543 },
    },
  });

  assert.deepEqual(Object.keys(vessel), [
    'mmsi', 'imo', 'vessel_name', 'lat', 'lon', 'speed_sog', 'nav_status', 'vessel_type',
  ]);
  assert.deepEqual(vessel, {
    mmsi: '123456789',
    imo: '9876543',
    vessel_name: 'Atlas Trader',
    lat: 36.75,
    lon: 5.08,
    speed_sog: 11.4,
    nav_status: 0,
    vessel_type: 'Bulk Carrier',
  });
});

test('maps the CARGO macro category to AIS ship types 70 through 79', () => {
  const aisTypes = mapAisMacroCategoryToTypes('CARGO');
  assert.deepEqual(aisTypes, [70, 71, 72, 73, 74, 75, 76, 77, 78, 79]);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Cargo Ship (70)' }, 'CARGO'), true);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 79 }, 'CARGO'), true);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Bulk Carrier' }, 'CARGO'), true);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'General Cargo Ship' }, 'CARGO'), true);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Cargo Ship' }, 'CARGO'), false);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Passenger (Cruise) Ship (60)' }, 'CARGO'), false);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Pleasure Craft' }, 'CARGO'), false);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Tug (31)' }, 'CARGO'), false);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Oil Tanker (80)' }, 'CARGO'), false);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Fishing Vessel (30)' }, 'CARGO'), false);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 'Container Ship' }, 'CARGO'), false);
  assert.equal(isAisMacroCompatibleVessel({ vessel_type: 60 }, 'CARGO'), false);
});

test('preserves numeric AIS type codes in normalized vessel labels', () => {
  assert.equal(normalizeLiveAisVessel({ vesselType: 70 }).vessel_type, 'Cargo Ship (70)');
  assert.equal(normalizeLiveAisVessel({ vesselType: 60 }).vessel_type, 'Passenger Ship (60)');
  assert.equal(normalizeLiveAisVessel({ vesselType: 80 }).vessel_type, 'Tanker (80)');
});

test('sends an exact server-side bounding box to OpenShips', async () => {
  const requests = [];
  const vessels = await fetchOpenShipsBoundingBox({
    bounds: { minLat: 36.4, maxLat: 37.1, minLon: 4.6, maxLon: 5.6 },
    limit: 250,
    aisTypes: mapAisMacroCategoryToTypes('CARGO'),
    env: {
      OPENSHIPS_API_KEY: 'test-secret',
    },
    fetchImpl: async (input, init) => {
      requests.push({ url: new URL(input), init });
      return Response.json([{ vessel_name: 'Atlas Trader', lat: 36.75, lon: 5.08, vessel_type: 'Bulk Carrier' }]);
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.origin, 'https://api.openships.de');
  assert.equal(requests[0].url.pathname, '/v1/box');
  assert.equal(requests[0].url.searchParams.get('minLat'), '36.4');
  assert.equal(requests[0].url.searchParams.get('maxLat'), '37.1');
  assert.equal(requests[0].url.searchParams.get('minLon'), '4.6');
  assert.equal(requests[0].url.searchParams.get('maxLon'), '5.6');
  assert.equal(requests[0].url.searchParams.get('limit'), '250');
  assert.deepEqual(requests[0].url.searchParams.getAll('filterAisTypes'), [
    '70', '71', '72', '73', '74', '75', '76', '77', '78', '79',
  ]);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-secret');
  assert.equal(vessels[0].vessel_name, 'Atlas Trader');
});

test('normalizes the camelCase fields returned by the OpenShips box response', () => {
  const vessel = normalizeLiveAisVessel({
    mmsi: 205227090,
    vesselName: 'Donau',
    latitude: 36.75,
    longitude: 5.08,
    speedOverGround: 8.7,
    navigationalStatus: 0,
    vesselType: 'General Cargo',
  });

  assert.equal(vessel.speed_sog, 8.7);
  assert.equal(vessel.nav_status, 0);
  assert.equal(vessel.vessel_type, 'General Cargo');
});

test('supports X-Api-Key authentication and falls back only after a missing /box route', async () => {
  const requests = [];
  const vessels = await fetchOpenShipsBoundingBox({
    bounds: { minLat: 36.4, maxLat: 37.1, minLon: 4.6, maxLon: 5.6 },
    env: {
      OPENSHIPS_API_URL: 'https://api.openships.de/v1',
      OPENSHIPS_API_KEY: 'test-secret',
      OPENSHIPS_API_KEY_HEADER: 'X-Api-Key',
      OPENSHIPS_API_KEY_PREFIX: '',
    },
    fetchImpl: async (input, init) => {
      requests.push({ url: new URL(input), init });
      if (requests.length === 1) return Response.json({ message: 'Not found' }, { status: 404 });
      return Response.json([{ vessel_name: 'Atlas Trader', lat: 36.75, lon: 5.08, vessel_type: 'Bulk Carrier' }]);
    },
  });

  assert.equal(requests[0].url.pathname, '/v1/box');
  assert.equal(requests[1].url.pathname, '/v1/external/vessels/position/box');
  assert.equal(requests[0].init.headers['X-Api-Key'], 'test-secret');
  assert.equal(requests[1].init.headers['X-Api-Key'], 'test-secret');
  assert.equal(vessels.length, 1);
});

test('wires the density center to the live AIS endpoint and global store', async () => {
  const [indexSource, endpointSource] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../netlify/functions/live-ais.mts', import.meta.url), 'utf8'),
  ]);

  assert.match(endpointSource, /path:\s*"\/api\/fleet\/live-ais"/);
  assert.match(endpointSource, /mapAisMacroCategoryToTypes/);
  assert.match(endpointSource, /isAisMacroCompatibleVessel/);
  assert.doesNotMatch(endpointSource, /cargoCategory/);
  assert.match(indexSource, /\/api\/fleet\/live-ais\?/);
  assert.match(indexSource, /getLiveAisBoundingBox/);
  assert.match(indexSource, /getActiveAisMacroCategory/);
  assert.match(indexSource, /aisCategory:\s*getActiveAisMacroCategory\(\)/);
  assert.doesNotMatch(indexSource, /cargoCategory:\s*getActiveCoreProCargoCategory\(\)/);
  assert.match(indexSource, /setCommercialVesselState/);
  assert.match(indexSource, /setRadarVessels/);
  assert.match(indexSource, /payload\.vessels\.filter\(isStrictCargoAisVessel\)\.map\(normalizeLiveAisVesselForStore\)/);
  assert.match(indexSource, /replaceEmpty:\s*true/);
  assert.match(indexSource, /authoritativeEmpty:\s*true/);
  assert.match(indexSource, /0 Buques Detectados/);
  assert.doesNotMatch(indexSource, /NAAMA BORCHARD/i);
});

test('frontend interceptor rejects SUN PRINCESS before the global store write', async () => {
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const filterStart = indexSource.indexOf('function isStrictCargoAisVessel');
  const filterEnd = indexSource.indexOf('async function updateOpenShipsRadar', filterStart);
  const filterSource = indexSource.slice(filterStart, filterEnd);
  const isStrictCargoAisVessel = new Function(`${filterSource}; return isStrictCargoAisVessel;`)();

  assert.equal(isStrictCargoAisVessel({ vessel_name: 'SUN PRINCESS', vessel_type: 'Passenger (Cruise) Ship' }), false);
  assert.equal(isStrictCargoAisVessel({ vessel_name: 'DRY MERCHANT', vessel_type: 'Bulk Carrier' }), true);
  assert.equal(isStrictCargoAisVessel({ vessel_name: 'GENERAL TRADER', vessel_type: 'General Cargo Ship' }), true);
  assert.equal(isStrictCargoAisVessel({ vessel_name: 'BOX TRADER', vessel_type: 'Container Ship' }), false);
  assert.equal(isStrictCargoAisVessel({ vessel_name: 'AIS CARGO', vessel_type: 70 }), true);
  assert.equal(isStrictCargoAisVessel({ vessel_name: 'AIS PASSENGER', vessel_type: 60 }), false);
});

test('an authoritative empty live AIS response clears every previous density collection', async () => {
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const storeStart = indexSource.indexOf('function parseCommercialVesselCoordinate');
  const storeEnd = indexSource.indexOf('window.GlobalStore = GlobalStore;', storeStart)
    + 'window.GlobalStore = GlobalStore;'.length;
  const storeSource = indexSource.slice(storeStart, storeEnd);
  const window = { dispatchEvent() {} };
  vm.runInNewContext(storeSource, {
    window,
    CustomEvent: class {},
    console,
    Date,
    parseFloat,
    getGlobalVoyageParams: () => ({}),
  });

  const previousVessels = [{
    vesselName: 'Previous cached vessel',
    mmsi: '123456789',
    latitude: 36.75,
    longitude: 5.08,
  }];
  window.GlobalStore.setCommercialVesselState({
    rawVessels: previousVessels,
    filteredVessels: previousVessels,
  });
  window.GlobalStore.setRadarVessels(previousVessels, { source: 'matching-radar-sweep' });

  window.GlobalStore.setCommercialVesselState({ rawVessels: [], filteredVessels: [] }, { replaceEmpty: true });
  window.GlobalStore.setRadarVessels([], { source: 'live-ais:openships', authoritativeEmpty: true });

  assert.equal(window.GlobalStore.rawVessels.length, 0);
  assert.equal(window.GlobalStore.filteredVessels.length, 0);
  assert.equal(window.GlobalStore.radarVessels.length, 0);
  assert.equal(window.GlobalStore.matchingVessels.length, 0);
});
