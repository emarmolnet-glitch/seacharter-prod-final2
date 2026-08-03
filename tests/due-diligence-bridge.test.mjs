import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [indexSource, entrySource, serviceSource, backendSource, persistenceBackendSource, technicalCacheSource, technicalMigrationSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/dueDiligenceService.js', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-due-diligence.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-due-diligence-save.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/vessel-technical-cache.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/database/migrations/20260802170000_add_vessels_master_technical_dimensions/migration.sql', import.meta.url), 'utf8'),
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

test('matching cards gate Calculator but expose external Due Diligence for every identified vessel', () => {
  assert.match(indexSource, /const requiresDueDiligence = isDwtUnknown \|\| !isValidImo/);
  assert.match(indexSource, /data-due-diligence-button/);
  assert.match(indexSource, /const dueDiligenceButtonHtml = hasDueDiligenceIdentity \? `/);
  assert.match(indexSource, /data-due-diligence-mode="external-search"/);
  assert.match(indexSource, /data-external-search="true"/);
  assert.match(indexSource, /Due Diligence · Buscar datos externos/);
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
  assert.match(indexSource, /const sourceMatch = m && typeof m === 'object' \? m : \{\}/);
  assert.match(indexSource, /Number\.isFinite\(Number\(rawFinancials\.netProfit\)\)/);
  assert.match(indexSource, /hasCurrentCoordinates \? `\$\{currentLatitude\.toFixed\(3\)\}/);
  assert.match(indexSource, /renderMatchingCardErrorFallback/);
  assert.match(indexSource, /data-matching-render-error="true"/);
});

