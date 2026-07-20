declare const process: { env: Record<string, string | undefined> };

const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, Accept",
  "vary": "Origin",
};
const DEFAULT_DATA_BRIDGE_ORIGIN = "https://calm-shortbread-55bcfc.netlify.app";

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

function getBearerToken(req: Request) {
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

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const apiUrl = getDataBridgeApiUrl();
  if (!isValidHttpUrl(apiUrl)) {
    return Response.json(
      { success: false, error: "Configura DATA_BRIDGE_API_URL o VITE_DATA_BRIDGE_API_URL para verificar la conexión." },
      { status: 500, headers },
    );
  }

  const token = getBearerToken(req);
  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/verify-connection`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error || "")
          : payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: unknown }).message || "")
            : `Error de conexión (${response.status})`;
      return Response.json({ success: false, error: message }, { status: response.status, headers });
    }

    return Response.json(payload && typeof payload === "object" ? payload : { success: true }, { headers });
  } catch {
    return Response.json(
      { success: false, error: "No se pudo verificar la conexión con Data Bridge." },
      { status: 502, headers },
    );
  }
};

export const config = {
  path: "/api/databridge-verify-connection",
  method: ["POST", "OPTIONS"],
};
