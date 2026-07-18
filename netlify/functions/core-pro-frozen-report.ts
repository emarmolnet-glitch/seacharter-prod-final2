import type { Config } from "@netlify/functions";
import {
  getFleetRow,
  getFleetRowBySyncId,
  normalizeSessionSyncVessels,
  SESSION_SYNC_ACTION_MODULE,
  SESSION_SYNC_USER_ID,
  type SessionSyncData,
  upsertSessionSync,
} from "../../db/session-sync.js";
import { createCorsHeaders } from "./_shared/cors.js";

const MAX_REPORT_BYTES = 10 * 1024 * 1024;

const cacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readContentLength(req: Request) {
  const contentLength = Number(req.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
}

function generateSyncId() {
  return crypto.randomUUID();
}

function normalizeReport(payload: Record<string, unknown>): { report?: SessionSyncData; error?: string } {
  if (!Array.isArray(payload.vessels) || payload.vessels.length === 0) {
    return { error: "vessels must be a non-empty array" };
  }

  const normalizedVessels = normalizeSessionSyncVessels(payload.vessels);
  if (normalizedVessels.invalidCoordinateIndex >= 0) {
    return { error: `vessels[${normalizedVessels.invalidCoordinateIndex}] must include valid latitude and longitude` };
  }

  const incomingSyncId = typeof payload.syncId === "string" && payload.syncId.trim()
    ? payload.syncId
    : typeof payload.sync_id === "string" && payload.sync_id.trim()
      ? payload.sync_id
      : generateSyncId();

  const createdAt = typeof payload.created_at === "string" && !Number.isNaN(Date.parse(payload.created_at))
    ? payload.created_at
    : new Date().toISOString();

  const canonicalPayload = { ...payload };
  delete canonicalPayload.sync_id;

  return {
    report: {
      ...canonicalPayload,
      format: "v2",
      source: "Core PRO",
      syncId: incomingSyncId.trim(),
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      vessels: normalizedVessels.vessels,
    },
  };
}

export default async (req: Request) => {
  const headers = {
    ...cacheHeaders,
    ...createCorsHeaders(req, "GET, POST, PUT, OPTIONS"),
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method === "GET") {
    const requestedSyncId = new URL(req.url).searchParams.get("sync_id")?.trim()
      || new URL(req.url).searchParams.get("syncId")?.trim()
      || "";
    const savedReport = requestedSyncId
      ? await getFleetRowBySyncId(requestedSyncId)
      : await getFleetRow();
    const report = savedReport?.lastSyncData;

    if (!report || !Array.isArray(report.vessels)) {
      return Response.json({
        success: true,
        available: false,
        message: "Reporte no disponible",
        syncId: requestedSyncId || null,
        vessels: [],
        vessel_count: 0,
      }, { status: 200, headers });
    }

    return Response.json({
      ...report,
      success: true,
      available: report.vessels.length > 0,
      vessel_count: report.vessels.length,
    }, { status: 200, headers });
  }

  if (req.method !== "POST" && req.method !== "PUT") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const contentLength = readContentLength(req);
  if (contentLength !== null && contentLength > MAX_REPORT_BYTES) {
    return Response.json({
      success: false,
      error: "El reporte supera el límite de 10 MB.",
    }, { status: 413, headers });
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REPORT_BYTES) {
      return Response.json({
        success: false,
        error: "El reporte supera el límite de 10 MB.",
      }, { status: 413, headers });
    }

    const payload = JSON.parse(rawBody) as unknown;
    if (!isObject(payload)) {
      return Response.json({ success: false, error: "A JSON object is required" }, { status: 400, headers });
    }

    const normalized = normalizeReport(payload);
    if (!normalized.report) {
      return Response.json({
        success: false,
        error: normalized.error || "Invalid frozen report",
      }, { status: 400, headers });
    }
    const report = normalized.report;

    const savedSync = await upsertSessionSync({
      userId: SESSION_SYNC_USER_ID,
      lastSyncData: report,
      lastActionModule: SESSION_SYNC_ACTION_MODULE,
    });

    const committedSync = await getFleetRowBySyncId(report.syncId || "");
    const savedVessels = committedSync?.lastSyncData.vessels;
    if (
      savedSync.syncId !== report.syncId
      || committedSync?.syncId !== report.syncId
      || !Array.isArray(savedVessels)
      || savedVessels.length !== report.vessels.length
    ) {
      throw new Error("The persisted vessel array does not match the uploaded report.");
    }

    return Response.json({
      ...committedSync!.lastSyncData,
      success: true,
      available: true,
      vessel_count: savedVessels.length,
    }, { status: 200, headers });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers });
    }

    console.error("[core-pro-frozen-report] Failed to persist the complete report.", error);
    return Response.json({
      success: false,
      error: "Core PRO frozen report persistence failed",
    }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/core-pro-frozen-report",
};
