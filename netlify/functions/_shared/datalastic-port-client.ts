const DEFAULT_DATALASTIC_BASE_URL = "https://api.datalastic.com/api/v0";
const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
export const NOMINATIM_USER_AGENT = "SeaCharterCorePRO/1.0";

type UnknownRecord = Record<string, unknown>;

export type GeoSource = "DATALASTIC" | "NOMINATIM" | "NEON_H16";

export interface GeoResolutionRecord {
  lat: number;
  lon: number;
  displayName: string;
  source: GeoSource;
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
  wpiIndex?: number | null;
  channelDraftLowM?: number | null;
  channelDraftHighM?: number | null;
  berthDraftM?: number | null;
  tidalRangeM?: number | null;
  tidalWindowRequired?: boolean | null;
  waterDensity?: number | null;
  gearedVesselRequired?: boolean | null;
  h16Sheet?: unknown;
}

export type DatalasticPortRecord = GeoResolutionRecord;

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

export function normalizeDatalasticPort(value: unknown): GeoResolutionRecord | null {
  const record = asRecord(value);
  const portName = cleanText(record.port_name ?? record.name);
  const countryCode = cleanText(record.country_iso ?? record.country_code).toUpperCase();
  const latitude = Number(record.lat ?? record.latitude);
  const longitude = Number(record.lon ?? record.lng ?? record.longitude);
  if (!portName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const draft = extractMaxOperationalDraft(record);
  const officialLabel = cleanText(record.official_label ?? record.officialLabel) || `${portName} (${countryCode || "INT"})`;
  const displayName = cleanText(record.display_name ?? record.displayName) || officialLabel;

  return {
    uuid: cleanText(record.uuid),
    portName,
    officialLabel,
    countryCode,
    countryName: cleanText(record.country_name),
    unlocode: cleanText(record.unlocode).toUpperCase(),
    portType: cleanText(record.port_type) || "port",
    latitude,
    longitude,
    maxOperationalDraftMeters: draft.meters,
    draftSourceField: draft.field,
    lat: latitude,
    lon: longitude,
    displayName,
    source: "DATALASTIC",
  };
}

export function normalizeNominatimLocation(value: unknown): GeoResolutionRecord | null {
  const record = asRecord(value);
  const lat = Number(record.lat ?? record.latitude);
  const lon = Number(record.lon ?? record.lng ?? record.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const displayName = cleanText(record.display_name ?? record.displayName ?? record.name);
  if (!displayName) return null;

  const address = asRecord(record.address);
  const countryCode = cleanText(address.country_code ?? record.country_code ?? record.countryCode).toUpperCase();
  const countryName = cleanText(address.country ?? record.country ?? record.countryName);

  const rawName = cleanText(record.name ?? address.city ?? address.town ?? address.port ?? address.harbour ?? displayName.split(",")[0]);
  const portName = rawName || displayName.split(",")[0].trim() || displayName;
  const officialLabel = portName && countryCode ? `${portName} (${countryCode})` : displayName;
  const portType = cleanText(record.type ?? record.class ?? "location") || "location";

  return {
    uuid: cleanText(record.place_id ? `osm-${record.place_id}` : record.uuid),
    portName,
    officialLabel,
    countryCode,
    countryName,
    unlocode: cleanText(record.unlocode).toUpperCase(),
    portType,
    latitude: lat,
    longitude: lon,
    maxOperationalDraftMeters: null,
    draftSourceField: null,
    lat,
    lon,
    displayName,
    source: "NOMINATIM",
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
  } catch (error) {
    throw new DatalasticPortError(
      `No fue posible conectar con Datalastic: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }

  const payload = await response.json().catch(() => null);
  const meta = asRecord(asRecord(payload).meta);
  if (!response.ok || meta.success === false) {
    const errorMsg = cleanText(meta.message || meta.error) || "Datalastic rechazó la consulta de puertos.";
    const status = response.status === 402 || meta.status === 402
      ? 402
      : response.status >= 500
        ? 503
        : 502;
    throw new DatalasticPortError(errorMsg, status);
  }
  return asRecord(payload).data;
}

export async function findDatalasticPorts(query: string, limit = 12): Promise<GeoResolutionRecord[]> {
  const data = await requestDatalastic("port_find", { name: query, fuzzy: "1" });
  return (Array.isArray(data) ? data : [])
    .map(normalizeDatalasticPort)
    .filter((port): port is GeoResolutionRecord => Boolean(port))
    .slice(0, Math.max(1, Math.min(20, limit)));
}

export async function findNominatimLocations(query: string, limit = 12): Promise<GeoResolutionRecord[]> {
  const baseUrl = cleanText(environmentValue("NOMINATIM_API_BASE_URL") || DEFAULT_NOMINATIM_BASE_URL).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(Math.max(1, Math.min(20, limit))));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT,
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new Error(`No fue posible conectar con Nominatim: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    throw new Error(`Nominatim respondió con error HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => []);
  return (Array.isArray(payload) ? payload : [])
    .map(normalizeNominatimLocation)
    .filter((loc): loc is GeoResolutionRecord => Boolean(loc))
    .slice(0, Math.max(1, Math.min(20, limit)));
}

async function getNeonPool() {
  const globalMock = (globalThis as unknown as { __mockDbPool?: unknown }).__mockDbPool;
  if (globalMock) return globalMock as { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  try {
    const { getPool } = await import("../../../db/index.js");
    return getPool();
  } catch (error) {
    console.warn("[geo-resolver] Neon DB pool no disponible:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function normalizeNeonPort(value: unknown): GeoResolutionRecord | null {
  const record = asRecord(value);
  const portName = cleanText(record.port_name ?? record.portName ?? record.name);
  const lat = Number(record.lat ?? record.latitude);
  const lon = Number(record.lon ?? record.lng ?? record.longitude);
  if (!portName || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const countryCode = cleanText(record.country_code ?? record.countryCode).toUpperCase();
  const unlocode = cleanText(record.unlocode).toUpperCase();
  const officialLabel = countryCode ? `${portName} (${countryCode})` : portName;
  const displayName = cleanText(record.display_name ?? record.displayName) || officialLabel;

  const maxDraft = positiveNumber(record.berth_draft_m ?? record.channel_draft_high_m ?? record.channel_draft_low_m);
  const draftSource = record.berth_draft_m
    ? "berth_draft_m"
    : record.channel_draft_high_m
      ? "channel_draft_high_m"
      : record.channel_draft_low_m
        ? "channel_draft_low_m"
        : null;

  const wpiIndex = record.wpi_index !== null && record.wpi_index !== undefined ? Number(record.wpi_index) : null;

  return {
    uuid: cleanText(record.uuid) || unlocode || (wpiIndex ? `wpi-${wpiIndex}` : `neon-${portName.toLowerCase().replace(/\s+/g, "-")}`),
    portName,
    officialLabel,
    countryCode,
    countryName: cleanText(record.country_name ?? record.countryName),
    unlocode,
    portType: "port",
    latitude: lat,
    longitude: lon,
    maxOperationalDraftMeters: maxDraft !== null ? Number(maxDraft.toFixed(3)) : null,
    draftSourceField: draftSource,
    lat,
    lon,
    displayName,
    source: "NEON_H16",
    wpiIndex,
    channelDraftLowM: record.channel_draft_low_m !== null && record.channel_draft_low_m !== undefined ? Number(record.channel_draft_low_m) : null,
    channelDraftHighM: record.channel_draft_high_m !== null && record.channel_draft_high_m !== undefined ? Number(record.channel_draft_high_m) : null,
    berthDraftM: record.berth_draft_m !== null && record.berth_draft_m !== undefined ? Number(record.berth_draft_m) : null,
    tidalRangeM: record.tidal_range_m !== null && record.tidal_range_m !== undefined ? Number(record.tidal_range_m) : null,
    tidalWindowRequired: typeof record.tidal_window_required === "boolean" ? record.tidal_window_required : null,
    waterDensity: record.water_density !== null && record.water_density !== undefined ? Number(record.water_density) : null,
    gearedVesselRequired: typeof record.geared_vessel_required === "boolean" ? record.geared_vessel_required : null,
    h16Sheet: record.h16_sheet ?? record.h16Sheet ?? null,
  };
}

export async function findNeonPorts(query: string, limit = 12): Promise<GeoResolutionRecord[]> {
  const trimmed = cleanText(query);
  if (trimmed.length < 2) return [];

  const pool = await getNeonPool();
  if (!pool) return [];

  try {
    const sql = `
      SELECT wpi_index, unlocode, port_name, country_code, lat, lon,
             channel_draft_low_m, channel_draft_high_m, berth_draft_m,
             tidal_range_m, tidal_window_required, water_density,
             geared_vessel_required, source_payload->'h16_port_sheet' AS h16_sheet
      FROM ports_master
      WHERE LOWER(port_name) LIKE LOWER($1)
         OR LOWER(COALESCE(unlocode, '')) = LOWER($2)
      ORDER BY
        CASE WHEN LOWER(port_name) = LOWER($2) THEN 0 ELSE 1 END,
        priority_tier ASC,
        port_name ASC
      LIMIT $3;
    `;
    const searchPattern = `%${trimmed}%`;
    const exactQuery = trimmed;
    const safeLimit = Math.max(1, Math.min(50, limit));

    const result = await pool.query(sql, [searchPattern, exactQuery, safeLimit]);
    return ((result as { rows?: unknown[] })?.rows || [])
      .map(normalizeNeonPort)
      .filter((port): port is GeoResolutionRecord => Boolean(port));
  } catch (error) {
    console.warn(
      `[geo-resolver] Falló la consulta a Neon ports_master para "${trimmed}":`,
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

export async function autoLearnPortInNeon(ports: GeoResolutionRecord[]): Promise<boolean> {
  const candidate = (Array.isArray(ports) ? ports : []).find((p) => (
    cleanText(p?.portName) &&
    cleanText(p?.countryCode) &&
    Number.isFinite(Number(p?.lat ?? p?.latitude)) &&
    Number.isFinite(Number(p?.lon ?? p?.longitude))
  ));
  if (!candidate) return false;

  const pool = await getNeonPool();
  if (!pool) return false;

  const portName = cleanText(candidate.portName);
  const countryCode = cleanText(candidate.countryCode).toUpperCase();
  const lat = Number(candidate.lat ?? candidate.latitude);
  const lon = Number(candidate.lon ?? candidate.longitude);

  const payload = JSON.stringify({
    auto_learned_at: new Date().toISOString(),
    source: candidate.source || "NOMINATIM",
    uuid: candidate.uuid || null,
    display_name: candidate.displayName || candidate.officialLabel || null,
    unlocode: candidate.unlocode || null,
  });

  const sql = `
    INSERT INTO ports_master (
      port_name, country_code, port_type, lat, lon,
      priority_tier, process_status, audit_status, source_payload, fecha_ultima_actualizacion
    )
    SELECT $1, $2, 'AUTO_LEARNED', $3, $4, 1, 'PENDING', 'AUTO_LEARNED', $5::jsonb, NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM ports_master
      WHERE LOWER(port_name) = LOWER($1) AND country_code = $2
    );
  `;

  try {
    await pool.query(sql, [portName, countryCode, lat, lon, payload]);
    return true;
  } catch (error) {
    console.warn(
      `[geo-resolver] No se pudo auto-aprender el puerto "${portName}" (${countryCode}) en ports_master:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function resolvePortsWithFailover(query: string, limit = 12): Promise<GeoResolutionRecord[]> {
  const trimmed = cleanText(query);
  if (trimmed.length < 2) return [];

  // Prioridad 1: Neon PostgreSQL (tabla ports_master alimentada por Hija 16)
  try {
    const neonResults = await findNeonPorts(trimmed, limit);
    if (neonResults.length > 0) {
      return neonResults;
    }
    console.warn(`[geo-resolver] Neon ports_master devolvió 0 resultados para "${trimmed}". Conmutando automáticamente a Nominatim.`);
  } catch (error) {
    console.warn(
      `[geo-resolver] Error consultando Neon ports_master para "${trimmed}" (${error instanceof Error ? error.message : String(error)}). Conmutando a Nominatim.`,
    );
  }

  // Prioridad 2 (Fallback): Nominatim (OpenStreetMap) para localidades interiores o sin registro portuario
  try {
    const nominatimResults = await findNominatimLocations(trimmed, limit);
    if (nominatimResults.length > 0) {
      try {
        await autoLearnPortInNeon(nominatimResults);
      } catch (learnErr) {
        console.warn("[geo-resolver] Error no bloqueante en autoLearnPortInNeon:", learnErr);
      }
    }
    return nominatimResults;
  } catch (osmError) {
    console.error(
      `[geo-resolver] Falló la conmutación a Nominatim para "${trimmed}":`,
      osmError instanceof Error ? osmError.message : String(osmError),
    );
    return [];
  }
}

export const resolveGeographicPoints = resolvePortsWithFailover;
export const resolveGeographicLocation = resolvePortsWithFailover;

export async function getDatalasticPort(options: { uuid?: string; unlocode?: string; name?: string }): Promise<GeoResolutionRecord | null> {
  let uuid = cleanText(options.uuid);
  let unlocode = cleanText(options.unlocode).toUpperCase();
  if (!uuid && !unlocode && options.name) {
    const matches = await resolvePortsWithFailover(options.name, 1);
    uuid = matches[0]?.uuid || "";
    unlocode = matches[0]?.unlocode || "";
    if (matches[0] && (!uuid || uuid.startsWith("osm-") || matches[0].source === "NEON_H16")) {
      return matches[0];
    }
  }
  if (!uuid && !unlocode) return null;
  try {
    const data = await requestDatalastic("port", uuid ? { uuid } : { unlocode });
    return normalizeDatalasticPort(data);
  } catch (error) {
    if (options.name) {
      const matches = await findNominatimLocations(options.name, 1);
      return matches[0] || null;
    }
    throw error;
  }
}
