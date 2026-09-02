import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { serializeVesselRecord } from '../netlify/functions/_shared/vessel-lookup.mjs';

const voyageStoreSource = await readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8');

function getInstantiatedVoyageStore() {
  let state = {};
  const set = (updater) => {
    const partial = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...partial };
  };
  const get = () => state;

  const sandbox = {
    createStore: (fn) => {
      state = fn(set, get);
      return {
        getState: () => state,
        setState: set,
      };
    },
    subscribeWithSelector: (fn) => fn,
    Date,
    Object,
    Array,
    String,
    Number,
  };

  const strippedSource = voyageStoreSource
    .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?/g, '')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+const\s+voyageStore\s*=/g, 'const voyageStore =')
    .replace(/export\s+const\s+useVoyageStore\s*=\s*voyageStore;?/g, '');

  vm.runInNewContext(`${strippedSource}\nsandboxOutput = voyageStore;`, sandbox);
  return sandbox.sandboxOutput;
}

test('1. Backend lookup endpoint and serializer expose complete technical and commercial particulars', () => {
  const sampleVessel = {
    imoNumber: 9456789,
    mmsi: '240123456',
    vesselName: 'OCEAN VOYAGER',
    dwt: 58000,
    vesselType: 'Bulk Carrier',
    vesselClass: 'Supramax',
    commercialClass: 'Supramax',
    draftMeters: 12.8,
    flag: 'PA',
    callSign: '3ABC',
    yearBuilt: 2015,
    grossTonnage: 33000,
    netTonnage: 19000,
    loaMeters: 190.0,
    beamMeters: 32.26,
    lastPort: 'SINGAPORE',
    eta: '2026-09-10T00:00:00.000Z',
    serviceSpeedKnots: 14.0,
    speedLaden: 13.5,
    speedBallast: 14.5,
    fuelConsumptionLaden: 24.5,
    fuelConsumptionBallast: 22.0,
    fuelConsumptionPort: 2.5,
    ownerManager: 'Global Maritime Ltd',
    hasGears: true,
    hasScrubber: false,
    auditStatus: 'VALIDATED',
    dataSource: 'vessels_master',
  };

  const serialized = serializeVesselRecord(sampleVessel);

  assert.equal(serialized.imo, 9456789);
  assert.equal(serialized.imo_number, 9456789);
  assert.equal(serialized.vessel_name, 'OCEAN VOYAGER');
  assert.equal(serialized.dwt, 58000);
  assert.equal(serialized.loa_meters, 190.0);
  assert.equal(serialized.beam_meters, 32.26);
  assert.equal(serialized.draft_meters, 12.8);
  assert.equal(serialized.service_speed_knots, 14.0);
  assert.equal(serialized.spd_laden, 13.5);
  assert.equal(serialized.spd_ballast, 14.5);
  assert.equal(serialized.fuel_consumption_laden, 24.5);
  assert.equal(serialized.fuel_consumption_ballast, 22.0);
  assert.equal(serialized.fuel_consumption_port, 2.5);
  assert.equal(serialized.cons_sea, 24.5);
  assert.equal(serialized.cons_port, 2.5);
  assert.equal(serialized.year_built, 2015);
  assert.equal(serialized.owner_manager, 'Global Maritime Ltd');
  assert.equal(serialized.vessel_class, 'Supramax');
  assert.equal(serialized.has_gears, true);
  assert.equal(serialized.has_scrubber, false);
});

