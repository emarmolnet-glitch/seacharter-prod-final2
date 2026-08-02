import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [indexSource, entrySource, serviceSource, backendSource, persistenceBackendSource, persistenceMigrationSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/dueDiligenceService.js', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-due-diligence.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-due-diligence-save.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/database/migrations/20260802120000_add_vessels_master_due_diligence_audit/migration.sql', import.meta.url), 'utf8'),
]);
const serviceModule = await import(`data:text/javascript;base64,${Buffer.from(serviceSource).toString('base64')}`);
const cargoTaxonomyModule = await import(new URL('../cargo-taxonomy.mjs', import.meta.url));

function loadBridge(windowOverrides = {}) {
  const events = [];
  const window = {
    dispatchEvent(event) {
      events.push(event);
    },
    ...windowOverrides,
  };
  const context = {
    window,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    console,
    Date,
    JSON,
    Number,
    String,
    Object,
    Boolean,
    Array,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
  };
  const executableEntrySource = entrySource.replace(
    /import \{ fetchDueDiligence, persistDueDiligenceVessel \} from '.\/services\/dueDiligenceService\.js';/,
    'const fetchDueDiligence = window.__fetchDueDiligence; const persistDueDiligenceVessel = window.__persistDueDiligenceVessel;',
  ).replace(
    /import \{ evaluateCargoVesselEligibility \} from '\.\.\/cargo-taxonomy\.mjs';/,
    'const evaluateCargoVesselEligibility = window.__evaluateCargoVesselEligibility;',
  );
  window.__fetchDueDiligence ||= async () => ({ success: true, data: {} });
  window.__persistDueDiligenceVessel ||= async vessel => ({ success: true, vessel });
  window.__evaluateCargoVesselEligibility = cargoTaxonomyModule.evaluateCargoVesselEligibility;
  vm.runInNewContext(executableEntrySource, context);
  return { bridge: window.VesselDueDiligenceBridge, events, window };
}

