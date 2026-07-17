import type { Config } from "@netlify/functions";
import {
  fetchFleetRows,
  SESSION_SYNC_ACTION_MODULE,
  SESSION_SYNC_USER_ID,
  upsertSessionSync,
} from "../../db/session-sync.js";

type SessionSyncRequest = {
  user_id?: unknown;
  last_sync_data?: unknown;
  last_action_module?: unknown;
};

const MAX_SYNC_PAYLOAD_BYTES = 10 * 1024 * 1024;

const headers = {
  "cache-control": "no-store",
};

function readContentLength(req: Request) {
  const contentLength = Number(req.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
}

function payloadTooLarge() {
  return Response.json({ success: false, error: "Payload exceeds the 10 MB limit" }, { status: 413, headers });
}

export default async (req: Request) => {
  if (req.method === "GET") {
    const rows = await fetchFleetRows();
    return Response.json({ success: true, session_sync: rows }, { headers });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const contentLength = readContentLength(req);
    if (contentLength !== null && contentLength > MAX_SYNC_PAYLOAD_BYTES) return payloadTooLarge();

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_SYNC_PAYLOAD_BYTES) return payloadTooLarge();

    const body = JSON.parse(rawBody) as SessionSyncRequest | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "A JSON body is required" }, { status: 400, headers });
    }

    if (body.user_id !== SESSION_SYNC_USER_ID) {
      return Response.json({ success: false, error: "Invalid user_id" }, { status: 400, headers });
    }

    if (body.last_action_module !== SESSION_SYNC_ACTION_MODULE) {
      return Response.json({ success: false, error: "Invalid last_action_module" }, { status: 400, headers });
    }

    const lastSyncData = body.last_sync_data as Record<string, unknown> | null;
    if (!lastSyncData || typeof lastSyncData !== "object" || Array.isArray(lastSyncData)) {
      return Response.json({ success: false, error: "last_sync_data must be an object" }, { status: 400, headers });
    }

    if (lastSyncData.format !== "v2") {
      return Response.json({ success: false, error: "last_sync_data.format must be v2" }, { status: 400, headers });
    }

    const syncId = typeof lastSyncData.syncId === "string" ? lastSyncData.syncId.trim() : "";
    if (!syncId) {
      return Response.json({ success: false, error: "last_sync_data.syncId must be a non-empty string" }, { status: 400, headers });
    }

    if (!Array.isArray(lastSyncData.vessels)) {
      return Response.json({ success: false, error: "last_sync_data.vessels must be an array" }, { status: 400, headers });
    }

    if (typeof lastSyncData.updated_at !== "string" || Number.isNaN(Date.parse(lastSyncData.updated_at))) {
      return Response.json({ success: false, error: "last_sync_data.updated_at must be an ISO date" }, { status: 400, headers });
    }

    const completeSyncData = {
      ...lastSyncData,
      format: "v2",
      syncId,
      vessels: lastSyncData.vessels,
      updated_at: lastSyncData.updated_at,
    };

    const savedSync = await upsertSessionSync({
      userId: SESSION_SYNC_USER_ID,
      lastSyncData: completeSyncData,
      lastActionModule: SESSION_SYNC_ACTION_MODULE,
    });

    const savedVessels = Array.isArray(savedSync.lastSyncData.vessels) ? savedSync.lastSyncData.vessels : [];
    if (savedSync.lastSyncData.syncId !== syncId || savedVessels.length !== lastSyncData.vessels.length) {
      throw new Error("Persisted session sync does not match the submitted v2 payload");
    }

    return Response.json({
      ...savedSync.lastSyncData,
      success: true,
      available: savedVessels.length > 0,
      vessel_count: savedVessels.length,
      session_sync: {
        user_id: savedSync.userId,
        last_sync_data: savedSync.lastSyncData,
        vessel_count: savedVessels.length,
        last_action_module: savedSync.lastActionModule,
        updated_at: savedSync.updatedAt,
      },
    }, { status: 200, headers });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers });
    }

    console.error("[session-sync] Core PRO matching sync failed.", error);
    return Response.json({ success: false, error: "Session sync failed" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/session-sync",
};
