import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getDataBridgeApiUrl() {
  return String(process.env.DATA_BRIDGE_API_URL || process.env.VITE_DATA_BRIDGE_API_URL || "").trim();
}

function getDataBridgeSyncPath() {
  return String(process.env.DATA_BRIDGE_DUAL_SYNC_PATH || "/api/dual-trading-chartering-sync").trim();
}

function getDataBridgeApiSecret() {
  return String(process.env.DATA_BRIDGE_API_SECRET || process.env.VITE_DATA_BRIDGE_API_SECRET || "").trim();
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readSyncId(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("operation" in payload)) return "";
  const operation = (payload as { operation?: unknown }).operation;
  if (!operation || typeof operation !== "object" || !("syncid" in operation)) return "";
  const syncid = (operation as { syncid?: unknown }).syncid;
  return syncid === null || syncid === undefined ? "" : String(syncid).trim();
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const payload = await req.json().catch(() => null);
  if (!readSyncId(payload)) {
    return new Response(null, { status: 204, headers });
  }

  const apiUrl = getDataBridgeApiUrl();
  if (!isValidHttpUrl(apiUrl)) {
    return Response.json({ success: false }, { status: 503, headers });
  }

  const endpoint = new URL(getDataBridgeSyncPath(), `${apiUrl.replace(/\/+$/, "")}/`);
  const apiSecret = getDataBridgeApiSecret();

  try {
    const bridgeResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiSecret ? { Authorization: `Bearer ${apiSecret}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    return new Response(null, { status: bridgeResponse.ok ? 204 : 502, headers });
  } catch {
    return Response.json({ success: false }, { status: 502, headers });
  }
};

export const config: Config = {
  path: "/api/databridge-dual-sync",
};
