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

export default async (req: Request) => {
  if (req.method === "GET") {
    const rows = await fetchFleetRows();
    return Response.json({ success: true, session_sync: rows });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => null) as SessionSyncRequest | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "A JSON body is required" }, { status: 400 });
    }

    if (body.user_id !== SESSION_SYNC_USER_ID) {
      return Response.json({ success: false, error: "Invalid user_id" }, { status: 400 });
    }

    if (body.last_action_module !== SESSION_SYNC_ACTION_MODULE) {
      return Response.json({ success: false, error: "Invalid last_action_module" }, { status: 400 });
    }

    const lastSyncData = body.last_sync_data as Record<string, unknown> | null;
    if (!lastSyncData || typeof lastSyncData !== "object" || Array.isArray(lastSyncData)) {
      return Response.json({ success: false, error: "last_sync_data must be an object" }, { status: 400 });
    }

    if (!Array.isArray(lastSyncData.vessels)) {
      return Response.json({ success: false, error: "last_sync_data.vessels must be an array" }, { status: 400 });
    }

    if (typeof lastSyncData.updated_at !== "string" || Number.isNaN(Date.parse(lastSyncData.updated_at))) {
      return Response.json({ success: false, error: "last_sync_data.updated_at must be an ISO date" }, { status: 400 });
    }

    const savedSync = await upsertSessionSync({
      userId: SESSION_SYNC_USER_ID,
      lastSyncData: {
        vessels: lastSyncData.vessels,
        updated_at: lastSyncData.updated_at,
      },
      lastActionModule: SESSION_SYNC_ACTION_MODULE,
    });

    return Response.json({
      success: true,
      session_sync: {
        user_id: savedSync.userId,
        vessel_count: savedSync.lastSyncData.vessels.length,
        last_action_module: savedSync.lastActionModule,
        updated_at: savedSync.updatedAt,
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[session-sync] Core PRO matching sync failed.", error);
    return Response.json({ success: false, error: "Session sync failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/session-sync",
};