test('matching cards gate Calculator and expose Due Diligence only for missing IMO or DWT', () => {
  assert.match(indexSource, /const requiresDueDiligence = isDwtUnknown \|\| !isValidImo/);
  assert.match(indexSource, /data-due-diligence-button/);
  assert.match(indexSource, /data-external-scraper-only="true"/);
  assert.match(indexSource, /data-due-diligence-payload="\$\{dueDiligenceIdentity\}"/);
  assert.match(indexSource, /const hasDueDiligenceIdentity = isValidImo/);
  assert.match(indexSource, /\^\\d\{9\}\$.*v\.mmsi/);
  assert.match(indexSource, /Due Diligence sin identidad/);
  assert.match(indexSource, /Se requiere al menos IMO, MMSI o nombre del buque/);
  assert.match(indexSource, /data-calculator-apply-button[\s\S]*requiresDueDiligence \? 'disabled aria-disabled="true"'/);
  assert.match(indexSource, /mmsi: v\.mmsi \|\| m\.ais\?\.mmsi/);
  assert.match(indexSource, /latitude: Number\(m\.ais\?\.latitude/);
  assert.match(indexSource, /longitude: Number\(m\.ais\?\.longitude/);
  assert.match(indexSource, /data-vessel-capacity-comparison/);
  assert.match(indexSource, /data-vessel-capacity-status/);
  assert.match(indexSource, /data-technical-reasons/);
});

test('Due Diligence click is captured exclusively and never invokes local persistence', () => {
  assert.match(entrySource, /import \{ fetchDueDiligence, persistDueDiligenceVessel \} from '.\/services\/dueDiligenceService\.js'/);
  assert.match(entrySource, /addEventListener\('click', handleDueDiligenceClick, true\)/);
  assert.match(entrySource, /event\.preventDefault\(\)/);
  assert.match(entrySource, /event\.stopImmediatePropagation\(\)/);
  assert.match(entrySource, /fetchDueDiligence\([\s\S]*\{ imo, mmsi, vesselName \}/);
  assert.match(entrySource, /persistDueDiligenceVessel\(vessel/);
  assert.match(entrySource, /acceptButton\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(entrySource, /Guardando\.\.\./);
  assert.match(entrySource, /BUQUE NO COMERCIAL DETECTADO/);
  assert.match(entrySource, /accept\.disabled = commerciallyBlocked/);
  assert.doesNotMatch(entrySource, /\/api\/scrape-vessel/);
  assert.doesNotMatch(entrySource, /IndexedDB|localStorage|saveEditedVesselParams|saveVesselToIndexedDB/);
  assert.doesNotMatch(entrySource, /ais:vessels-updated/);
  assert.match(indexSource, /dueDiligenceExternalOnlyActive === true/);
  assert.match(indexSource, /dueDiligenceSuppressLocalPersistenceUntil/);
  assert.match(backendSource, /path: "\/api\/vessel-due-diligence"/);
});

test('Vite bundles the ES module service and no loose ghost script remains', () => {
  assert.match(indexSource, /<script type="module" src="\.\/src\/due-diligence-entry\.js"><\/script>/);
  assert.doesNotMatch(indexSource, /<script[^>]+src="\.\/due-diligence-bridge\.js/);
  assert.equal(existsSync(new URL('../due-diligence-bridge.js', import.meta.url)), false);
  assert.match(serviceSource, /export async function fetchDueDiligence/);
  assert.match(serviceSource, /body: JSON\.stringify\(payload\)/);
});

test('fetchDueDiligence posts identity and normalizes the complete technical payload', async () => {
  let request = null;
  const result = await serviceModule.fetchDueDiligence(
    { imo: 'IMO PENDING', mmsi: '224123456', vesselName: 'NERMIN KARABEKIR' },
    {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({
          success: true,
          data: {
            imo_number: '9876543',
            dwt: 10_953,
            flag: 'Barbados',
            vessel_type: 'General Cargo',
            year_built: 2011,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  );
  assert.equal(request.url, '/api/vessel-due-diligence');
  assert.deepEqual(JSON.parse(request.options.body), {
    imo: '',
    mmsi: '224123456',
    vesselName: 'NERMIN KARABEKIR',
  });
  assert.deepEqual(result.data, {
    imo: '9876543',
    dwt: 10_953,
    flag: 'Barbados',
    vesselType: 'General Cargo',
    builtYear: 2011,
  });
});

test('persistDueDiligenceVessel sends the consolidated vessel through PUT', async () => {
  let request = null;
  const vessel = { imo: '9876543', vesselName: 'NERMIN KARABEKIR', dwt: 10_953, audit_status: 'PENDING' };
  const result = await serviceModule.persistDueDiligenceVessel(vessel, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ success: true, vessel }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(request.url, '/api/vessel-due-diligence-save');
  assert.equal(request.options.method, 'PUT');
  assert.deepEqual(JSON.parse(request.options.body), { vessel });
  assert.equal(result.success, true);
});

test('persistence backend upserts vessels_master with pending audit provenance', () => {
  assert.match(persistenceBackendSource, /path: "\/api\/vessel-due-diligence-save"/);
  assert.match(persistenceBackendSource, /ON CONFLICT \(imo_number\) DO UPDATE SET/);
  assert.match(persistenceBackendSource, /audit_status = EXCLUDED\.audit_status/);
  assert.match(persistenceBackendSource, /status = EXCLUDED\.status/);
  assert.match(persistenceBackendSource, /fecha_ultima_actualizacion = NOW\(\)/);
  assert.match(persistenceBackendSource, /audit_source = EXCLUDED\.audit_source/);
  assert.match(persistenceBackendSource, /validation_status = EXCLUDED\.validation_status/);
  assert.match(persistenceBackendSource, /const AUDIT_STATUS = "PENDING"/);
  assert.match(persistenceBackendSource, /const SOURCE_PROVENANCE = "due_diligence_manual"/);
  assert.match(persistenceBackendSource, /barbados: "BRB"/);
  assert.match(persistenceBackendSource, /cleanFlagCode/);
  assert.match(persistenceBackendSource, /NON_COMMERCIAL_VESSEL_PATTERN\.test\(vesselType\)/);
  assert.match(persistenceBackendSource, /console\.error\("\[vessel-due-diligence-save\] PostgreSQL persistence failed", error\)/);
  assert.match(persistenceBackendSource, /return json\(\{ success: false, error: errorMessage \}, 500, headers\)/);
  assert.doesNotMatch(persistenceBackendSource, /source_provenance, origen, source, source_payload, updated_at/);
  assert.match(persistenceMigrationSource, /ADD COLUMN IF NOT EXISTS "audit_status" text/);
  assert.match(persistenceMigrationSource, /ADD COLUMN IF NOT EXISTS "source_provenance" text/);
  assert.match(persistenceMigrationSource, /ADD COLUMN IF NOT EXISTS "status" text/);
  assert.match(persistenceMigrationSource, /ADD COLUMN IF NOT EXISTS "fecha_ultima_actualizacion" timestamp with time zone/);
});

test('backend accepts IMO, MMSI, or vessel name and searches the four public providers', () => {
  assert.match(backendSource, /const query = imo \|\| mmsi \|\| vesselName/);
  assert.match(backendSource, /if \(!identity\)[\s\S]*IMO válido, MMSI o nombre del buque/);
  const marineVesselTraffic = backendSource.indexOf('provider: "MarineVesselTraffic"');
  const vesselFinder = backendSource.indexOf('provider: "VesselFinder"');
  const marineTraffic = backendSource.indexOf('provider: "MarineTraffic"');
  const balticShipping = backendSource.indexOf('provider: "BalticShipping"');
  assert.ok(marineVesselTraffic < vesselFinder && vesselFinder < marineTraffic && marineTraffic < balticShipping);
  assert.match(backendSource, /buildUrls: \(identity\)/);
  assert.match(backendSource, /encodeURIComponent\(identity\.query\)/);
  assert.match(backendSource, /runSourceWaterfall\(identity, deadlineAt\)/);
  assert.match(backendSource, /vessel_type: \["vessel type", "ship type", "type", "class"\]/);
  assert.match(backendSource, /data\.vessel_type = readCell/);
  assert.match(backendSource, /findStructuredVesselType/);
  assert.match(backendSource, /field === "vessel_type"/);
  assert.match(backendSource, /script\[type='application\/ld\+json'\]/);
  assert.match(backendSource, /data-field='vessel-type'/);
  assert.match(backendSource, /hasCompleteDueDiligenceData\(combinedData\)/);
  assert.match(backendSource, /data: normalizedResponseData\(result\.data\)/);
});

test('external Data Bridge response envelopes resolve to the scraped vessel record', () => {
  const { bridge } = loadBridge();
  const vessel = { imo: '9876543', dwt: 42_000 };
  assert.equal(bridge.readExternalScrapeRecord({ vessel }), vessel);
  assert.equal(bridge.readExternalScrapeRecord({ data: { vessel } }), vessel);
  assert.equal(bridge.readExternalScrapeRecord({ result: vessel }), vessel);
});

test('external non-empty values override master data while null values preserve it', () => {
  const { bridge } = loadBridge();
  const merged = bridge.mergeNonEmptyRecords(
    { dwt: 30_000, flag: 'Malta', year_built: 2010 },
    { dwt: 42_000, flag: null, year_built: '' },
  );
  assert.equal(merged.dwt, 42_000);
  assert.equal(merged.flag, 'Malta');
  assert.equal(merged.year_built, 2010);
});

test('technical merge enriches fields without changing OpenShips coordinates', () => {
  const { bridge } = loadBridge();
  const vessel = {
    mmsi: '224123456',
    vesselName: 'OPENSHIPS RAW',
    latitude: 36.1234,
    longitude: -5.4321,
    MetaData: { latitude: 36.1234, longitude: -5.4321 },
  };

  bridge.mergeTechnicalFields(vessel, {
    imo: '9876543',
    dwt: 42_000,
    flag: 'Spain',
    vesselType: 'General Cargo',
    yearBuilt: 2018,
    draft: 9.4,
  });

  assert.equal(vessel.imo, '9876543');
  assert.equal(vessel.dwt, 42_000);
  assert.equal(vessel.flag, 'Spain');
  assert.equal(vessel.vesselType, 'General Cargo');
  assert.equal(vessel.vessel_type, 'General Cargo');
  assert.equal(vessel.yearBuilt, 2018);
  assert.equal(vessel.draft, 9.4);
  assert.equal(vessel.latitude, 36.1234);
  assert.equal(vessel.longitude, -5.4321);
  assert.equal(vessel.MetaData.latitude, 36.1234);
  assert.equal(vessel.MetaData.longitude, -5.4321);
});

test('store hydration updates matching and OpenShips records and clears missing-data warnings', () => {
  const rawVessel = {
    mmsi: '224123456',
    vesselName: 'OPENSHIPS RAW',
    latitude: 36.1234,
    longitude: -5.4321,
  };
  const match = {
    vessel: { ...rawVessel, imo: 'PENDING', dwt: null, dwtStatus: null },
    ais: { ...rawVessel },
    hasTechnicalWarning: true,
    technicalEligibility: { criticalReasons: ['DWT desconocido', 'IMO pending'] },
    audit: { reasons: ['DWT no disponible'] },
  };
  const { bridge, events } = loadBridge({
    openShipsVesselsCache: [rawVessel],
    lastMatchingEngineResults: [match],
    matchingResultsState: { vessels: [match], eligibleVessels: [] },
    GlobalStore: { rawVessels: [rawVessel], vessels: [], filteredVessels: [], renderedAisVessels: [], matchingVessels: [match] },
  });

  bridge.hydrateStores(
    { mmsi: '224123456', name: 'OPENSHIPS RAW' },
    { imo: '9876543', dwt: 42_000, flag: 'Spain', yearBuilt: 2018, draft: 9.4 },
  );

  assert.equal(match.vessel.imo, '9876543');
  assert.equal(match.vessel.dwt, 42_000);
  assert.equal(match.hasTechnicalWarning, false);
  assert.deepEqual(match.technicalEligibility.criticalReasons, []);
  assert.equal(rawVessel.latitude, 36.1234);
  assert.equal(rawVessel.longitude, -5.4321);
  assert.ok(events.some(event => event.type === 'vessel:due-diligence-hydrated'));
});

test('hydration re-evaluates DWT warnings against cargo quantity', () => {
  const match = {
    vessel: { mmsi: '224123456', vesselName: 'NERMIN KARABEKIR', dwt: 0, dwtStatus: null, vesselType: 'General Cargo' },
    ais: { mmsi: '224123456', vesselName: 'NERMIN KARABEKIR' },
    hasTechnicalWarning: true,
    compatibility: { taxonomyCompatible: true, draftOk: true, loaOk: true, dateOk: true, reasons: { capacity: 'DWT 0 MT inferior a la carga' } },
    technicalEligibility: {
      cargoTypeId: '100',
      criticalReasons: ['DWT 0 MT inferior a la carga 10000 MT'],
      dwt: { vessel: 0, required: 10_000, maximumSuitable: 11_500 },
      volume: { requiredCbm: 0 },
      equipment: {},
    },
    audit: { operationallyEligible: false, reasons: ['DWT 0 MT inferior a la carga 10000 MT'] },
  };
  const { bridge, window } = loadBridge({
    lastMatchingEngineResults: [match],
    matchingResultsState: { vessels: [match], eligibleVessels: [], eligibleCount: 0, technicalWarningCount: 1 },
    GlobalStore: { matchingVessels: [match], rawVessels: [], vessels: [], filteredVessels: [], renderedAisVessels: [] },
  });

  bridge.hydrateStores(
    { mmsi: '224123456', name: 'NERMIN KARABEKIR' },
    { imo: '9876543', dwt: 10_953, flag: 'Türkiye', yearBuilt: 2012, draft: 7.4 },
  );

  assert.equal(match.dwtAssessment.status, 'SUFFICIENT');
  assert.equal(match.compatibility.capacityOk, true);
  assert.equal(match.compatibility.reasons.capacity, 'OK');
  assert.equal(match.hasTechnicalWarning, false);
  assert.equal(match.audit.operationallyEligible, true);
  assert.deepEqual(match.technicalEligibility.criticalReasons, []);
  assert.equal(window.matchingResultsState.eligibleCount, 1);
  assert.equal(window.matchingResultsState.technicalWarningCount, 0);
  assert.equal(window.GlobalStore.compatibleVessels.length, 1);
});

test('proposal review persists first and hydrates the Store only after HTTP success', async () => {
  const match = {
    vessel: {
      mmsi: '224123456',
      vesselName: 'NERMIN KARABEKIR',
      imo: 'PENDING',
      dwt: 0,
      flag: '',
      vesselType: 'Unknown',
      yearBuilt: null,
    },
    ais: { mmsi: '224123456', vesselName: 'NERMIN KARABEKIR' },
    hasTechnicalWarning: true,
    compatibility: { taxonomyCompatible: true, draftOk: true, loaOk: true, dateOk: true, reasons: {} },
    technicalEligibility: {
      cargoTypeId: '100',
      criticalReasons: ['DWT 0 MT inferior a la carga 10000 MT'],
      dwt: { vessel: 0, required: 10_000, maximumSuitable: 11_500 },
      volume: { requiredCbm: 0 },
      equipment: {},
    },
    audit: { operationallyEligible: false, reasons: ['DWT 0 MT inferior a la carga 10000 MT'] },
  };
  let persistedVessel = null;
  let confirmPersistence;
  const { bridge } = loadBridge({
    lastMatchingEngineResults: [match],
    matchingResultsState: { vessels: [match], eligibleVessels: [] },
    GlobalStore: { matchingVessels: [match], rawVessels: [], vessels: [], filteredVessels: [], renderedAisVessels: [] },
    __persistDueDiligenceVessel: async vessel => {
      persistedVessel = vessel;
      await new Promise(resolve => { confirmPersistence = resolve; });
      return { success: true, vessel };
    },
  });
  const identity = { mmsi: '224123456', name: 'NERMIN KARABEKIR' };
  const technical = {
    imo: '9876543',
    dwt: 10_953,
    flag: 'Barbados',
    vesselType: 'General Cargo',
    yearBuilt: 2011,
  };
  const review = bridge.buildProposals(identity, technical);
  const key = bridge.proposalKey(identity);
  bridge.pendingProposals.set(key, { identity, technical, proposals: review.proposals, match: review.match });

  assert.equal(match.vessel.dwt, 0);
  assert.deepEqual(Array.from(review.proposals, proposal => proposal.field), ['imo', 'dwt', 'flag', 'vesselType', 'yearBuilt']);
  assert.deepEqual(bridge.pendingProposals.get(key).technical, technical);

  const acceptance = bridge.acceptPendingProposal(key);
  await Promise.resolve();
  assert.equal(match.vessel.dwt, 0);
  assert.equal(match.vessel.imo, 'PENDING');
  confirmPersistence();
  assert.equal(await acceptance, true);
  assert.equal(match.vessel.imo, '9876543');
  assert.equal(match.vessel.dwt, 10_953);
  assert.equal(match.vessel.flag, 'Barbados');
  assert.equal(match.vessel.vesselType, 'General Cargo');
  assert.equal(match.vessel.yearBuilt, 2011);
  assert.equal(match.dwtAssessment.status, 'SUFFICIENT');
  assert.equal(match.compatibility.capacityOk, true);
  assert.equal(match.hasTechnicalWarning, false);
  assert.equal(match.vessel.audit_status, 'PENDING');
  assert.equal(match.vessel.source_provenance, 'due_diligence_manual');
  assert.equal(persistedVessel.imo, '9876543');
  assert.equal(persistedVessel.dwt, 10_953);
  assert.equal(persistedVessel.audit_status, 'PENDING');
  assert.equal(persistedVessel.process_status, 'PENDING_REVIEW');
  assert.equal(persistedVessel.source_provenance, 'due_diligence_manual');
  assert.equal(bridge.pendingProposals.has(key), false);
});

test('failed Neon persistence leaves the Store untouched and keeps proposals available', async () => {
  const match = {
    vessel: { mmsi: '224123456', vesselName: 'NERMIN KARABEKIR', imo: 'PENDING', dwt: 0, vesselType: 'Unknown' },
    ais: { mmsi: '224123456', vesselName: 'NERMIN KARABEKIR' },
    hasTechnicalWarning: true,
    compatibility: { taxonomyCompatible: true, draftOk: true, loaOk: true, dateOk: true, reasons: { capacity: 'DWT 0 MT inferior a la carga' } },
    technicalEligibility: {
      cargoTypeId: '100',
      criticalReasons: ['DWT 0 MT inferior a la carga 10000 MT'],
      dwt: { vessel: 0, required: 10_000, maximumSuitable: 11_500 },
      volume: { requiredCbm: 0 },
      equipment: {},
    },
    audit: { operationallyEligible: false, reasons: ['DWT 0 MT inferior a la carga 10000 MT'] },
  };
  const notifications = [];
  const { bridge, events } = loadBridge({
    lastMatchingEngineResults: [match],
    matchingResultsState: { vessels: [match], eligibleVessels: [], eligibleCount: 0, technicalWarningCount: 1 },
    GlobalStore: { matchingVessels: [match], rawVessels: [], vessels: [], filteredVessels: [], renderedAisVessels: [] },
    __persistDueDiligenceVessel: async () => { throw new Error('Neon no disponible'); },
    showToast: (message, _spinner, variant) => notifications.push({ message, variant }),
  });
  const identity = { mmsi: '224123456', name: 'NERMIN KARABEKIR' };
  const technical = { imo: '9876543', dwt: 10_953, flag: 'Barbados', vesselType: 'General Cargo', yearBuilt: 2011 };
  const review = bridge.buildProposals(identity, technical);
  const key = bridge.proposalKey(identity);
  bridge.pendingProposals.set(key, { identity, technical, proposals: review.proposals, match: review.match });

  assert.equal(await bridge.acceptPendingProposal(key), false);
  assert.equal(match.vessel.imo, 'PENDING');
  assert.equal(match.vessel.dwt, 0);
  assert.equal(match.vessel.vesselType, 'Unknown');
  assert.equal(match.hasTechnicalWarning, true);
  assert.equal(bridge.pendingProposals.has(key), true);
  assert.equal(events.some(event => event.type === 'vessel:due-diligence-hydrated'), false);
  assert.ok(notifications.some(notification => notification.variant === 'error'));
});

test('non-commercial vessel types are blocked before persistence or Store hydration', async () => {
  const match = {
    vessel: { mmsi: '224123456', vesselName: 'PLEASURE ONE', imo: 'PENDING', dwt: 0, vesselType: 'Unknown' },
    ais: { mmsi: '224123456', vesselName: 'PLEASURE ONE' },
  };
  let persistenceCalls = 0;
  const { bridge, events } = loadBridge({
    lastMatchingEngineResults: [match],
    matchingResultsState: { vessels: [match], eligibleVessels: [] },
    GlobalStore: { matchingVessels: [match], rawVessels: [], vessels: [], filteredVessels: [], renderedAisVessels: [] },
    __persistDueDiligenceVessel: async () => {
      persistenceCalls += 1;
      return { success: true };
    },
    showToast() {},
  });
  const identity = { mmsi: '224123456', name: 'PLEASURE ONE' };
  const technical = { imo: '9876543', dwt: 500, vesselType: 'Motor Yacht', yearBuilt: 2018 };
  const review = bridge.buildProposals(identity, technical);
  const key = bridge.proposalKey(identity);
  bridge.pendingProposals.set(key, {
    identity,
    technical,
    proposals: review.proposals,
    match: review.match,
    commerciallyBlocked: bridge.isNonCommercialVesselType(technical.vesselType),
  });

  assert.equal(bridge.isNonCommercialVesselType('Motor Yacht'), true);
  assert.equal(bridge.isNonCommercialVesselType('General Cargo'), false);
  assert.equal(await bridge.acceptPendingProposal(key), false);
  assert.equal(persistenceCalls, 0);
  assert.equal(match.vessel.imo, 'PENDING');
  assert.equal(match.vessel.dwt, 0);
  assert.equal(events.some(event => event.type === 'vessel:due-diligence-hydrated'), false);
  assert.equal(bridge.pendingProposals.has(key), true);
});

test('rejecting Due Diligence proposals leaves the vessel unchanged', () => {
  const match = { vessel: { mmsi: '224123456', vesselName: 'RAW', dwt: 0 } };
  const { bridge } = loadBridge({
    lastMatchingEngineResults: [match],
    matchingResultsState: { vessels: [match], eligibleVessels: [] },
  });
  const identity = { mmsi: '224123456', name: 'RAW' };
  const technical = { imo: '9876543', dwt: 10_953, flag: 'Barbados', vesselType: 'General Cargo', yearBuilt: 2011 };
  const key = bridge.proposalKey(identity);
  bridge.pendingProposals.set(key, { identity, technical, proposals: [], match });

  assert.equal(bridge.rejectPendingProposal(key), true);
  assert.equal(match.vessel.dwt, 0);
  assert.equal(match.vessel.imo, undefined);
  assert.equal(bridge.pendingProposals.has(key), false);
});
