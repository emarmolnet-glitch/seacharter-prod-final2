import { getStore } from "@netlify/blobs";
import { getDatabase } from "netlify-database-client";
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
      return execute({
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
