import { getStore } from "@netlify/blobs";
import { getDatabase } from "netlify-database-client";
import { createRequire } from "module";
import { enrichDatalasticRadarVessels } from "./radar-enrichment.mjs";

// PR Trigger: Telemetry, cache, and budget table verified - 2026-08-14.
const DATALASTIC_BASE_URL = "https://api.datalastic.com/api/v0";
const TRACKING_TTL_MS = 5 * 60 * 1000;
const RADAR_TTL_MS = 10 * 60 * 1000;
const RADAR_SOFT_STALE_WINDOW_MS = 5 * 60 * 1000;
const PARTICULARS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRACKING_STALE_TTL_MS = 24 * 60 * 60 * 1000;
const RADAR_STALE_TTL_MS = 60 * 60 * 1000;
const PARTICULARS_STALE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_RADAR_RADIUS_NM = 10;
const MAX_RADAR_RADIUS_NM = 50;
const DEFAULT_MONTHLY_BUDGET = 1000;
const RADAR_COORDINATE_PRECISION = 3;

const memoryCache = new Map();
const inFlightRequests = new Map();
const consumptionMonitor = {
  startedAt: new Date().toISOString(),
  consumedCredits: 0,
  providerRequests: 0,
  cacheHits: 0,
  staleResponses: 0,
  budgetBlocks: 0,
  lastConsumedAt: null,
};

export class AisCoordinatorError extends Error {
  constructor(code, message, status = 500, details = undefined) {
    super(message);
    this.name = "AisCoordinatorError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function env(name) {
  return Netlify.env.get(name);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredTtl(name, minimum) {
  return Math.max(minimum, positiveInteger(env(name), minimum));
}

function getBudgetLimit() {
  return positiveInteger(
    env("DATALASTIC_MONTHLY_CREDIT_LIMIT") ?? env("DATALASTIC_BUDGET_LIMIT"),
    DEFAULT_MONTHLY_BUDGET,
  );
}

function getPeriodKey(date) {
  return date.toISOString().slice(0, 7);
}

function getConnectionString() {
  return env("DATABASE_URL") ?? env("NETLIFY_DATABASE_URL") ?? env("NETLIFY_DB_URL");
}

function cacheStore() {
  return getStore({ name: "datalastic-ais-cache", consistency: "strong" });
}

function budgetDatabase() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new AisCoordinatorError(
      "AIS_BUDGET_UNAVAILABLE",
      "AIS budget protection is unavailable",
      503,
    );
  }
  return getDatabase({ connectionString });
}

function getDatalasticApiKey() {
  const apiKey = env("DATALASTIC_API_KEY");
  if (!apiKey) {
    throw new AisCoordinatorError("AIS_PROVIDER_NOT_CONFIGURED", "Datalastic is not configured", 503);
  }
  return apiKey;
}

function normalizeImo(value) {
  const imo = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{7}$/.test(imo)) {
    throw new AisCoordinatorError("AIS_INVALID_IMO", "A valid 7-digit IMO is required", 400);
  }
  return imo;
}

function normalizeCoordinate(value, name, minimum, maximum) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
    throw new AisCoordinatorError(
      "AIS_INVALID_COORDINATES",
      `${name} must be between ${minimum} and ${maximum}`,
      400,
    );
  }
  return coordinate;
}

function normalizeRadius(value) {
  const radius = value === undefined || value === null || value === ""
    ? DEFAULT_RADAR_RADIUS_NM
    : Number(value);
  if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_RADAR_RADIUS_NM) {
    throw new AisCoordinatorError(
      "AIS_INVALID_RADIUS",
      `Radar radius must be greater than 0 and no more than ${MAX_RADAR_RADIUS_NM} nautical miles`,
      400,
    );
  }
  return Number(radius.toFixed(2));
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function textValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTelemetry(value) {
  const vessel = asRecord(value);
  return {
    uuid: textValue(vessel.uuid, vessel.id),
    name: textValue(vessel.name, vessel.vessel_name, vessel.ship_name),
    imo: textValue(vessel.imo, vessel.imo_number),
    mmsi: textValue(vessel.mmsi),
    flag: textValue(vessel.country_iso, vessel.flag, vessel.flag_iso),
    vesselType: textValue(vessel.type, vessel.vessel_type, vessel.ship_type),
    latitude: finiteNumber(vessel.lat, vessel.latitude),
    longitude: finiteNumber(vessel.lon, vessel.lng, vessel.longitude),
    speedKnots: finiteNumber(vessel.speed, vessel.sog, vessel.speed_knots),
    courseDegrees: finiteNumber(vessel.course, vessel.cog, vessel.course_degrees),
    headingDegrees: finiteNumber(vessel.heading, vessel.heading_degrees),
    navigationStatus: textValue(vessel.navigation_status, vessel.nav_status, vessel.navigational_status),
    // Calado instantáneo y calado máximo: entradas del motor de disponibilidad
    // operativa (lastre = calado actual / calado máximo). Sin ellos el radar no
    // permite distinguir un buque en lastre de uno comprometido con otra carga.
    draught: finiteNumber(vessel.draught, vessel.draught_average, vessel.draft),
    maxDraught: finiteNumber(vessel.draught_max, vessel.max_draft, vessel.summer_draft),
    destination: textValue(vessel.destination),
    destinationEta: textValue(vessel.eta, vessel.eta_UTC, vessel.eta_utc),
    positionTimestamp: textValue(
      vessel.last_position_UTC,
      vessel.last_position_utc,
      vessel.position_timestamp,
      vessel.timestamp,
    ),
  };
}

