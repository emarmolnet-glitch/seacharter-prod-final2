import type { Config } from "@netlify/functions";
import {
  fetchFleetRows,
  SESSION_SYNC_USER_ID,
  upsertSessionSync,
} from "../../db/session-sync.js";

type SessionSyncRequest = {
  user_id?: unknown;
  last_sync_data?: unknown;
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

    if (!Array.isArray(body.last_sync_data)) {
      return Response.json({ success: false, error: "last_sync_data must be a vessel array" }, { status: 400 });
    }

    const savedSync = await upsertSessionSync({
      userId: SESSION_SYNC_USER_ID,
      lastSyncData: body.last_sync_data,
    });

    return Response.json({
      success: true,
      session_sync: {
        user_id: savedSync.userId,
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
