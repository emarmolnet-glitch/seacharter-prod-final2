import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { appConfig } from "../../db/schema.js";
import { handleGetVessels } from "./get-vessels.js";
import { parseRequestedTaxonomies } from "./ais-taxonomy.js";

const SCAN_STATUS_KEY = "scan_status";
const SCAN_STATUS_RUNNING = "RUNNING";
const SCAN_STATUS_COMPLETE = "COMPLETE";
const SCAN_STATUS_ERROR = "ERROR";
const DEFAULT_CAPTURE_TIMEOUT_MS = 6000;
const MAX_CAPTURE_TIMEOUT_MS = 6000;
const ALLOWED_QUERY_PARAMETERS = new Set([
  "boxes",
  "quantity",
  "limit",
  "timeoutMs",
  "zone",
  "coords_pol",
  "coords_pod",
  "polLat",
  "polLon",
  "podLat",
  "podLon",
  "polName",
  "podName",
  "vesselClass",
  "loadState",
  "selective",
  "matchingMode",
  "scope",
  "taxonomies",
  "taxonomyMode",
]);

type ScanRequestBody = {
  query?: Record<string, unknown>;
  scanId?: unknown;
};

async function setAppConfigValue(key: string, value: string, updatedAt = new Date()) {
  const [updatedConfig] = await db
    .insert(appConfig)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt },
    })
    .returning();
  return updatedConfig;
}

async function setScanStatus(value: string, details: Record<string, unknown>, updatedAt = new Date()) {
  const [status] = await Promise.all([
    setAppConfigValue(SCAN_STATUS_KEY, value, updatedAt),
    setAppConfigValue("scan_result", JSON.stringify({ ...details, scanStatus: value }), updatedAt),
  ]);
  return status;
}

async function readScanRequestBody(req: Request): Promise<ScanRequestBody> {
  try {
    const payload = await req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as ScanRequestBody
      : {};
  } catch (_) {
    return {};
  }
}