function normalizeLivePosition(payload) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const vessel = Object.keys(data).length > 0 ? data : root;
  const telemetry = normalizeTelemetry(vessel);
  if (!Number.isFinite(telemetry.latitude) || !Number.isFinite(telemetry.longitude)) {
    throw new AisCoordinatorError(
      "AIS_POSITION_UNAVAILABLE",
      "Datalastic returned no usable live position",
      502,
    );
  }
  return telemetry;
}

function normalizeRadarTraffic(payload) {
  const root = asRecord(payload);
  const data = root.data;
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data).vessels)
      ? asRecord(data).vessels
      : Array.isArray(root.vessels)
        ? root.vessels
        : [];
  return candidates
    .map(normalizeTelemetry)
    .filter((vessel) => Number.isFinite(vessel.latitude) && Number.isFinite(vessel.longitude));
}

function normalizeVesselParticulars(payload) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const vessel = Object.keys(data).length > 0 ? data : root;
  const particulars = {
    imoNumber: textValue(vessel.imo, vessel.imo_number),
    mmsi: textValue(vessel.mmsi),
    vesselName: textValue(vessel.name, vessel.vessel_name, vessel.ship_name),
    dwt: finiteNumber(vessel.deadweight, vessel.dwt),
    latitude: finiteNumber(vessel.lat, vessel.latitude),
    longitude: finiteNumber(vessel.lon, vessel.lng, vessel.longitude),
    vesselType: textValue(vessel.type_specific, vessel.type, vessel.vessel_type, vessel.ship_type),
    draftMeters: finiteNumber(vessel.draught_average, vessel.draught_max, vessel.draft, vessel.draught),
    flag: textValue(vessel.country_iso, vessel.flag_iso, vessel.flag, vessel.country_name),
    callSign: textValue(vessel.call_sign, vessel.callsign),
    yearBuilt: finiteNumber(vessel.year_built, vessel.built_year),
    grossTonnage: finiteNumber(vessel.gross_tonnage, vessel.gt),
    netTonnage: finiteNumber(vessel.net_tonnage, vessel.nt),
    loaMeters: finiteNumber(vessel.length, vessel.length_overall, vessel.loa),
    beamMeters: finiteNumber(vessel.breadth, vessel.beam),
    lastPort: textValue(vessel.last_port, vessel.last_port_name),
    eta: textValue(vessel.eta, vessel.estimated_time_of_arrival),
  };
  if (!particulars.imoNumber) {
    throw new AisCoordinatorError(
      "VESSEL_PARTICULARS_UNAVAILABLE",
      "Datalastic returned no usable vessel particulars",
      502,
    );
  }
  return particulars;
}

function cacheEnvelopeIsValid(envelope) {
  return envelope
    && typeof envelope === "object"
    && Number.isFinite(envelope.storedAt)
    && Number.isFinite(envelope.expiresAt)
    && Number.isFinite(envelope.staleUntil)
    && "value" in envelope;
}

function softStaleUntil(envelope) {
  return Number.isFinite(envelope?.softStaleUntil) ? envelope.softStaleUntil : envelope?.expiresAt;
}

