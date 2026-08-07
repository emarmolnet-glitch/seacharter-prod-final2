/**
 * Registro de clases verificadas de buque (vessels_master / Data Bridge).
 *
 * La API de OpenShips entrega una clasificación genérica ("Cargo", "70", ...).
 * Cuando un buque ya pasó Due Diligence y quedó guardado en vessels_master con su
 * clase comercial real (ej. "Chemical/Oil Products Tanker"), ese valor es la única
 * fuente de verdad: se sobrescribe la clase del feed tanto en la tabla del radar
 * como en los campos que consume el motor de aptitud por tipo de carga.
 */

const ENDPOINT = '/api/vessels-master-classes';
const STORAGE_KEY = 'seacharter:verified-vessel-classes';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOOKUP_BATCH = 200;
const VERIFIED_CLASS_SOURCE = 'VESSELS_MASTER';
const UNKNOWN_CLASS_VALUES = new Set(['', 'n/a', 'na', 'n/d', 'nd', 'unknown', 'desconocido', 'null', 'undefined', 'otros']);

const AIS_SPECIAL_CLASS_BY_CODE = new Map([
  [30, 'Fishing Vessel'],
  [31, 'Towing Vessel'],
  [32, 'Towing Vessel'],
  [33, 'Dredger'],
  [34, 'Diving Operations Vessel'],
  [35, 'Military Vessel'],
  [36, 'Sailing Vessel'],
  [37, 'Pleasure Craft'],
  [50, 'Pilot Vessel'],
  [51, 'Search and Rescue Vessel'],
  [52, 'Tug'],
  [53, 'Port Tender'],
  [54, 'Anti-Pollution Vessel'],
  [55, 'Law Enforcement Vessel'],
  [58, 'Medical Transport'],
  [59, 'Noncombatant Vessel'],
  [70, 'General Cargo'],
  [80, 'Tanker'],
]);

const verifiedClassesByImo = new Map();
const verifiedClassesByMmsi = new Map();
const resolvedIdentifiers = new Set();

const globalScope = typeof globalThis === 'undefined' ? undefined : globalThis;

function readText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeVerifiedImo(value) {
  const digits = readText(value).replace(/\D/g, '');
  return digits.length === 7 ? digits : '';
}

export function normalizeVerifiedMmsi(value) {
  const digits = readText(value).replace(/\D/g, '');
  return digits.length === 9 ? digits : '';
}

function isMeaningfulClass(value) {
  return !UNKNOWN_CLASS_VALUES.has(readText(value).toLowerCase());
}

export function translateAisVesselClass(value) {
  const vesselClass = readText(value);
  if (!/^\d{1,2}$/.test(vesselClass)) return vesselClass;
  const code = Number(vesselClass);
  if (AIS_SPECIAL_CLASS_BY_CODE.has(code)) return AIS_SPECIAL_CLASS_BY_CODE.get(code);
  if (code >= 20 && code <= 29) return 'Wing in Ground Craft';
  if (code >= 40 && code <= 49) return 'High Speed Craft';
  if (code >= 60 && code <= 69) return 'Passenger Ship';
  if (code >= 71 && code <= 79) return 'Cargo';
  if (code >= 81 && code <= 89) return 'Tanker';
  if (code >= 90 && code <= 99) return 'Other Vessel';
  return 'Vessel Type Not Available';
}

