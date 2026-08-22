const DEFAULT_DATALASTIC_BASE_URL = "https://api.datalastic.com/api/v0";

type UnknownRecord = Record<string, unknown>;

export interface DatalasticPortRecord {
  uuid: string;
  portName: string;
  officialLabel: string;
  countryCode: string;
  countryName: string;
  unlocode: string;
  portType: string;
  latitude: number;
  longitude: number;
  maxOperationalDraftMeters: number | null;
  draftSourceField: string | null;
  source: "DATALASTIC";
}

export class DatalasticPortError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "DatalasticPortError";
    this.status = status;
  }
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function environmentValue(name: string) {
  return globalThis.Netlify?.env.get(name) ?? process.env[name];
}

function getApiKey() {
  const apiKey = environmentValue("DATALASTIC_API_KEY");
  if (!apiKey) throw new DatalasticPortError("La integración de Datalastic no está configurada.", 503);
  return apiKey;
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
    value = match?.[0];
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function metersFromValue(value: unknown, fieldName: string): number | null {
  const record = asRecord(value);
  const rawValue = Object.keys(record).length
    ? record.value ?? record.meters ?? record.metres ?? record.depth ?? record.draft ?? record.draught
    : value;
  const number = positiveNumber(rawValue);
  if (number === null) return null;
  const unit = cleanText(record.unit ?? record.units).toLowerCase();
  if (unit.includes("ft") || unit.includes("feet") || /(?:_ft|feet)$/.test(fieldName)) return number * 0.3048;
  return number;
}

const DRAFT_FIELD_PRIORITY = [
  "max_operational_draft", "maximum_operational_draft", "operational_draft_max",
  "max_draft", "maximum_draft", "draft_max", "max_draught", "maximum_draught", "draught_max",
  "max_depth", "maximum_depth", "depth_max", "cargo_depth", "channel_depth", "depth",
];

export function extractMaxOperationalDraft(value: unknown) {
  const matches: Array<{ field: string; meters: number; priority: number }> = [];

  const visit = (current: unknown, path = "") => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    const record = asRecord(current);
    Object.entries(record).forEach(([key, item]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const priority = DRAFT_FIELD_PRIORITY.indexOf(normalizedKey);
      if (priority >= 0) {
        const meters = metersFromValue(item, normalizedKey);
        if (meters !== null) matches.push({ field: path ? `${path}.${key}` : key, meters, priority });
      }
      if (item && typeof item === "object") visit(item, path ? `${path}.${key}` : key);
    });
  };

  visit(value);
  matches.sort((left, right) => left.priority - right.priority || right.meters - left.meters);
  const match = matches[0];
  return match ? { meters: Number(match.meters.toFixed(3)), field: match.field } : { meters: null, field: null };
}

export function normalizeDatalasticPort(value: unknown): DatalasticPortRecord | null {
  const record = asRecord(value);
  const portName = cleanText(record.port_name ?? record.name);
  const countryCode = cleanText(record.country_iso ?? record.country_code).toUpperCase();
  const latitude = Number(record.lat ?? record.latitude);
  const longitude = Number(record.lon ?? record.lng ?? record.longitude);
  if (!portName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const draft = extractMaxOperationalDraft(record);
  return {
    uuid: cleanText(record.uuid),
    portName,
    officialLabel: `${portName} (${countryCode || "INT"})`,
    countryCode,
    countryName: cleanText(record.country_name),
    unlocode: cleanText(record.unlocode).toUpperCase(),
    portType: cleanText(record.port_type),
    latitude,
    longitude,
    maxOperationalDraftMeters: draft.meters,
    draftSourceField: draft.field,
    source: "DATALASTIC",
  };
}

async function requestDatalastic(path: string, parameters: Record<string, string>) {
  const baseUrl = cleanText(environmentValue("DATALASTIC_API_BASE_URL") || DEFAULT_DATALASTIC_BASE_URL).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/${path}`);
  url.searchParams.set("api-key", getApiKey());
  Object.entries(parameters).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new DatalasticPortError("No fue posible conectar con Datalastic.", 502);
  }

  const payload = await response.json().catch(() => null);
  const meta = asRecord(asRecord(payload).meta);
  if (!response.ok || meta.success === false) {
    throw new DatalasticPortError("Datalastic rechazó la consulta de puertos.", response.status >= 500 ? 503 : 502);
  }
  return asRecord(payload).data;
}

export async function findDatalasticPorts(query: string, limit = 12) {
  const data = await requestDatalastic("port_find", { name: query, fuzzy: "1" });
  return (Array.isArray(data) ? data : [])
    .map(normalizeDatalasticPort)
    .filter((port): port is DatalasticPortRecord => Boolean(port))
    .slice(0, Math.max(1, Math.min(20, limit)));
}

export async function getDatalasticPort(options: { uuid?: string; unlocode?: string; name?: string }) {
  let uuid = cleanText(options.uuid);
  let unlocode = cleanText(options.unlocode).toUpperCase();
  if (!uuid && !unlocode && options.name) {
    const matches = await findDatalasticPorts(options.name, 1);
    uuid = matches[0]?.uuid || "";
    unlocode = matches[0]?.unlocode || "";
  }
  if (!uuid && !unlocode) return null;
  const data = await requestDatalastic("port", uuid ? { uuid } : { unlocode });
  return normalizeDatalasticPort(data);
}
