import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, Accept",
  "vary": "Origin",
};

function getAllowedOrigins() {
  return String(process.env.CORE_PRO_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function getCorsHeaders(req: Request) {
  const requestOrigin = String(req.headers.get("origin") || "").trim().replace(/\/+$/, "");
  const allowedOrigins = getAllowedOrigins();
  const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  const configuredOrigin =
    requestOrigin &&
    (allowedOrigins.includes("*") ||
      allowedOrigins.includes(requestOrigin) ||
      requestOrigin === String(process.env.URL || "").trim().replace(/\/+$/, "") ||
      requestOrigin === String(process.env.DEPLOY_URL || "").trim().replace(/\/+$/, "") ||
      isLocalOrigin)
      ? requestOrigin
      : "";

  return {
    ...baseHeaders,
    ...(configuredOrigin ? { "access-control-allow-origin": configuredOrigin } : {}),
  };
}

function getDataBridgeApiUrl() {
  return String(process.env.DATA_BRIDGE_API_URL || process.env.VITE_DATA_BRIDGE_API_URL || "").trim();
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
  const headers = getCorsHeaders(req);
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

  if (!apiSecret) {
    return Response.json(
      { success: false, error: "Data Bridge API secret is not configured." },
      { status: 500, headers },
    );
  }

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/verify-connection`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        Accept: "application/json",
      },
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