function readPositiveNumber(value) {
  const numeric = Number.parseFloat(readText(value).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function readYear(value) {
  const match = readText(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function readVesselScopes(vessel) {
  if (!vessel || typeof vessel !== 'object') return [];
  const scopes = [vessel];
  ['MetaData', 'metadata', 'source_payload', 'sourcePayload', 'rawData', 'raw_data', 'Message', 'vessel', 'ais'].forEach(key => {
    const nested = vessel[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) scopes.push(nested);
  });
  scopes.slice().forEach(scope => {
    ['MetaData', 'metadata', 'ShipStaticData', 'shipStaticData'].forEach(key => {
      const nested = scope[key];
      if (nested && typeof nested === 'object' && !Array.isArray(nested) && !scopes.includes(nested)) scopes.push(nested);
    });
  });
  return scopes;
}

function readScopedValue(vessel, keys) {
  for (const scope of readVesselScopes(vessel)) {
    for (const key of keys) {
      const value = scope?.[key];
      if (value !== null && value !== undefined && readText(value) !== '') return value;
    }
  }
  return '';
}

export function readVesselImo(vessel) {
  return normalizeVerifiedImo(readScopedValue(vessel, ['imo', 'IMO', 'imoNumber', 'imo_number', 'ImoNumber']));
}

export function readVesselMmsi(vessel) {
  return normalizeVerifiedMmsi(readScopedValue(vessel, ['mmsi', 'MMSI', 'mmsiNumber', 'mmsi_number', 'UserID']));
}

function readVesselNameValue(vessel) {
  return readText(readScopedValue(vessel, ['vesselName', 'vessel_name', 'ShipName', 'name']));
}

function readCandidateClass(record) {
  return readText(readScopedValue(record, [
    'vesselClass', 'vessel_class', 'commercialClass', 'commercial_class', 'claseComercial',
    'clase_comercial', 'vesselType', 'vessel_type', 'tipoBuque', 'tipo_buque',
    'shipType', 'ship_type', 'ShipType',
  ]));
}

/** Guarda (o refresca) la clase verificada de un buque en el registro local. */
export function recordVerifiedVesselClass(record) {
  if (!record || typeof record !== 'object') return null;
  const vesselClass = readCandidateClass(record);
  const grossTonnage = readPositiveNumber(readScopedValue(record, ['grossTonnage', 'gross_tonnage', 'gt', 'GT']));
  const loaMeters = readPositiveNumber(readScopedValue(record, ['loaMeters', 'loa_meters', 'loa', 'LOA', 'lengthOverall', 'length_overall']));
  const beamMeters = readPositiveNumber(readScopedValue(record, ['beamMeters', 'beam_meters', 'beam', 'Beam', 'breadth', 'manga']));
  const flag = readText(readScopedValue(record, ['flag', 'Flag', 'bandera', 'country']));
  const yearBuilt = readYear(readScopedValue(record, ['yearBuilt', 'year_built', 'builtYear', 'built_year', 'Year_Built']));
  const meaningfulClass = vesselClass && isMeaningfulClass(vesselClass) ? vesselClass : '';
  if (!meaningfulClass && !grossTonnage && !loaMeters && !beamMeters && !flag && !yearBuilt) return null;
  const imo = readVesselImo(record);
  const mmsi = readVesselMmsi(record);
  if (!imo && !mmsi) return null;
  const entry = {
    imo,
    mmsi,
    vesselClass: meaningfulClass,
    grossTonnage,
    loaMeters,
    beamMeters,
    flag,
    yearBuilt,
    vesselName: readVesselNameValue(record),
    verifiedAt: readText(record.verifiedAt || record.verified_at || record.dueDiligenceValidatedAt) || new Date().toISOString(),
    source: readText(record.source) || VERIFIED_CLASS_SOURCE,
  };
  if (imo) {
    verifiedClassesByImo.set(imo, entry);
    resolvedIdentifiers.add(`imo:${imo}`);
  }
  if (mmsi) {
    verifiedClassesByMmsi.set(mmsi, entry);
    resolvedIdentifiers.add(`mmsi:${mmsi}`);
  }
  persistVerifiedVesselClasses();
  return entry;
}

/** Devuelve el registro verificado (o null) para un buque del radar. */
export function getVerifiedVesselClassRecord(vessel) {
  const imo = readVesselImo(vessel);
  if (imo && verifiedClassesByImo.has(imo)) return verifiedClassesByImo.get(imo);
  const mmsi = readVesselMmsi(vessel);
  if (mmsi && verifiedClassesByMmsi.has(mmsi)) return verifiedClassesByMmsi.get(mmsi);
  return null;
}

export function getVerifiedVesselClass(vessel) {
  return getVerifiedVesselClassRecord(vessel)?.vesselClass || '';
}

export function hasVerifiedVesselClass(vessel) {
  return Boolean(getVerifiedVesselClassRecord(vessel));
}

/**
 * Proyecta la clase verificada sobre todos los alias que leen la tabla del radar,
 * el embudo comercial y `evaluateCargoVesselEligibility`.
 */
export function applyVerifiedVesselClass(vessel) {
  if (!vessel || typeof vessel !== 'object') return vessel;
  const record = getVerifiedVesselClassRecord(vessel);
  if (!record) return vessel;
  const metadata = vessel.MetaData && typeof vessel.MetaData === 'object' && !Array.isArray(vessel.MetaData)
    ? { ...vessel.MetaData }
    : {};
  const verifiedClass = record.vesselClass;
  const verifiedFields = {};
  if (verifiedClass) {
    Object.assign(metadata, {
      ShipType: verifiedClass,
      shipType: verifiedClass,
      ship_type: verifiedClass,
      vesselType: verifiedClass,
      vessel_type: verifiedClass,
      vesselClass: verifiedClass,
    });
    Object.assign(verifiedFields, {
      vesselClass: verifiedClass,
      vessel_class: verifiedClass,
      vesselType: verifiedClass,
      vessel_type: verifiedClass,
      shipType: verifiedClass,
      ship_type: verifiedClass,
      ShipType: verifiedClass,
      type: verifiedClass,
      tipo_buque: verifiedClass,
      radarCategory: verifiedClass,
      verifiedVesselClass: verifiedClass,
      vesselClassVerified: true,
    });
  }
  if (record.grossTonnage) {
    Object.assign(metadata, { grossTonnage: record.grossTonnage, gross_tonnage: record.grossTonnage, GT: record.grossTonnage });
    Object.assign(verifiedFields, { grossTonnage: record.grossTonnage, gross_tonnage: record.grossTonnage, gt: record.grossTonnage, GT: record.grossTonnage });
  }
  if (record.loaMeters) {
    Object.assign(metadata, { loaMeters: record.loaMeters, loa_meters: record.loaMeters, LOA: record.loaMeters });
    Object.assign(verifiedFields, { loaMeters: record.loaMeters, loa_meters: record.loaMeters, loa: record.loaMeters, LOA: record.loaMeters });
  }
  if (record.beamMeters) {
    Object.assign(metadata, { beamMeters: record.beamMeters, beam_meters: record.beamMeters, Beam: record.beamMeters });
    Object.assign(verifiedFields, { beamMeters: record.beamMeters, beam_meters: record.beamMeters, beam: record.beamMeters, breadth: record.beamMeters });
  }
  if (record.flag) {
    Object.assign(metadata, { flag: record.flag, Flag: record.flag });
    Object.assign(verifiedFields, { flag: record.flag, Flag: record.flag, bandera: record.flag });
  }
  if (record.yearBuilt) {
    Object.assign(metadata, { yearBuilt: record.yearBuilt, year_built: record.yearBuilt, Year_Built: record.yearBuilt });
    Object.assign(verifiedFields, { yearBuilt: record.yearBuilt, year_built: record.yearBuilt, builtYear: record.yearBuilt, built_year: record.yearBuilt });
  }
  return {
    ...vessel,
    MetaData: metadata,
    ...verifiedFields,
    vesselTechnicalProfileVerified: true,
    vesselClassSource: record.source || VERIFIED_CLASS_SOURCE,
    vesselClassVerifiedAt: record.verifiedAt || null,
  };
}

export function applyVerifiedVesselClasses(vessels) {
  return Array.isArray(vessels) ? vessels.map(applyVerifiedVesselClass) : vessels;
}

function collectPendingIdentifiers(vessels) {
  const imos = [];
  const mmsis = [];
  (Array.isArray(vessels) ? vessels : []).forEach(vessel => {
    const imo = readVesselImo(vessel);
    if (imo && !resolvedIdentifiers.has(`imo:${imo}`) && !imos.includes(imo)) imos.push(imo);
    const mmsi = readVesselMmsi(vessel);
    if (mmsi && !resolvedIdentifiers.has(`mmsi:${mmsi}`) && !mmsis.includes(mmsi)) mmsis.push(mmsi);
  });
  return { imos: imos.slice(0, MAX_LOOKUP_BATCH), mmsis: mmsis.slice(0, MAX_LOOKUP_BATCH) };
}

/**
 * Consulta vessels_master para los buques cuyo IMO/MMSI todavía no se ha resuelto.
 * Cada identificador se marca como resuelto (haya coincidencia o no) para que un
 * barrido continuo no repita la consulta en cada repintado.
 */
export async function hydrateVerifiedVesselClasses(vessels, options = {}) {
  const fetchImpl = options.fetchImpl || globalScope?.fetch?.bind(globalScope);
  const { imos, mmsis } = collectPendingIdentifiers(vessels);
  if (!imos.length && !mmsis.length) return { requested: 0, added: 0, changed: false };
  if (typeof fetchImpl !== 'function') return { requested: 0, added: 0, changed: false };

  const identifierKeys = [...imos.map(imo => `imo:${imo}`), ...mmsis.map(mmsi => `mmsi:${mmsi}`)];
  identifierKeys.forEach(key => resolvedIdentifiers.add(key));

  try {
    const response = await fetchImpl(options.endpoint || ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ imos, mmsis }),
      signal: options.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) throw new Error(payload?.error || `HTTP ${response.status}`);
    const entries = Array.isArray(payload?.profiles) ? payload.profiles : (Array.isArray(payload?.classes) ? payload.classes : []);
    let added = 0;
    entries.forEach(entry => {
      const previous = JSON.stringify(getVerifiedVesselClassRecord(entry) || null);
      const stored = recordVerifiedVesselClass(entry);
      if (stored && JSON.stringify(stored) !== previous) added += 1;
    });
    return { requested: imos.length + mmsis.length, added, changed: added > 0 };
  } catch (error) {
    identifierKeys.forEach(key => resolvedIdentifiers.delete(key));
    return { requested: imos.length + mmsis.length, added: 0, changed: false, error };
  }
}

export function getVerifiedVesselClassCount() {
  return verifiedClassesByImo.size + verifiedClassesByMmsi.size;
}

export function clearVerifiedVesselClasses() {
  verifiedClassesByImo.clear();
  verifiedClassesByMmsi.clear();
  resolvedIdentifiers.clear();
}

function readStorage() {
  try {
    return globalScope?.localStorage || null;
  } catch (_) {
    return null;
  }
}

function persistVerifiedVesselClasses() {
  const storage = readStorage();
  if (!storage) return false;
  try {
    const entries = Array.from(new Set([...verifiedClassesByImo.values(), ...verifiedClassesByMmsi.values()]));
    storage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), entries }));
    return true;
  } catch (_) {
    return false;
  }
}