async function readPersistentEnvelope(store, key) {
  try {
    const envelope = await store.get(key, { type: "json" });
    return cacheEnvelopeIsValid(envelope) ? envelope : null;
  } catch (error) {
    console.warn("[ais-coordinator] Shared cache read unavailable.", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function writePersistentEnvelope(store, key, envelope) {
  try {
    await store.setJSON(key, envelope);
  } catch (error) {
    console.warn("[ais-coordinator] Shared cache write unavailable.", error instanceof Error ? error.message : String(error));
  }
}

async function readCache(store, key, nowMs, { bypassMemory = false } = {}) {
  if (!bypassMemory) {
    const memoryEnvelope = memoryCache.get(key);
    if (cacheEnvelopeIsValid(memoryEnvelope) && memoryEnvelope.staleUntil > nowMs) {
      return memoryEnvelope;
    }
  }
  memoryCache.delete(key);
  const persistentEnvelope = await readPersistentEnvelope(store, key);
  if (!persistentEnvelope || persistentEnvelope.staleUntil <= nowMs) return null;
  memoryCache.set(key, persistentEnvelope);
  return persistentEnvelope;
}

function responseFromEnvelope(
  envelope,
  nowMs,
  cacheStatus,
  reason = null,
  budget = null,
  formatValue = (value) => ({ data: value }),
) {
  if (cacheStatus === "HIT") consumptionMonitor.cacheHits += 1;
  if (cacheStatus === "STALE") consumptionMonitor.staleResponses += 1;
  return {
    ...formatValue(envelope.value),
    meta: {
      source: "datalastic",
      cacheStatus,
      cacheAgeSeconds: Math.max(0, Math.floor((nowMs - envelope.storedAt) / 1000)),
      fetchedAt: new Date(envelope.storedAt).toISOString(),
      expiresAt: new Date(envelope.expiresAt).toISOString(),
      degraded: cacheStatus === "STALE",
      circuitBreaker: reason,
      budget,
    },
  };
}

function scheduleBackgroundRefresh(promise, scheduleRefresh, cacheKey) {
  const guardedPromise = promise.catch((error) => {
    console.warn(
      "[ais-coordinator] Background cache refresh failed.",
      { cacheKey, error: error instanceof Error ? error.message : String(error) },
    );
  });

  try {
    if (typeof scheduleRefresh === "function") {
      scheduleRefresh(guardedPromise);
      return;
    }
    const context = globalThis.Netlify?.context;
    if (typeof context?.waitUntil === "function") {
      context.waitUntil(guardedPromise);
      return;
    }
  } catch (error) {
    console.warn(
      "[ais-coordinator] Background refresh scheduling unavailable.",
      { cacheKey, error: error instanceof Error ? error.message : String(error) },
    );
  }

  void guardedPromise;
}

async function fetchDatalastic(path, parameters, fetchImpl) {
  const apiKey = getDatalasticApiKey();
  const baseUrl = String(env("DATALASTIC_API_BASE_URL") || DATALASTIC_BASE_URL).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/${path}`);
  url.searchParams.set("api-key", apiKey);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new AisCoordinatorError("AIS_PROVIDER_UNAVAILABLE", "Datalastic request failed", 502);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || asRecord(payload).meta?.success === false) {
    throw new AisCoordinatorError(
      "AIS_PROVIDER_ERROR",
      "Datalastic rejected the AIS request",
      response.status >= 400 && response.status < 500 ? 502 : 503,
    );
  }
  return payload;
}

function createBudgetGate() {
  return {
    async withRequestLock(cacheKey, operation) {
      const database = budgetDatabase();
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [cacheKey]);
        const result = await operation({
          async reserve(periodKey, limit) {
            await client.query(
              `INSERT INTO datalastic_credit_budget (period_key, used_credits)
               VALUES ($1, 0)
               ON CONFLICT (period_key) DO NOTHING`,
              [periodKey],
            );
            const reservation = await client.query(
              `UPDATE datalastic_credit_budget
               SET used_credits = used_credits + 1, updated_at = NOW()
               WHERE period_key = $1 AND used_credits < $2
               RETURNING used_credits`,
              [periodKey, limit],
            );
            const usedCredits = Number(reservation.rows[0]?.used_credits);
            return {
              allowed: Number.isFinite(usedCredits),
              usedCredits: Number.isFinite(usedCredits) ? usedCredits : limit,
              limit,
              period: periodKey,
            };
          },
          async release(periodKey) {
            await client.query(
              `UPDATE datalastic_credit_budget
               SET used_credits = GREATEST(used_credits - 1, 0), updated_at = NOW()
               WHERE period_key = $1`,
              [periodKey],
            );
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (error instanceof AisCoordinatorError) throw error;
        const databaseCode = typeof error?.code === "string" ? error.code : "UNKNOWN";
        console.error("[ais-coordinator] Budget database operation failed.", { code: databaseCode });
        throw new AisCoordinatorError(
          "AIS_BUDGET_UNAVAILABLE",
          "AIS budget protection is unavailable",
          503,
          { reason: databaseCode === "42P01" ? "BUDGET_TABLE_MISSING" : "DATABASE_ERROR" },
        );
      } finally {
        client.release();
      }
    },
  };
}

export function createAisCoordinator({
  fetchImpl = fetch,
  store = cacheStore(),
  budgetGate = createBudgetGate(),
  enrichRadarVessels = enrichDatalasticRadarVessels,
  now = () => Date.now(),
} = {}) {
  async function refresh({
    cacheKey,
    ttlMs,
    softStaleTtlMs,
    staleTtlMs,
    providerCall,
    normalize,
    formatValue,
    consumption = { module: "Core PRO", action: "Consulta API" },
  }, initialEnvelope) {
    if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);
    if (!initialEnvelope) getDatalasticApiKey();

    const request = budgetGate.withRequestLock(cacheKey, async (budgetSession) => {
      const lockedNow = now();
      const lockedEnvelope = await readCache(store, cacheKey, lockedNow, { bypassMemory: true });
      if (lockedEnvelope?.expiresAt > lockedNow) {
        return responseFromEnvelope(lockedEnvelope, lockedNow, "HIT", null, null, formatValue);
      }

      const periodKey = getPeriodKey(new Date(lockedNow));
      const budget = await budgetSession.reserve(periodKey, getBudgetLimit());
      if (!budget.allowed) {
        consumptionMonitor.budgetBlocks += 1;
        if (lockedEnvelope) {
          return responseFromEnvelope(lockedEnvelope, lockedNow, "STALE", "BUDGET_LIMIT", budget, formatValue);
        }
        throw new AisCoordinatorError(
          "AIS_BUDGET_EXCEEDED",
          "AIS credit safety threshold reached",
          429,
          budget,
        );
      }

      let providerSucceeded = false;
      try {
        consumptionMonitor.providerRequests += 1;
        const payload = await providerCall(fetchImpl);
        providerSucceeded = true;
        consumptionMonitor.consumedCredits += 1;
        consumptionMonitor.lastConsumedAt = new Date(now()).toISOString();
        console.info(`Crédito Datalastic consumido por [${consumption.module}]: [${consumption.action}]`);
        const value = await normalize(payload);
        const storedAt = now();
        const envelope = {
          storedAt,
          expiresAt: storedAt + ttlMs,
          softStaleUntil: storedAt + softStaleTtlMs,
          staleUntil: storedAt + staleTtlMs,
          value,
        };
        memoryCache.set(cacheKey, envelope);
        await writePersistentEnvelope(store, cacheKey, envelope);
        return responseFromEnvelope(envelope, storedAt, "MISS", null, budget, formatValue);
      } catch (error) {
        if (!providerSucceeded) await budgetSession.release(periodKey);
        if (lockedEnvelope) {
          return responseFromEnvelope(
            lockedEnvelope,
            now(),
            "STALE",
            providerSucceeded ? "INVALID_PROVIDER_RESPONSE" : "PROVIDER_FAILURE",
            budget,
            formatValue,
          );
        }
        throw error;
      }
    }).catch((error) => {
      if (initialEnvelope) {
        return responseFromEnvelope(initialEnvelope, now(), "STALE", "COORDINATOR_FAILURE", null, formatValue);
      }
      if (error instanceof AisCoordinatorError) throw error;
      throw new AisCoordinatorError(
        "AIS_COORDINATOR_UNAVAILABLE",
        "AIS coordinator is temporarily unavailable",
        503,
      );
    });

    inFlightRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  }

  async function execute({
    cacheKey,
    ttlMs,
    softStaleTtlMs = ttlMs,
    staleTtlMs,
    providerCall,
    normalize,
    formatValue = (value) => ({ data: value }),
    scheduleRefresh,
    consumption,
  }) {
    const initialNow = now();
    const initialEnvelope = await readCache(store, cacheKey, initialNow);
    if (initialEnvelope?.expiresAt > initialNow) {
      return responseFromEnvelope(initialEnvelope, initialNow, "HIT", null, null, formatValue);
    }

    const refreshOptions = {
      cacheKey,
      ttlMs,
      softStaleTtlMs,
      staleTtlMs,
      providerCall,
      normalize,
      formatValue,
      consumption,
    };
    if (initialEnvelope && softStaleUntil(initialEnvelope) > initialNow) {
      scheduleBackgroundRefresh(refresh(refreshOptions, initialEnvelope), scheduleRefresh, cacheKey);
      return responseFromEnvelope(initialEnvelope, initialNow, "STALE", "SOFT_STALE", null, formatValue);
    }

    return refresh(refreshOptions, initialEnvelope);
  }

  return {
    async getLivePosition(imoValue) {
      const imo = normalizeImo(imoValue);
      return execute({
        cacheKey: `tracking/imo-${imo}.json`,
        ttlMs: configuredTtl("DATALASTIC_TRACKING_CACHE_TTL_MS", TRACKING_TTL_MS),
        staleTtlMs: TRACKING_STALE_TTL_MS,
        providerCall: (activeFetch) => fetchDatalastic("vessel", { imo }, activeFetch),
        normalize: normalizeLivePosition,
        consumption: { module: "Tracking", action: "Consultar posición AIS en vivo" },
      });
    },

    async getRadarTraffic(latitudeValue, longitudeValue, radiusValue = DEFAULT_RADAR_RADIUS_NM, options = {}) {
      const latitude = normalizeCoordinate(latitudeValue, "Latitude", -90, 90);
      const longitude = normalizeCoordinate(longitudeValue, "Longitude", -180, 180);
      const radius = normalizeRadius(radiusValue);
      const zoneLatitude = Number(latitude.toFixed(RADAR_COORDINATE_PRECISION));
      const zoneLongitude = Number(longitude.toFixed(RADAR_COORDINATE_PRECISION));
      const radarTtlMs = configuredTtl("DATALASTIC_RADAR_CACHE_TTL_MS", RADAR_TTL_MS);
      try {
        return await execute({
          cacheKey: `radar/v2/${zoneLatitude}_${zoneLongitude}_${radius}nm.json`,
          ttlMs: radarTtlMs,
          softStaleTtlMs: radarTtlMs + RADAR_SOFT_STALE_WINDOW_MS,
          staleTtlMs: RADAR_STALE_TTL_MS,
          providerCall: (activeFetch) => fetchDatalastic("vessel_inradius", {
            lat: zoneLatitude,
            lon: zoneLongitude,
            radius,
          }, activeFetch),
          normalize: async (payload) => {
            const radarVessels = normalizeRadarTraffic(payload);
            try {
              const enriched = await enrichRadarVessels(radarVessels);
              return {
                data: enriched.vessels,
                sourceCounts: enriched.counts,
              };
            } catch (error) {
              console.warn(
                "[ais-coordinator] Neon enrichment unavailable; caching Datalastic snapshot.",
                error instanceof Error ? error.message : String(error),
              );
              return {
                data: radarVessels,
                sourceCounts: {
                  liveRadar: radarVessels.length,
                  technicalMatches: 0,
                },
              };
            }
          },
          formatValue: (value) => ({
            data: Array.isArray(value?.data) ? value.data : [],
            sourceCounts: value?.sourceCounts ?? { liveRadar: 0, technicalMatches: 0 },
          }),
          scheduleRefresh: options.scheduleRefresh,
          consumption: { module: "Tracking / Radar", action: "Ejecutar barrido AIS por radio" },
        });
      } catch (error) {
        if (
          error instanceof AisCoordinatorError &&
          ["AIS_BUDGET_EXCEEDED", "AIS_PROVIDER_NOT_CONFIGURED", "AIS_PROVIDER_ERROR", "AIS_PROVIDER_UNAVAILABLE"].includes(error.code)
        ) {
          console.warn(`[ais-coordinator] Datalastic unavailable (${error.code}); executing AISStream + Neon fallback...`);
          return fetchAisStreamAndNeonFallback({ lat: zoneLatitude, lon: zoneLongitude, radius });
        }
        throw error;
      }
    },

    async getVesselParticulars(imoValue) {
      const imo = normalizeImo(imoValue);
      return execute({
        cacheKey: `particulars/imo-${imo}.json`,
        ttlMs: configuredTtl("DATALASTIC_PARTICULARS_CACHE_TTL_MS", PARTICULARS_TTL_MS),
        staleTtlMs: PARTICULARS_STALE_TTL_MS,
        providerCall: (activeFetch) => fetchDatalastic("vessel_info", { imo }, activeFetch),
        normalize: normalizeVesselParticulars,
        consumption: { module: "Auditoría / Cálculo de Rutas", action: "Consultar ficha técnica por IMO" },
      });
    },
  };
}

let defaultCoordinator;

function coordinator() {
  defaultCoordinator ??= createAisCoordinator();
  return defaultCoordinator;
}

export async function getLivePosition(imo) {
  return coordinator().getLivePosition(imo);
}

export async function getRadarTraffic(lat, lon, radius = DEFAULT_RADAR_RADIUS_NM, options = {}) {
  return coordinator().getRadarTraffic(lat, lon, radius, options);
}

export async function getVesselParticulars(imo) {
  return coordinator().getVesselParticulars(imo);
}

export function getAisConsumptionSnapshot() {
  return {
    ...consumptionMonitor,
    activeRequests: inFlightRequests.size,
    cachedEntries: memoryCache.size,
  };
}

export async function getDatalasticCreditSnapshot() {
  const snapshot = getAisConsumptionSnapshot();
  const limit = getBudgetLimit();
  const period = getPeriodKey(new Date());

  try {
    const database = budgetDatabase();
    const result = await database.pool.query(
      `SELECT used_credits
       FROM datalastic_credit_budget
       WHERE period_key = $1
       LIMIT 1`,
      [period],
    );
    const usedCredits = Math.max(0, Number(result.rows[0]?.used_credits) || 0);
    return {
      ...snapshot,
      budget: {
        period,
        limit,
        usedCredits,
        remainingCredits: Math.max(0, limit - usedCredits),
      },
    };
  } catch {
    console.warn("[ais-coordinator] Datalastic credit snapshot unavailable.");
    return { ...snapshot, budget: null };
  }
}

export async function persistMerchantFleetInNeon(vessels, pool) {
  if (!Array.isArray(vessels) || vessels.length === 0 || !pool) return 0;

  const STRICT_NOISE_RE = /\b(fishing|pesquero|pesca|trawler|tug|tugboat|remolcador|remolque|pusher|passenger|cruise|ferry|pleasure|yacht|sailing|dredger|vts|mark|point|danger|buoy|boya|military|sar|rescue|pilot|workboat|other|unknown)\b/i;
  const STRICT_CARGO_RE = /\b(bulk|bulker|cargo|carguero|coaster|cabotaje|container|tanker|petrolero|quimiquero|heavy load|heavy lift|break bulk|breakbulk|ro-ro|roro|cement|cementero|clinker|mpp|mpv|mmpp|freighter|merchant)\b/i;

  let savedCount = 0;
  await Promise.all(vessels.map(async (ship) => {
    if (!ship || typeof ship !== "object") return;
    const rawType = String(ship.type || ship.vesselType || ship.vesselClass || ship.shipType || "").trim().toLowerCase();
    const numType = Number(ship.type || ship.shipType || ship.ShipType);

    // Categorical noise check
    if (STRICT_NOISE_RE.test(rawType)) return;

    // Numeric AIS check
    if (Number.isFinite(numType) && numType > 0) {
      if ((numType >= 20 && numType < 70) || numType >= 90) return;
    }

    // Cargo whitelist validation
    const isCargoType = STRICT_CARGO_RE.test(rawType) || (Number.isFinite(numType) && ((numType >= 70 && numType <= 79) || (numType >= 80 && numType <= 89)));

    const loa = Number(ship.loa || (ship.Dimension ? (Number(ship.Dimension.A) || 0) + (Number(ship.Dimension.B) || 0) : 0)) || 0;
    const beam = Number(ship.beam || (ship.Dimension ? (Number(ship.Dimension.C) || 0) + (Number(ship.Dimension.D) || 0) : 0)) || 0;
    const draught = Number(ship.draught || ship.draft || ship.MaximumStaticDraught || 0);

    let dwt = Number(ship.dwt || ship.DWT) || null;
    if ((!dwt || dwt <= 0) && loa > 0 && beam > 0 && draught > 0) {
      dwt = Math.round(loa * beam * draught * 0.72);
    }

    if (!isCargoType && (!dwt || dwt < 500)) return;

    const imoClean = String(ship.imo || ship.imo_number || "").replace(/\D/g, "");
    const mmsiClean = String(ship.mmsi || "").replace(/\D/g, "");
    const imoNum = Number(imoClean);

    // Filtra buques mercantes con imo válido (> 1000000)
    const hasValidImo = Number.isFinite(imoNum) && imoNum > 1000000 && imoClean.length === 7;

    const vesselName = String(ship.name || ship.vesselName || ship.vessel_name || (hasValidImo ? `IMO ${imoClean}` : (mmsiClean ? `MMSI ${mmsiClean}` : "COMMERCIAL VESSEL"))).trim().toUpperCase();
    const vesselType = String(ship.type || ship.vesselType || ship.vesselClass || "GENERAL CARGO").trim().toUpperCase();
    const lat = Number(ship.lat ?? ship.latitude);
    const lon = Number(ship.lon ?? ship.lng ?? ship.longitude);
    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
    const validLon = Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null;
    const speed = Number(ship.speed ?? ship.speedKnots ?? ship.sog ?? 0) || null;
    const draftMeters = Number(ship.draught ?? ship.draft ?? ship.draft_meters ?? 0) || null;
    const destination = String(ship.destination ?? ship.currentDestination ?? ship.current_destination ?? "").trim() || null;
    const validLoa = loa > 0 ? loa : null;
    const validBeam = beam > 0 ? beam : null;

    if (hasValidImo) {
      await pool.query(`
        INSERT INTO vessels_master (
          imo_number, vessel_name, vessel_type, dwt, mmsi, latitude, longitude,
          draft_meters, current_destination, service_speed_knots, loa_meters, beam_meters,
          process_status, audit_status, validation_status, fecha_ultima_actualizacion
        )
        VALUES ($1::integer, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'COMPLETED', 'VALIDATED', 'VALIDATED', NOW())
        ON CONFLICT (imo_number) DO UPDATE SET
          vessel_name = EXCLUDED.vessel_name,
          vessel_type = COALESCE(EXCLUDED.vessel_type, vessels_master.vessel_type),
          dwt = COALESCE(EXCLUDED.dwt, vessels_master.dwt),
          mmsi = COALESCE(EXCLUDED.mmsi, vessels_master.mmsi),
          latitude = COALESCE(EXCLUDED.latitude, vessels_master.latitude),
          longitude = COALESCE(EXCLUDED.longitude, vessels_master.longitude),
          draft_meters = COALESCE(EXCLUDED.draft_meters, vessels_master.draft_meters),
          current_destination = COALESCE(EXCLUDED.current_destination, vessels_master.current_destination),
          service_speed_knots = COALESCE(EXCLUDED.service_speed_knots, vessels_master.service_speed_knots),
          loa_meters = COALESCE(EXCLUDED.loa_meters, vessels_master.loa_meters),
          beam_meters = COALESCE(EXCLUDED.beam_meters, vessels_master.beam_meters),
          fecha_ultima_actualizacion = NOW()
      `, [imoNum, vesselName, vesselType, dwt, mmsiClean || null, validLat, validLon, draftMeters, destination, speed, validLoa, validBeam]);
      savedCount++;
    } else if (mmsiClean.length === 9) {
      await pool.query(`
        UPDATE vessels_master SET
          vessel_name = $1,
          vessel_type = COALESCE($2, vessel_type),
          dwt = COALESCE($3, dwt),
          latitude = COALESCE($4, latitude),
          longitude = COALESCE($5, longitude),
          draft_meters = COALESCE($6, draft_meters),
          current_destination = COALESCE($7, current_destination),
          service_speed_knots = COALESCE($8, service_speed_knots),
          loa_meters = COALESCE($9, loa_meters),
          beam_meters = COALESCE($10, beam_meters),
          fecha_ultima_actualizacion = NOW()
        WHERE mmsi = $11
      `, [vesselName, vesselType, dwt, validLat, validLon, draftMeters, destination, speed, validLoa, validBeam, mmsiClean]);
    }
  }));
  return savedCount;
}

export async function fetchAisStreamAndNeonFallback({ lat, lon, radius = DEFAULT_RADAR_RADIUS_NM } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AisCoordinatorError("AIS_INVALID_COORDINATES", "Valid coordinates are required for fallback", 400);
  }

  const radiusNm = Math.min(50, Math.max(1, Number(radius) || DEFAULT_RADAR_RADIUS_NM));
  const deltaLat = radiusNm / 60;
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const deltaLon = radiusNm / (60 * (Math.abs(cosLat) > 0.0001 ? Math.abs(cosLat) : 1));

  const minLat = Number((latitude - deltaLat).toFixed(4));
  const maxLat = Number((latitude + deltaLat).toFixed(4));
  const minLon = Number((longitude - deltaLon).toFixed(4));
  const maxLon = Number((longitude + deltaLon).toFixed(4));

  const apiKey = String(env("AISSTREAM_API_KEY") || env("AISTREAM_API_KEY") || process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY || "").trim();
  const capturedByMmsi = new Map();

  if (apiKey) {
    try {
      const require = createRequire(import.meta.url);
      const WebSocketClient = require("ws");
      const wsUrl = String(env("AISSTREAM_WS_URL") || process.env.AISSTREAM_WS_URL || "wss://stream.aisstream.io/v0/stream").trim();

      await new Promise((resolve) => {
        let ws = null;
        let timer = null;
        let closed = false;

        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (timer) clearTimeout(timer);
          try {
            if (ws?.terminate) ws.terminate();
            else ws?.close();
          } catch (_) {}
          resolve();
        };

        timer = setTimeout(cleanup, 3500);

        try {
          ws = new WebSocketClient(wsUrl);
          ws.on("open", () => {
            try {
              ws.send(JSON.stringify({
                APIKey: apiKey,
                BoundingBoxes: [[[minLat, minLon], [maxLat, maxLon]]],
                FilterMessageTypes: ["PositionReport", "ShipStaticData"],
              }));
            } catch (_) {
              cleanup();
            }
          });

          ws.on("message", (raw) => {
            try {
              const data = JSON.parse(String(raw));
              if (!data) return;
              const meta = data.MetaData || data.metadata || {};
              const msg = data.Message || data.message || {};
              const pos = msg.PositionReport || msg.StandardClassBPositionReport || msg.ExtendedClassBPositionReport || {};
              const staticData = msg.ShipStaticData || {};

              const mmsi = String(meta.MMSI || pos.UserID || staticData.UserID || "").trim();
              if (!mmsi) return;

              let vessel = capturedByMmsi.get(mmsi);
              if (!vessel) {
                vessel = { mmsi };
                capturedByMmsi.set(mmsi, vessel);
              }

              if (meta.ShipName) vessel.name = String(meta.ShipName).trim();
              if (Number.isFinite(Number(pos.Latitude ?? meta.latitude))) {
                vessel.latitude = Number(pos.Latitude ?? meta.latitude);
              }
              if (Number.isFinite(Number(pos.Longitude ?? meta.longitude))) {
                vessel.longitude = Number(pos.Longitude ?? meta.longitude);
              }
              if (Number.isFinite(Number(pos.Sog))) vessel.speed = Number(pos.Sog);
              if (Number.isFinite(Number(pos.Cog))) vessel.course = Number(pos.Cog);
              if (Number.isFinite(Number(pos.TrueHeading))) vessel.heading = Number(pos.TrueHeading);
              if (pos.NavigationalStatus !== undefined) vessel.navigationalStatus = pos.NavigationalStatus;
              if (meta.time_utc) vessel.positionTimestamp = String(meta.time_utc);

              if (staticData.Name) vessel.name = String(staticData.Name).trim();
              if (staticData.ImoNumber && Number(staticData.ImoNumber) > 0) {
                vessel.imo = String(staticData.ImoNumber);
              }
              if (staticData.Type !== undefined) vessel.shipType = Number(staticData.Type);
              if (staticData.Destination) vessel.destination = String(staticData.Destination).trim();
              const draft = Number(staticData.MaximumStaticDraught);
              if (Number.isFinite(draft) && draft > 0) {
                vessel.draught = draft > 25 ? Math.round((draft / 10) * 100) / 100 : draft;
              }
              if (staticData.Dimension) {
                const dim = staticData.Dimension;
                const loa = (Number(dim.A) || 0) + (Number(dim.B) || 0);
                const beam = (Number(dim.C) || 0) + (Number(dim.D) || 0);
                if (loa > 0) vessel.loa = loa;
                if (beam > 0) vessel.beam = beam;
              }
            } catch (_) {}
          });

          ws.on("error", () => cleanup());
          ws.on("close", () => cleanup());
        } catch (_) {
          cleanup();
        }
      });
    } catch (wsErr) {
      console.warn("[ais-coordinator] AISStream WebSocket fallback error:", wsErr);
    }
  } else {
    console.warn("[ais-coordinator] AISStream API key not configured; proceeding with Neon vessels_master backing.");
  }

  let dbRows = [];
  const connStr = getConnectionString();
  if (connStr) {
    try {
      const db = getDatabase({ connectionString: connStr });
      const pool = db.pool;

      const capturedImos = [];
      const capturedMmsis = [];
      for (const v of capturedByMmsi.values()) {
        if (v.imo && /^\d{7}$/.test(String(v.imo))) capturedImos.push(Number(v.imo));
        if (v.mmsi && /^\d{9}$/.test(String(v.mmsi))) capturedMmsis.push(String(v.mmsi));
      }

      const queryRes = await pool.query(`
        SELECT imo_number, mmsi, vessel_name, vessel_type, dwt, draft_meters, loa_meters, beam_meters,
               latitude, longitude, current_destination, service_speed_knots
        FROM vessels_master
        WHERE (latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4)
           OR (imo_number = ANY($5::integer[]))
           OR (mmsi = ANY($6::text[]))
      `, [minLat, maxLat, minLon, maxLon, capturedImos, capturedMmsis]);

      dbRows = Array.isArray(queryRes.rows) ? queryRes.rows : [];
    } catch (dbErr) {
      console.warn("[ais-coordinator] Error querying vessels_master in fallback:", dbErr);
    }
  }

  const dbByImo = new Map();
  const dbByMmsi = new Map();
  for (const row of dbRows) {
    if (row.imo_number) dbByImo.set(String(row.imo_number), row);
    if (row.mmsi) dbByMmsi.set(String(row.mmsi), row);
  }

  const finalVessels = [];
  const processedKeys = new Set();

  for (const v of capturedByMmsi.values()) {
    const imoStr = v.imo ? String(v.imo) : "";
    const mmsiStr = v.mmsi ? String(v.mmsi) : "";
    const dbMatch = (imoStr && dbByImo.get(imoStr)) || (mmsiStr && dbByMmsi.get(mmsiStr)) || null;

    const resolvedImo = imoStr || (dbMatch?.imo_number ? String(dbMatch.imo_number) : null);
    const resolvedMmsi = mmsiStr || (dbMatch?.mmsi ? String(dbMatch.mmsi) : null);
    const key = resolvedImo ? `imo:${resolvedImo}` : `mmsi:${resolvedMmsi}`;
    processedKeys.add(key);

    const name = v.name || dbMatch?.vessel_name || (resolvedImo ? `IMO ${resolvedImo}` : `MMSI ${resolvedMmsi}`);
    const vesselType = dbMatch?.vessel_type || (v.shipType ? `CARGO (${v.shipType})` : "GENERAL CARGO");
    const loa = v.loa || Number(dbMatch?.loa_meters) || null;
    const beam = v.beam || Number(dbMatch?.beam_meters) || null;
    const draught = v.draught || null;
    const maxDraft = Number(dbMatch?.draft_meters) || null;

    let dwt = Number(dbMatch?.dwt) || null;
    if ((!dwt || dwt <= 0) && loa > 0 && beam > 0 && draught > 0) {
      dwt = Math.round(loa * beam * draught * 0.72);
    }

    const speed = v.speed !== undefined ? v.speed : (Number(dbMatch?.service_speed_knots) || 0);
    const destination = v.destination || dbMatch?.current_destination || "";

    let ratioCalado = null;
    if (draught > 0 && maxDraft > 0) {
      ratioCalado = Number((draught / maxDraft).toFixed(3));
    }
    const forOrdersRegex = /FOR ORDERS|F\/O|OPEN|ORDERS|TBN/i;
    const isSpotOpen = ratioCalado !== null && ratioCalado > 0 && ratioCalado <= 0.68 && (forOrdersRegex.test(destination) || speed <= 6.5);

    const latVal = Number.isFinite(Number(v.latitude)) ? Number(v.latitude) : Number(dbMatch?.latitude);
    const lonVal = Number.isFinite(Number(v.longitude)) ? Number(v.longitude) : Number(dbMatch?.longitude);

    finalVessels.push({
      uuid: resolvedImo ? `imo-${resolvedImo}` : `mmsi-${resolvedMmsi}`,
      id: resolvedImo ? `imo-${resolvedImo}` : `mmsi-${resolvedMmsi}`,
      name,
      vesselName: name,
      vessel_name: name,
      ShipName: name,
      imo: resolvedImo,
      IMO: resolvedImo,
      imo_number: resolvedImo,
      mmsi: resolvedMmsi,
      MMSI: resolvedMmsi,
      vesselType,
      type: vesselType,
      dwt,
      DWT: dwt,
      grossTonnage: dwt ? Math.round(dwt * 0.62) : null,
      latitude: latVal,
      lat: latVal,
      longitude: lonVal,
      lon: lonVal,
      lng: lonVal,
      speed,
      speedKnots: speed,
      course: v.course ?? 0,
      heading: v.heading ?? 0,
      navigationStatus: v.navigationalStatus !== undefined ? String(v.navigationalStatus) : null,
      draught,
      draft: draught,
      maxDraught: maxDraft,
      draft_meters: maxDraft,
      loa,
      beam,
      destination,
      positionTimestamp: v.positionTimestamp || new Date().toISOString(),
      ratioCalado,
      isSpotOpen,
      availability: isSpotOpen ? "SPOT OPEN" : (ratioCalado && ratioCalado > 0.85 ? "LADEN" : "COMMITTED"),
      loadState: isSpotOpen ? "BALLAST" : "LADEN",
      source: "aisstream-live",
      sourceProvenance: "AISStream + Neon DB Fallback",
      MetaData: {
        ShipName: name,
        vesselName: name,
        IMO: resolvedImo,
        MMSI: resolvedMmsi,
        latitude: latVal,
        longitude: lonVal,
        speed,
        dwt,
        draft: draught,
        maxDraft,
        isSpotOpen,
        availability: isSpotOpen ? "SPOT OPEN" : undefined,
      },
    });
  }

  for (const row of dbRows) {
    const imoStr = row.imo_number ? String(row.imo_number) : "";
    const mmsiStr = row.mmsi ? String(row.mmsi) : "";
    const keyImo = imoStr ? `imo:${imoStr}` : "";
    const keyMmsi = mmsiStr ? `mmsi:${mmsiStr}` : "";
    if ((keyImo && processedKeys.has(keyImo)) || (keyMmsi && processedKeys.has(keyMmsi))) {
      continue;
    }
    const rowLat = Number(row.latitude);
    const rowLon = Number(row.longitude);
    if (!Number.isFinite(rowLat) || !Number.isFinite(rowLon)) continue;
    if (rowLat < minLat || rowLat > maxLat || rowLon < minLon || rowLon > maxLon) continue;

    const key = keyImo || keyMmsi;
    if (key) processedKeys.add(key);

    const name = row.vessel_name || (imoStr ? `IMO ${imoStr}` : `MMSI ${mmsiStr}`);
    const maxDraft = Number(row.draft_meters) || null;
    const dwt = Number(row.dwt) || null;
    const speed = Number(row.service_speed_knots) || 0;
    const destination = row.current_destination || "";

    finalVessels.push({
      uuid: imoStr ? `imo-${imoStr}` : `mmsi-${mmsiStr}`,
      id: imoStr ? `imo-${imoStr}` : `mmsi-${mmsiStr}`,
      name,
      vesselName: name,
      vessel_name: name,
      ShipName: name,
      imo: imoStr || null,
      IMO: imoStr || null,
      imo_number: imoStr || null,
      mmsi: mmsiStr || null,
      MMSI: mmsiStr || null,
      vesselType: row.vessel_type || "GENERAL CARGO",
      type: row.vessel_type || "GENERAL CARGO",
      dwt,
      DWT: dwt,
      grossTonnage: dwt ? Math.round(dwt * 0.62) : null,
      latitude: rowLat,
      lat: rowLat,
      longitude: rowLon,
      lon: rowLon,
      lng: rowLon,
      speed,
      speedKnots: speed,
      course: 0,
      heading: 0,
      draught: maxDraft ? Number((maxDraft * 0.55).toFixed(1)) : null,
      draft: maxDraft ? Number((maxDraft * 0.55).toFixed(1)) : null,
      maxDraught: maxDraft,
      draft_meters: maxDraft,
      loa: Number(row.loa_meters) || null,
      beam: Number(row.beam_meters) || null,
      destination,
      positionTimestamp: new Date().toISOString(),
      isSpotOpen: true,
      availability: "SPOT OPEN",
      loadState: "BALLAST",
      source: "neon-vessels-master",
      sourceProvenance: "Neon DB Master (Radar Backing)",
      MetaData: {
        ShipName: name,
        vesselName: name,
        IMO: imoStr || null,
        MMSI: mmsiStr || null,
        latitude: rowLat,
        longitude: rowLon,
        speed,
        dwt,
        maxDraft,
        isSpotOpen: true,
        availability: "SPOT OPEN",
      },
    });
  }

  return {
    success: true,
    data: finalVessels,
    vessels: finalVessels,
    sourceCounts: {
      liveRadar: finalVessels.length,
      technicalMatches: dbRows.length,
    },
    source: "aisstream-neon-fallback",
  };
}
