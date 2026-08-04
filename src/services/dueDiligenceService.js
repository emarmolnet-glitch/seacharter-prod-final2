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

function normalizeFieldLabel(value) {
  return readText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function readLabeledValue(record, labels) {
  if (!record || typeof record !== 'object') return undefined;
  const entriesByLabel = new Map(Object.entries(record).map(([key, value]) => [normalizeFieldLabel(key), value]));
  const matchedLabel = labels.map(normalizeFieldLabel).find(label => entriesByLabel.has(label));
  return matchedLabel ? entriesByLabel.get(matchedLabel) : undefined;
}

export function normalizeDueDiligenceData(result = {}) {
  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  return {
    vesselName: readText(readLabeledValue(data, ['Vessel Name', 'Ship Name', 'VesselName', 'ShipName', 'Name'])),
    imo: normalizeImo(readLabeledValue(data, ['IMO Number', 'IMO', 'Numero IMO'])),
    mmsi: normalizeMmsi(readLabeledValue(data, ['MMSI'])),
    dwt: readPositiveNumber(readLabeledValue(data, ['DWT', 'Deadweight'])),
    flag: readText(readLabeledValue(data, ['Flag', 'Bandera', 'Country'])),
    vesselType: readText(readLabeledValue(data, ['Vessel Type', 'Ship Type', 'VesselType', 'ShipType', 'Type'])),
    builtYear: readYear(readLabeledValue(data, ['Year Built', 'Built Year', 'YearBuilt', 'Anio'])),
    grossTonnage: readPositiveNumber(readLabeledValue(data, ['Gross Tonnage', 'GrossTonnage', 'GT'])),
    loaMeters: readPositiveNumber(readLabeledValue(data, ['LOA Meters', 'LOA', 'Length', 'Length Overall'])),
    beamMeters: readPositiveNumber(readLabeledValue(data, ['Beam Meters', 'Beam', 'Breadth', 'Manga'])),
    draftMeters: readPositiveNumber(readLabeledValue(data, ['Draft', 'Draught', 'Draft Meters', 'Calado'])),
    callSign: readText(readLabeledValue(data, ['Call Sign', 'CallSign', 'Callsign'])),
    lastPort: readText(readLabeledValue(data, ['Last Port', 'LastPort', 'Last Port of Call', 'Previous Port'])),
    eta: readText(readLabeledValue(data, ['ETA', 'Estimated Time of Arrival', 'Arrival Time'])),
    destination: readText(readLabeledValue(data, ['Destination', 'Current Destination'])),
    navigationStatus: readText(readLabeledValue(data, ['Navigation Status', 'Navigational Status', 'Nav Status'])),
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
    body: JSON.stringify({ ...payload, externalOnly: true }),
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
  const rawData = result?.data && typeof result.data === 'object' ? result.data : result;
  const normalizedData = normalizeDueDiligenceData(result);
  return {
    ...result,
    rawData,
    data: normalizedData,
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