function buildCaptureUrl(req: Request, body: ScanRequestBody) {
  const captureUrl = new URL("/.netlify/functions/get-vessels", req.url);
  const requestUrl = new URL(req.url);
  const query = body.query && typeof body.query === "object" ? body.query : {};

  for (const [name, rawValue] of Object.entries(query)) {
    if (!ALLOWED_QUERY_PARAMETERS.has(name) || rawValue === undefined || rawValue === null) continue;
    captureUrl.searchParams.set(name, String(rawValue));
  }
  for (const [name, value] of requestUrl.searchParams.entries()) {
    if (ALLOWED_QUERY_PARAMETERS.has(name)) captureUrl.searchParams.set(name, value);
  }

  captureUrl.searchParams.set("force", "1");
  if (!captureUrl.searchParams.has("quantity")) captureUrl.searchParams.set("quantity", "1000");
  if (!captureUrl.searchParams.has("limit")) captureUrl.searchParams.set("limit", captureUrl.searchParams.get("quantity") || "1000");
  const rawTimeoutMs = captureUrl.searchParams.get("timeoutMs");
  const requestedTimeoutMs = rawTimeoutMs === null ? Number.NaN : Number(rawTimeoutMs);
  const captureTimeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.min(MAX_CAPTURE_TIMEOUT_MS, Math.max(2500, requestedTimeoutMs))
    : DEFAULT_CAPTURE_TIMEOUT_MS;
  captureUrl.searchParams.set("timeoutMs", String(captureTimeoutMs));
  return captureUrl;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const requestedAt = new Date();
  let scanId = "";
  try {
    const body = await readScanRequestBody(req);
    scanId = typeof body.scanId === "string" && body.scanId.trim() ? body.scanId.trim() : crypto.randomUUID();
    const captureUrl = buildCaptureUrl(req, body);
    if (!captureUrl.searchParams.has("boxes")
      && !captureUrl.searchParams.has("coords_pol")
      && !captureUrl.searchParams.has("coords_pod")) {
      return Response.json(
        { success: false, error: "AIS bounding boxes or POL/POD coordinates are required" },
        { status: 400 },
      );
    }
    const selectedTaxonomies = parseRequestedTaxonomies(captureUrl);
    if (captureUrl.searchParams.get("taxonomyMode") !== "strict" || selectedTaxonomies.length === 0) {
      return Response.json(
        { success: false, error: "At least one valid vessel taxonomy is required for a strict AIS sweep" },
        { status: 400 },
      );
    }

    await setScanStatus(SCAN_STATUS_RUNNING, {
      scanId,
      requestedAt: requestedAt.toISOString(),
      persistedCount: 0,
      databaseVesselCount: null,
    }, requestedAt);
    const captureResponse = await handleGetVessels(new Request(captureUrl, {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    const capturePayload = await captureResponse.json() as Record<string, unknown>;

    if (!captureResponse.ok) {
      await setScanStatus(SCAN_STATUS_ERROR, {
        scanId,
        requestedAt: requestedAt.toISOString(),
        completedAt: new Date().toISOString(),
        error: capturePayload.error || capturePayload.warning || "AIS server capture failed",
      });
      return Response.json({
        ...capturePayload,
        success: false,
        scanStatus: SCAN_STATUS_ERROR,
        requestedAt: requestedAt.toISOString(),
        error: capturePayload.error || capturePayload.warning || "AIS server capture failed",
      }, { status: captureResponse.status });
    }

    const completedAt = new Date();
    const vessels = Array.isArray(capturePayload.vessels) ? capturePayload.vessels : [];
    const persistedCount = Number(capturePayload.persistedCount);
    const databaseVesselCount = Number(capturePayload.databaseVesselCount);
    const masterPersistedCount = Number(capturePayload.masterPersistedCount);
    const availableVesselCount = Number(capturePayload.availableVesselCount);
    const status = await setScanStatus(SCAN_STATUS_COMPLETE, {
      scanId,
      requestedAt: requestedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      persistedCount: Number.isFinite(persistedCount) ? persistedCount : vessels.length,
      databaseVesselCount: Number.isFinite(databaseVesselCount) ? databaseVesselCount : null,
      masterPersistedCount: Number.isFinite(masterPersistedCount) ? masterPersistedCount : 0,
      availableVesselCount: Number.isFinite(availableVesselCount) ? availableVesselCount : vessels.length,
      degraded: capturePayload.degraded === true,
      liveConnection: capturePayload.liveConnection !== false,
      warning: typeof capturePayload.warning === "string" ? capturePayload.warning : null,
      source: typeof capturePayload.source === "string" ? capturePayload.source : "aisstream-live",
    }, completedAt);
    const targetCount = captureResponse.headers.get("x-ais-target-count")
      || captureUrl.searchParams.get("quantity")
      || "1000";
    return Response.json({
      ...capturePayload,
      success: true,
      scanStatus: status.value,
      scanId,
      requestedAt: requestedAt.toISOString(),
      completedAt: status.updatedAt.toISOString(),
      persistedCount: Number.isFinite(persistedCount) ? persistedCount : vessels.length,
    }, {
      headers: {
        "cache-control": "no-store",
        "x-ais-persisted-count": String(Number.isFinite(persistedCount) ? persistedCount : vessels.length),
        "x-ais-target-count": targetCount,
      },
    });
  } catch (error) {
    console.error("[ais-scan-request] AIS server capture failed.", error);
    try {
      await setScanStatus(SCAN_STATUS_ERROR, {
        scanId,
        requestedAt: requestedAt.toISOString(),
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unable to complete the AIS server capture",
      });
    } catch (statusError) {
      console.error("[ais-scan-request] Failed to persist error status.", statusError);
    }
    return Response.json(
      { success: false, scanStatus: SCAN_STATUS_ERROR, error: "Unable to complete the AIS server capture" },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/ais/scan-request",
  method: "POST",
};