function restoreVerifiedVesselClasses() {
  const storage = readStorage();
  if (!storage) return 0;
  try {
    const cached = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (!cached || !Array.isArray(cached.entries)) return 0;
    if (!Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt > STORAGE_TTL_MS) {
      storage.removeItem(STORAGE_KEY);
      return 0;
    }
    let restored = 0;
    cached.entries.forEach(entry => {
      if (recordVerifiedVesselClass(entry)) restored += 1;
    });
    return restored;
  } catch (_) {
    return 0;
  }
}

function repaintRadarWithVerifiedClasses() {
  if (typeof globalScope?.syncDensityDisplayConsumers === 'function') {
    globalScope.syncDensityDisplayConsumers({ updateGlobe: false });
  } else if (typeof globalScope?.renderDensityVesselsTable === 'function' && typeof globalScope?.getDensityDisplayVessels === 'function') {
    globalScope.renderDensityVesselsTable(globalScope.getDensityDisplayVessels());
  }
}

export const VesselMasterClassRegistry = {
  ENDPOINT,
  applyVerifiedVesselClass,
  applyVerifiedVesselClasses,
  clearVerifiedVesselClasses,
  getVerifiedVesselClass,
  getVerifiedVesselClassCount,
  getVerifiedVesselClassRecord,
  hasVerifiedVesselClass,
  hydrateVerifiedVesselClasses,
  readVesselImo,
  readVesselMmsi,
  recordVerifiedVesselClass,
  repaintRadarWithVerifiedClasses,
  restoreVerifiedVesselClasses,
  translateAisVesselClass,
};

if (globalScope) {
  globalScope.VesselMasterClassRegistry = VesselMasterClassRegistry;
  globalScope.applyVerifiedVesselClass = applyVerifiedVesselClass;
  globalScope.getVerifiedVesselClass = getVerifiedVesselClass;
  globalScope.hydrateVerifiedVesselClasses = hydrateVerifiedVesselClasses;
  globalScope.recordVerifiedVesselClass = recordVerifiedVesselClass;
  globalScope.translateAisVesselClass = translateAisVesselClass;

  if (typeof globalScope.addEventListener === 'function' && typeof globalScope.document !== 'undefined') {
    restoreVerifiedVesselClasses();
    // Al cerrar una Due Diligence el radar debe reflejar la clase real sin esperar al próximo barrido.
    ['vessel:due-diligence-persisted', 'vessel:density-optimistic-update'].forEach(eventName => {
      globalScope.addEventListener(eventName, event => {
        if (recordVerifiedVesselClass(event?.detail?.vessel)) repaintRadarWithVerifiedClasses();
      });
    });
  }
}
