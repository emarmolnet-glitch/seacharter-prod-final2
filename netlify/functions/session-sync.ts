import type { Config } from "@netlify/functions";
import {
  CORE_PRO_MATCHING_MODULE,
  SESSION_SYNC_USER_ID,
  upsertSessionSync,
} from "../../db/session-sync.js";

type SessionSyncRequest = {
  user_id?: unknown;
  last_action_module?: unknown;
  last_sync_data?: unknown;
};

export default async (req: Request) => {
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

    if (body.last_action_module !== CORE_PRO_MATCHING_MODULE) {
      return Response.json({ success: false, error: "Invalid last_action_module" }, { status: 400 });
    }

    if (!body.last_sync_data || typeof body.last_sync_data !== "object") {
      return Response.json({ success: false, error: "last_sync_data must be a JSON object" }, { status: 400 });
    }

    const savedSync = await upsertSessionSync({
      userId: SESSION_SYNC_USER_ID,
      lastActionModule: CORE_PRO_MATCHING_MODULE,
      lastSyncData: body.last_sync_data,
    });

    return Response.json({
      success: true,
      session_sync: {
        user_id: savedSync.userId,
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
