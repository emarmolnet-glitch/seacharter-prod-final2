import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { appConfig } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

declare const process: { env: Record<string, string | undefined> };

const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const DEFAULT_DATA_BRIDGE_ORIGIN = "https://calm-shortbread-55bcfc.netlify.app";
const DATA_BRIDGE_CONNECTION_CONFIG_KEY = "databridge_connection_state";

async function persistDataBridgeConnectionState(connected: boolean) {
  const timestamp = new Date().toISOString();
  const value = JSON.stringify({
    connected,
    verifiedAt: connected ? timestamp : null,
    lastCheckedAt: timestamp,
  });
  await db
    .insert(appConfig)
    .values({ key: DATA_BRIDGE_CONNECTION_CONFIG_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
}

function getDataBridgeApiUrl() {
  return String(
    process.env.DATA_BRIDGE_API_URL
      || process.env.DATA_BRIDGE_PROXY_ORIGIN
      || process.env.VITE_DATA_BRIDGE_API_URL
      || DEFAULT_DATA_BRIDGE_ORIGIN,
  ).trim();
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getDataBridgeApiSecret(req: Request) {
  const authorization = String(req.headers.get("authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const requestToken = match ? match[1].trim() : "";
  return requestToken || String(process.env.DATA_BRIDGE_API_SECRET || process.env.VITE_DATA_BRIDGE_API_SECRET || "").trim();
}

export default async (req: Request) => {
  const headers = {
    ...baseHeaders,
    ...createCorsHeaders(req, "GET, POST, OPTIONS"),
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const apiUrl = getDataBridgeApiUrl();
  const apiSecret = getDataBridgeApiSecret(req);

  if (!isValidHttpUrl(apiUrl)) {
    return Response.json(
      { success: false, error: "DATA_BRIDGE_API_URL is not configured." },
      { status: 500, headers },
    );
  }

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/verify-connection`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...(apiSecret ? { Authorization: `Bearer ${apiSecret}` } : {}),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401, headers });
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error || "")
          : payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: unknown }).message || "")
            : `Connection error (${response.status})`;
      return Response.json({ success: false, error: message }, { status: response.status, headers });
    }

    await persistDataBridgeConnectionState(true).catch(() => undefined);
    return Response.json(payload && typeof payload === "object" ? payload : { success: true }, { headers });
  } catch {
    return Response.json(
      { success: false, error: "Data Bridge verification timed out or failed." },
      { status: 502, headers },
    );
  }
};

export const config: Config = {
  path: "/api/verify-connection",
};