test('2. voyageStore mass-autocompletes all technical and commercial variables via patchSection2Vessel and applyVesselRecord', () => {
  const store = getInstantiatedVoyageStore();
  store.getState().clearDraft();

  const mockDbVessel = {
    imo_number: '9512345',
    vessel_name: 'NORDIC STAR',
    dwt: 63500,
    loa_meters: 199.9,
    beam_meters: 32.25,
    draft_meters: 13.3,
    gross_tonnage: 36000,
    net_tonnage: 21000,
    year_built: 2018,
    flag: 'LR',
    service_speed_knots: 14.2,
    spd_laden: 13.8,
    spd_ballast: 14.5,
    fuel_consumption_laden: 25.0,
    fuel_consumption_ballast: 22.5,
    fuel_consumption_port: 3.0,
    owner_manager: 'Nordic Bulk Carriers',
    vessel_class: 'Ultramax',
    has_gears: true,
    has_scrubber: true,
  };

  store.getState().patchSection2Vessel(mockDbVessel);
  const state = store.getState().draft;

  // Verify top-level state variables in draft
  assert.equal(state.dwt, 63500);
  assert.equal(state.loa_meters, 199.9);
  assert.equal(state.beam_meters, 32.25);
  assert.equal(state.draft_meters, 13.3);
  assert.equal(state.service_speed_knots, 14.2);
  assert.equal(state.speed_laden, 13.8);
  assert.equal(state.speed_ballast, 14.5);
  assert.equal(state.fuel_consumption_laden, 25.0);
  assert.equal(state.fuel_consumption_ballast, 22.5);
  assert.equal(state.fuel_consumption_port, 3.0);
  assert.equal(state.gross_tonnage, 36000);
  assert.equal(state.year_built, 2018);
  assert.equal(state.owner_manager, 'Nordic Bulk Carriers');
  assert.equal(state.vessel_class, 'Ultramax');

  // Verify nested vessel object in draft
  assert.equal(state.vessel.imo, '9512345');
  assert.equal(state.vessel.name, 'NORDIC STAR');
  assert.equal(state.vessel.dwt, 63500);
  assert.equal(state.vessel.loa_meters, 199.9);
  assert.equal(state.vessel.beam_meters, 32.25);
  assert.equal(state.vessel.fuel_consumption_laden, 25.0);
  assert.equal(state.vessel.fuel_consumption_ballast, 22.5);
  assert.equal(state.vessel.service_speed_knots, 14.2);
  assert.equal(state.vessel.owner_manager, 'Nordic Bulk Carriers');
  assert.equal(state.vessel.vessel_class, 'Ultramax');
  assert.equal(state.vessel.year_built, 2018);
});

test('3. Core PRO contains the VesselDetailDrawer offcanvas panel with OPERATIVA, ESPECIFICACIONES TECNICAS, and CARGAR DATOS', async () => {
  const indexHtml = await readFile('index.html', 'utf8');

  // Verify offcanvas drawer structure
  assert.match(indexHtml, /id="vessel-detail-drawer"/);
  assert.match(indexHtml, /id="vessel-detail-drawer-overlay"/);
  assert.match(indexHtml, /id="drawer-vessel-title"/);
  assert.match(indexHtml, /id="drawer-btn-cargar-datos"/);
  assert.match(indexHtml, /id="drawer-btn-cargar-datos-footer"/);
  assert.match(indexHtml, /OPERATIVA/);
  assert.match(indexHtml, /ESPECIFICACIONES TÉCNICAS/);
  assert.match(indexHtml, /id="drawer-vessel-name"/);
  assert.match(indexHtml, /id="drawer-vessel-imo"/);
  assert.match(indexHtml, /id="drawer-vessel-dwt"/);
  assert.match(indexHtml, /id="drawer-vessel-year"/);
  assert.match(indexHtml, /id="drawer-vessel-manager"/);
  assert.match(indexHtml, /id="drawer-vessel-class"/);
  assert.match(indexHtml, /id="drawer-tech-loa"/);
  assert.match(indexHtml, /id="drawer-tech-beam"/);
  assert.match(indexHtml, /id="drawer-tech-draft"/);
  assert.match(indexHtml, /id="drawer-tech-speed"/);
  assert.match(indexHtml, /id="drawer-tech-cons-sea"/);
  assert.match(indexHtml, /id="drawer-tech-cons-port"/);
  assert.match(indexHtml, /function openVesselDetailDrawer\(/);
  assert.match(indexHtml, /function closeVesselDetailDrawer\(/);
  assert.match(indexHtml, /function injectDrawerVesselIntoCalculator\(/);

  // Verify header search bar exists
  assert.match(indexHtml, /id="header-vessel-search-input"/);
  assert.match(indexHtml, /id="header-vessel-search-btn"/);
  assert.match(indexHtml, /function handleHeaderVesselSearch\(/);
});

test('4. BroadcastChannel LOAD_IMO handling in Core PRO App.jsx and TceCalculatorWorkspace', async () => {
  const appJsx = await readFile('src/App.jsx', 'utf8');
  const workspaceTsx = await readFile('TceCalculatorWorkspace.tsx', 'utf8');

  assert.match(appJsx, /data\.type === 'LOAD_IMO'/);
  assert.match(appJsx, /executeImoHydration/);
  assert.match(workspaceTsx, /data\.type === 'LOAD_IMO'/);
});
