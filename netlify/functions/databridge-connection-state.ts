import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db, ensureApplicationSchema } from "../../db/index.js";
import { appConfig } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

const DATA_BRIDGE_CONNECTION_CONFIG_KEY = "databridge_connection_state";
const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

type PersistedConnectionState = {
  connected?: unknown;
  verifiedAt?: unknown;
  lastCheckedAt?: unknown;
};

function normalizeConnectionState(value: string | null | undefined) {
  if (!value) return { connected: false, verifiedAt: null, lastCheckedAt: null };
  try {
    const parsed = JSON.parse(value) as PersistedConnectionState;
    return {
      connected: parsed?.connected === true,
      verifiedAt: typeof parsed?.verifiedAt === "string" ? parsed.verifiedAt : null,
      lastCheckedAt: typeof parsed?.lastCheckedAt === "string" ? parsed.lastCheckedAt : null,
    };
  } catch {
    return { connected: false, verifiedAt: null, lastCheckedAt: null };
  }
}

export default async (req: Request) => {
  const headers = {
    ...baseHeaders,
    ...createCorsHeaders(req, "GET, OPTIONS"),
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    await ensureApplicationSchema();
    const [row] = await db
      .select({ value: appConfig.value, updatedAt: appConfig.updatedAt })
      .from(appConfig)
      .where(eq(appConfig.key, DATA_BRIDGE_CONNECTION_CONFIG_KEY))
      .limit(1);
    const state = normalizeConnectionState(row?.value);
    return Response.json({
      success: true,
      connection: {
        ...state,
        persistedAt: row?.updatedAt?.toISOString?.() || null,
      },
    }, { headers });
  } catch (error) {
    console.error("[databridge-connection-state] Failed to read persisted state.", error);
    return Response.json({ success: false, error: "Connection state is unavailable" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/databridge-connection-state",
};
