import type { Config } from "@netlify/functions";
import {
  getFleetRow,
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

function normalizeReport(payload: Record<string, unknown>): SessionSyncData | null {
  if (!Array.isArray(payload.vessels) || payload.vessels.length === 0) return null;

  const createdAt = typeof payload.created_at === "string" && !Number.isNaN(Date.parse(payload.created_at))
    ? payload.created_at
    : new Date().toISOString();

  return {
    ...payload,
    format: "v2",
    source: "Core PRO",
    syncId: typeof payload.syncId === "string" && payload.syncId.trim()
      ? payload.syncId
      : generateSyncId(),
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    vessels: payload.vessels,
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
    const savedReport = await getFleetRow();
    const report = savedReport?.lastSyncData;

    if (!report || !Array.isArray(report.vessels)) {
      return Response.json({
        success: true,
        available: false,
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

    const report = normalizeReport(payload);
    if (!report) {
      return Response.json({
        success: false,
        error: "vessels must be a non-empty array",
      }, { status: 400, headers });
    }

    const savedSync = await upsertSessionSync({
      userId: SESSION_SYNC_USER_ID,
      lastSyncData: report,
      lastActionModule: SESSION_SYNC_ACTION_MODULE,
    });

    const savedVessels = savedSync.lastSyncData.vessels;
    if (
      savedSync.lastSyncData.syncId !== report.syncId
      || !Array.isArray(savedVessels)
      || savedVessels.length !== report.vessels.length
    ) {
      throw new Error("The persisted vessel array does not match the uploaded report.");
    }

    return Response.json({
      ...savedSync.lastSyncData,
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
