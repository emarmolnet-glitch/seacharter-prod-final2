import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getDataBridgeApiUrl() {
  return String(process.env.DATA_BRIDGE_API_URL || process.env.VITE_DATA_BRIDGE_API_URL || "").trim();
}

function getDataBridgeApiSecret(req: Request) {
  const authorization = String(req.headers.get("authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const requestToken = match ? match[1].trim() : "";
  return requestToken || String(process.env.DATA_BRIDGE_API_SECRET || process.env.VITE_DATA_BRIDGE_API_SECRET || "").trim();
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveTariffPath() {
  const configuredPath = String(process.env.DATA_BRIDGE_TARIFF_PATH || "").trim();
  return configuredPath || "/api/port-tariffs";
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const apiUrl = getDataBridgeApiUrl();
  const apiSecret = getDataBridgeApiSecret(req);
  if (!isValidHttpUrl(apiUrl) || !apiSecret) {
    return Response.json({ success: false, error: "Data Bridge tariff API is not configured." }, { status: 404, headers: jsonHeaders });
  }

  const requestUrl = new URL(req.url);
  const port = String(requestUrl.searchParams.get("port") || "").trim();
  if (!port) {
    return Response.json({ success: false, error: "Port is required." }, { status: 400, headers: jsonHeaders });
  }

  const endpoint = new URL(resolveTariffPath(), `${apiUrl.replace(/\/+$/, "")}/`);
  endpoint.searchParams.set("port", port);
  for (const key of ["type", "dwt", "gt", "loa"]) {
    const value = requestUrl.searchParams.get(key);
    if (value) endpoint.searchParams.set(key, value);
  }

  try {
    const bridgeResponse = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiSecret}`,
      },
    });

    if (bridgeResponse.status === 404) {
      return Response.json({ success: false, tariff: null }, { status: 404, headers: jsonHeaders });
    }

    let payload: unknown = null;
    try {
      payload = await bridgeResponse.json();
    } catch {
      payload = null;
    }

    if (!bridgeResponse.ok || !payload || typeof payload !== "object") {
      return Response.json({ success: false, tariff: null }, { status: 502, headers: jsonHeaders });
    }

    return Response.json(payload, { status: bridgeResponse.status, headers: jsonHeaders });
  } catch {
    return Response.json({ success: false, tariff: null }, { status: 502, headers: jsonHeaders });
  }
};

export const config: Config = {
  path: "/api/databridge-port-tariff",
};
