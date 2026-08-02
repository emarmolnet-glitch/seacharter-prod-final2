const DEFAULT_ENDPOINT = '/api/vessel-due-diligence';
const DEFAULT_PERSISTENCE_ENDPOINT = '/api/vessel-due-diligence-save';

function readText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeImo(value) {
  const digits = readText(value).replace(/\D/g, '');
  return digits.length === 7 ? digits : '';
}

function normalizeMmsi(value) {
  const digits = readText(value).replace(/\D/g, '');
  return digits.length === 9 ? digits : '';
}

function readPositiveNumber(value) {
  const normalized = readText(value)
    .replace(/[^\d.,-]/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readYear(value) {
  const match = readText(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function normalizeDueDiligenceData(result = {}) {
  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  return {
    imo: normalizeImo(data.imo_number || data.imo || data.IMO),
    dwt: readPositiveNumber(data.dwt || data.DWT || data.deadweight),
    flag: readText(data.flag || data.bandera || data.country),
    vesselType: readText(data.vessel_type || data.vesselType || data.shipType || data.type),
    builtYear: readYear(data.year_built || data.builtYear || data.yearBuilt || data.anio),
    grossTonnage: readPositiveNumber(data.gross_tonnage || data.grossTonnage || data.gt || data.GT),
    loaMeters: readPositiveNumber(data.loa_meters || data.loaMeters || data.loa || data.LOA || data.length_overall),
  };
}

export function normalizeDueDiligenceIdentity(identity = {}) {
  const imo = normalizeImo(identity.imo);
  const mmsi = normalizeMmsi(identity.mmsi);
  const vesselName = readText(identity.vesselName || identity.name);
  if (!imo && !mmsi && !vesselName) {
    throw new Error('Due Diligence requiere al menos IMO, MMSI o nombre del buque.');
  }
  return { imo, mmsi, vesselName };
}

export async function fetchDueDiligence(
  identity,
  { endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch, signal } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No hay un cliente HTTP disponible para Due Diligence.');
  }
  const payload = normalizeDueDiligenceIdentity(identity);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const rawText = await response.text();
  let result = {};
  if (rawText.trim()) {
    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error('Data Bridge devolvió una respuesta JSON inválida.');
    }
  }
  if (!response.ok || result.success === false || result.ok === false) {
    throw new Error(result.error || `No se pudo completar Due Diligence (HTTP ${response.status}).`);
  }
  return {
    ...result,
    data: normalizeDueDiligenceData(result),
  };
}

export async function persistDueDiligenceVessel(
  vessel,
  { endpoint = DEFAULT_PERSISTENCE_ENDPOINT, fetchImpl = globalThis.fetch, signal } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No hay un cliente HTTP disponible para guardar Due Diligence.');
  }
  const response = await fetchImpl(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ vessel }),
    signal,
  });
  const rawText = await response.text();
  let result = {};
  if (rawText.trim()) {
    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error('Neon devolvió una respuesta JSON inválida al guardar el buque.');
    }
  }
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `No se pudo guardar el buque en Neon (HTTP ${response.status}).`);
  }
  return result;
}

export const DUE_DILIGENCE_ENDPOINT = DEFAULT_ENDPOINT;
export const DUE_DILIGENCE_PERSISTENCE_ENDPOINT = DEFAULT_PERSISTENCE_ENDPOINT;