test('Due Diligence uses one external search and persists only after acceptance', () => {
  assert.match(entrySource, /import \{ fetchDueDiligence, persistDueDiligenceVessel \} from '.\/services\/dueDiligenceService\.js'/);
  assert.match(entrySource, /addEventListener\('click', handleDueDiligenceClick, true\)/);
  assert.match(entrySource, /event\.preventDefault\(\)/);
  assert.match(entrySource, /event\.stopImmediatePropagation\(\)/);
  assert.match(entrySource, /const responsePayload = await fetchDueDiligence/);
  assert.match(entrySource, /data-due-diligence-button\]\[data-due-diligence-mode\]/);
  assert.match(entrySource, /\[data-matching-result-card="true"\], \[data-vessel-recommendation="true"\]/);
  assert.doesNotMatch(entrySource, /fetchLocalDueDiligence|usesLocalCache/);
  assert.match(entrySource, /Consultando fuentes externas/);
  assert.match(entrySource, /persistDueDiligenceVessel\(vessel/);
  assert.match(entrySource, /acceptButton\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(entrySource, /Guardando\.\.\./);
  assert.match(entrySource, /Perfil guardado en Neon\. PDAs y márgenes recalculados\./);
  assert.match(entrySource, /vessel:financial-recalculated/);
  assert.match(entrySource, /Due Diligence guardada correctamente en Neon\./);
  assert.match(entrySource, /No se pudo guardar en Neon\. El Store no fue modificado\./);
  assert.match(entrySource, /BUQUE NO COMERCIAL DETECTADO/);
  assert.match(entrySource, /accept\.disabled = commerciallyBlocked/);
  assert.match(entrySource, /aria-modal/);
  assert.match(entrySource, /Comparación externa/);
  assert.match(entrySource, /\['Campo', 'Actual', 'Externo', 'Estado'\]/);
  assert.match(entrySource, /Factor de Estiba \(SF\)/);
  assert.match(entrySource, /selectedProduct\?\.sf/);
  assert.match(entrySource, /Calado calculado/);
  assert.match(entrySource, /SeaCharterReactiveCostState\?\.state\?\.calado_actual/);
  assert.match(entrySource, /SeaCharterVoyageCostEngine\?\.estimateDraft/);
  assert.match(entrySource, /Algoritmo Core PRO/);
  assert.doesNotMatch(entrySource, /label: 'Factor de Estiba \(SF\)'[\s\S]{0,260}N\/D/);
  assert.doesNotMatch(entrySource, /label: 'Calado calculado'[\s\S]{0,260}N\/D/);
  assert.match(entrySource, /\{ field: 'beamMeters', label: 'Manga' \}/);
  assert.match(entrySource, /const safeProposals = Array\.isArray\(proposals\)/);
  assert.match(entrySource, /const pendingTechnical = pending\.technical && typeof pending\.technical === 'object'/);
  assert.match(entrySource, /flex max-h-\[90vh\][^']*flex-col overflow-hidden/);
  assert.match(entrySource, /min-h-0 flex-1[^']*overflow-y-auto/);
  assert.match(entrySource, /body\.dataset\.dueDiligenceScrollBody = 'true'/);
  assert.match(entrySource, /footer\.dataset\.dueDiligenceFooter = 'true'/);
  assert.match(entrySource, /footer\.className = 'shrink-0 border-t/);
  assert.match(entrySource, /reject\.textContent = 'Rechazar'/);
  assert.match(entrySource, /panel\.append\(body\);[\s\S]*panel\.append\(footer\)/);
  assert.doesNotMatch(entrySource, /\/api\/scrape-vessel/);
  assert.doesNotMatch(entrySource, /IndexedDB|localStorage|saveEditedVesselParams|saveVesselToIndexedDB/);
  assert.doesNotMatch(entrySource, /ais:vessels-updated/);
  assert.match(indexSource, /dueDiligenceExternalOnlyActive === true/);
  assert.match(indexSource, /dueDiligenceSuppressLocalPersistenceUntil/);
  assert.match(backendSource, /path: "\/api\/vessel-due-diligence"/);
});

test('Data Bridge source aliases and V2 metadata render the corporate badge', () => {
  assert.match(indexSource, /normalizedSource === 'DATA_BRIDGE'/);
  assert.match(indexSource, /normalizedSource\.includes\('DATABRIDGE'\)/);
  assert.match(indexSource, /const hasLocalMasterMetadata = sourceRecords\.some/);
  assert.match(indexSource, /source_payload/);
  assert.match(indexSource, /cacheValidated === true/);
  assert.match(indexSource, /normalizeMatchingSourceMetadata\(m, v, m\.ais\)/);
  assert.match(indexSource, /DATABRIDGE: 'Data Bridge'/);
  assert.match(indexSource, /MASTER: 'Master V2'/);
});

test('Vite bundles the ES module service and no loose ghost script remains', () => {
  assert.match(indexSource, /<script type="module" src="\.\/src\/due-diligence-entry\.js"><\/script>/);
  assert.doesNotMatch(indexSource, /<script[^>]+src="\.\/due-diligence-bridge\.js/);
  assert.equal(existsSync(new URL('../due-diligence-bridge.js', import.meta.url)), false);
  assert.match(serviceSource, /export async function fetchDueDiligence/);
  assert.match(serviceSource, /body: JSON\.stringify\(\{ \.\.\.payload, externalOnly: true \}\)/);
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
            gross_tonnage: 7_580,
            loa_meters: 138.4,
            beam_meters: 21.5,
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
    externalOnly: true,
  });
  assert.deepEqual(result.data, {
    imo: '9876543',
    dwt: 10_953,
    flag: 'Barbados',
    vesselType: 'General Cargo',
    builtYear: 2011,
    grossTonnage: 7_580,
    loaMeters: 138.4,
    beamMeters: 21.5,
  });
});

test('backend external audit bypasses Neon cache and waits for explicit acceptance', () => {
  assert.match(backendSource, /body\?\.externalOnly === true/);
  assert.match(backendSource, /if \(!externalOnly\) \{[\s\S]*findVesselTechnicalRecord/);
  assert.match(backendSource, /externalOnly \? emptyVesselData\(\) : cachedData/);
  assert.match(backendSource, /if \(!externalOnly && result\.extracted/);
  assert.match(backendSource, /mode: externalOnly \? "public-source-audit"/);
  assert.match(backendSource, /requiresAcceptance: externalOnly/);
});

test('frontend normalization recognizes external labels for flag, length, and vessel type', () => {
  const normalized = serviceModule.normalizeDueDiligenceData({
    IMO: '9876543',
    DWT: '10,953 MT',
    Flag: 'Barbados',
    'Vessel Type': 'General Cargo',
    'Year Built': '2011',
    'Gross Tonnage': '7,580',
    LENGTH: '138.4 m',
    Beam: '21.5 m',
  });
  assert.deepEqual(normalized, {
    imo: '9876543',
    dwt: 10_953,
    flag: 'Barbados',
    vesselType: 'General Cargo',
    builtYear: 2011,
    grossTonnage: 7_580,
    loaMeters: 138.4,
    beamMeters: 21.5,
  });

  const { bridge } = loadBridge();
  assert.deepEqual({ ...bridge.normalizeTechnicalRecord({
    Flag: 'Malta',
    'Ship Type': 'Bulk Carrier',
    LOA: '179.9 m',
  }) }, {
    imo: '',
    dwt: null,
    flag: 'Malta',
    vesselType: 'Bulk Carrier',
    yearBuilt: null,
    grossTonnage: null,
    loaMeters: 179.9,
    beamMeters: null,
    draft: null,
    sourceUrl: '',
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

test('persistence backend consolidates normalized technical fields by IMO or MMSI', () => {
  assert.match(persistenceBackendSource, /path: "\/api\/vessel-due-diligence-save"/);
  assert.match(persistenceBackendSource, /gross_tonnage/);
  assert.match(persistenceBackendSource, /loa_meters/);
  assert.match(persistenceBackendSource, /Se requiere IMO o MMSI válido/);
  assert.match(persistenceBackendSource, /upsertVesselTechnicalRecord/);
  assert.match(technicalCacheSource, /ON CONFLICT \(imo_number\) DO UPDATE SET/);
  assert.match(technicalCacheSource, /gross_tonnage = COALESCE\(EXCLUDED\.gross_tonnage, vessels_master\.gross_tonnage\)/);
  assert.match(technicalCacheSource, /net_tonnage = COALESCE\(EXCLUDED\.net_tonnage, vessels_master\.net_tonnage\)/);
  assert.match(technicalCacheSource, /loa_meters = COALESCE\(EXCLUDED\.loa_meters, vessels_master\.loa_meters\)/);
  assert.match(technicalCacheSource, /beam_meters = COALESCE\(EXCLUDED\.beam_meters, vessels_master\.beam_meters\)/);
  assert.match(technicalCacheSource, /call_sign = COALESCE\(EXCLUDED\.call_sign, vessels_master\.call_sign\)/);
  assert.match(technicalCacheSource, /year_built = COALESCE\(EXCLUDED\.year_built, vessels_master\.year_built\)/);
  assert.match(technicalCacheSource, /OR \(\$2::text IS NOT NULL AND mmsi = \$2::text\)/);
  assert.match(technicalMigrationSource, /ADD COLUMN IF NOT EXISTS gross_tonnage NUMERIC/);
  assert.match(technicalMigrationSource, /ADD COLUMN IF NOT EXISTS loa_meters NUMERIC/);
  assert.match(technicalMigrationSource, /ADD COLUMN IF NOT EXISTS year_built INT/);
  assert.match(persistenceBackendSource, /SELECT COUNT\(\*\)::integer AS total FROM vessels_master/);
  assert.match(persistenceBackendSource, /masterVesselCount:/);
  assert.match(persistenceBackendSource, /import \{ sanitizeVesselTechnicalRecord \}/);
  assert.match(persistenceBackendSource, /const sanitizedVessel = sanitizeVesselTechnicalRecord\(\{/);
  assert.match(technicalCacheSource, /prepareVesselTechnicalPersistence\(record\)/);
  assert.match(persistenceBackendSource, /NON_COMMERCIAL_VESSEL_PATTERN\.test\(vesselType\)/);
  assert.match(persistenceBackendSource, /console\.error\("\[vessel-due-diligence-save\] PostgreSQL persistence failed", error\)/);
  assert.match(persistenceBackendSource, /return json\(\{ success: false, error: errorMessage \}, 500, headers\)/);
  assert.doesNotMatch(persistenceBackendSource, /source_provenance|audit_status|audit_source|validation_status|system_identity|source_payload|fecha_ultima_actualizacion/);
  assert.doesNotMatch(persistenceBackendSource, /\bsource\b\s*[,)!=]/);
});

test('backend reads vessels_master first and persists successful waterfall extraction', () => {
  assert.match(backendSource, /findVesselTechnicalRecord/);
  assert.match(technicalCacheSource, /LOWER\(BTRIM\(vessel_name\)\) = LOWER\(BTRIM\(\$3::text\)\)/);
  assert.match(backendSource, /hasCachedMandatoryTechnicalData\(cachedRecord\)/);
  assert.match(backendSource, /mode: "local-database-cache"/);
  assert.match(backendSource, /attempts: \[\]/);
  assert.match(backendSource, /runSourceWaterfall\(identity, deadlineAt, externalOnly \? emptyVesselData\(\) : cachedData\)/);
  assert.match(backendSource, /await upsertVesselTechnicalRecord\(vesselDataToTechnicalRecord\(result\.data, identity\)\)/);
  assert.match(backendSource, /persisted: !externalOnly && result\.extracted && hasUsefulTechnicalData\(result\.data\)/);
});

test('backend accepts IMO, MMSI, or vessel name and searches the four public providers', () => {
  assert.match(backendSource, /const query = imo \|\| mmsi \|\| vesselName/);
  assert.match(backendSource, /if \(!identity\)[\s\S]*IMO válido, MMSI o nombre del buque/);
  const marineVesselTraffic = backendSource.indexOf('provider: "MarineVesselTraffic"');
  const vesselFinder = backendSource.indexOf('provider: "VesselFinder"');
  const marineTraffic = backendSource.indexOf('provider: "MarineTraffic"');
  const balticShipping = backendSource.indexOf('provider: "BalticShipping"');
  assert.ok(vesselFinder < marineVesselTraffic && marineVesselTraffic < marineTraffic && marineTraffic < balticShipping);
  assert.match(backendSource, /buildUrls: \(identity\)/);
  assert.match(backendSource, /encodeURIComponent\(identity\.query\)/);
  assert.match(backendSource, /runSourceWaterfall\(identity, deadlineAt, externalOnly \? emptyVesselData\(\) : cachedData\)/);
  assert.match(backendSource, /import \{ mappedVesselField, parseVesselAttribute \}/);
  assert.match(backendSource, /import \{ extractVesselFinderDetailUrl, extractVesselFinderFields \}/);
  assert.match(backendSource, /parseVesselAttribute\(rawKey, rawValue\)/);
  assert.match(backendSource, /provider === "VesselFinder"/);
  assert.match(backendSource, /extractVesselFinderFields\(html, identity\)/);
  assert.match(backendSource, /extractVesselFinderDetailUrl\(html, identity\)/);
  assert.match(backendSource, /pendingUrls\.push\(detailUrl\)/);
  assert.match(backendSource, /data\.vessel_type = readCell\("vessel_type"\)/);
  assert.match(backendSource, /data\.call_sign = readCell\("call_sign"\)/);
  assert.match(backendSource, /findStructuredVesselType/);
  assert.match(backendSource, /field === "vessel_type"/);
  assert.match(backendSource, /script\[type='application\/ld\+json'\]/);
  assert.match(backendSource, /data-field='vessel-type'/);
  assert.match(backendSource, /hasCompleteDueDiligenceData\(combinedData\)/);
  assert.match(backendSource, /data: normalizedResponseData\(result\.data\)/);
  assert.match(technicalCacheSource, /last_port = COALESCE\(\$16::text, vessels_master\.last_port\)/);
  assert.match(technicalCacheSource, /NULLIF\(\$17::text, ''\)::timestamptz/);
  assert.match(technicalCacheSource, /ON CONFLICT \(imo_number\) DO UPDATE SET/);
  assert.match(technicalCacheSource, /eta = COALESCE\(EXCLUDED\.eta, vessels_master\.eta\)/);
  assert.match(persistenceBackendSource, /last_port: savedVessel\.lastPort/);
  assert.match(persistenceBackendSource, /eta: savedVessel\.eta/);
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
    grossTonnage: 7_580,
    loaMeters: 138.4,
    beamMeters: 21.5,
    draft: 9.4,
  });

  assert.equal(vessel.imo, '9876543');
  assert.equal(vessel.dwt, 42_000);
  assert.equal(vessel.flag, 'Spain');
  assert.equal(vessel.vesselType, 'General Cargo');
  assert.equal(vessel.vessel_type, 'General Cargo');
  assert.equal(vessel.yearBuilt, 2018);
  assert.equal(vessel.gross_tonnage, 7_580);
  assert.equal(vessel.loa_meters, 138.4);
  assert.equal(vessel.beam_meters, 21.5);
  assert.equal(vessel.draft, 9.4);
  assert.equal(vessel.latitude, 36.1234);
  assert.equal(vessel.longitude, -5.4321);
  assert.equal(vessel.MetaData.latitude, 36.1234);
  assert.equal(vessel.MetaData.longitude, -5.4321);
});

test('accepted external data recalculates PDAs and financial margins for the active vessel', () => {
  const activeVessel = { mmsi: '224123456', vesselName: 'ACTIVE VESSEL', dwt: 9_000, gt: 5_000, loa: 110 };
  const manualUpdates = [];
  const pdaCalls = [];
  let engineCalls = 0;
  const { bridge, events, window } = loadBridge({
    GlobalStore: { activeVessel, calculatorVessel: activeVessel },
    handleManualVesselUpdate: (field, value) => manualUpdates.push([field, value]),
    debouncedAutoFillPDA: (...args) => pdaCalls.push(args),
    scheduleReactiveEngine: () => { engineCalls += 1; },
  });
  const recalculated = bridge.recalculateFinancialEngine(
    { mmsi: '224123456', name: 'ACTIVE VESSEL' },
    { imo: '9876543', dwt: 12_500, grossTonnage: 7_800, loaMeters: 138.4, beamMeters: 21.5, flag: 'Malta', yearBuilt: 2014 },
  );
  assert.equal(recalculated, true);
  assert.equal(window.GlobalStore.calculatorVessel.dwt, 12_500);
  assert.equal(window.GlobalStore.calculatorVessel.gross_tonnage, 7_800);
  assert.equal(window.GlobalStore.calculatorVessel.loa_meters, 138.4);
  assert.equal(window.GlobalStore.calculatorVessel.beam_meters, 21.5);
  assert.ok(manualUpdates.some(([field, value]) => field === 'dwt' && value === 12_500));
  assert.ok(manualUpdates.some(([field, value]) => field === 'gt' && value === 7_800));
  assert.deepEqual(pdaCalls.map(call => call[0]), ['pol', 'pod']);
  assert.equal(engineCalls, 1);
  assert.ok(events.some(event => event.type === 'vessel:financial-recalculated'));
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
  const { bridge, events, window } = loadBridge({
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
  assert.equal(window.GlobalStore.dueDiligenceVessels.length, 1);
  assert.equal(window.GlobalStore.dueDiligenceVessels[0].imo, '9876543');
  assert.equal(window.GlobalStore.dueDiligenceVessels[0].year_built, 2018);
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
  assert.equal(persistedVessel.imo, '9876543');
  assert.equal(persistedVessel.dwt, 10_953);
  assert.equal('audit_status' in persistedVessel, false);
  assert.equal('source_provenance' in persistedVessel, false);
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
