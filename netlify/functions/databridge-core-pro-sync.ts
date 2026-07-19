import type { Config } from "@netlify/functions";
import { createCorsHeaders } from "./_shared/cors.js";

declare const process: { env: Record<string, string | undefined> };

const MAX_VESSELS = 2_000;
const MAX_ATTEMPTS = 3;
const MAX_REDIRECTS = 5;

function readEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getDataBridgeEndpoint() {
  const configuredEndpoint = readEnvironmentValue(
    "DATA_BRIDGE_CORE_PRO_SYNC_URL",
    "VITE_DATA_BRIDGE_CORE_PRO_SYNC_URL",
    "DATA_BRIDGE_RECEIVE_CORE_DATA_URL",
    "VITE_DATA_BRIDGE_RECEIVE_CORE_DATA_URL",
  );
  if (configuredEndpoint) return configuredEndpoint;

  const apiUrl = readEnvironmentValue("DATA_BRIDGE_API_URL", "VITE_DATA_BRIDGE_API_URL");
  if (!isValidHttpUrl(apiUrl)) return "";

  const syncPath = readEnvironmentValue(
    "DATA_BRIDGE_CORE_PRO_SYNC_PATH",
    "VITE_DATA_BRIDGE_CORE_PRO_SYNC_PATH",
    "DATA_BRIDGE_RECEIVE_CORE_DATA_PATH",
  ) || "/api/receive-core-data";
  return new URL(syncPath, `${apiUrl.replace(/\/+$/, "")}/`).href;
}

function readString(source: Record<string, unknown>, key: string, fallback = "") {
  const value = source[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : fallback;
}

function readNumber(source: Record<string, unknown>, key: string, fallback = 0) {
  const value = Number(source[key]);
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(source: Record<string, unknown>, key: string, fallback = false) {
  const value = source[key];
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function normalizeFlatVessel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const imoDigits = readString(source, "imo").replace(/\D/g, "");
  if (imoDigits.length !== 7) return null;
  const latitude = readNumber(source, "latitude", Number.NaN);
  const longitude = readNumber(source, "longitude", Number.NaN);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;

  return {
    imo: Number(imoDigits),
    is_audit_required: readBoolean(source, "is_audit_required"),
    vessel_name: readString(source, "vessel_name", "Unknown"),
    dwt: readNumber(source, "dwt"),
    latitude,
    longitude,
    has_gears: readBoolean(source, "has_gears"),
    flag: readString(source, "flag", "N/A").slice(0, 3),
    last_port: readString(source, "last_port", "N/A"),
    vessel_type: readString(source, "vessel_type", "Unknown"),
    year_built: readNumber(source, "year_built"),
    owner_manager: readString(source, "owner_manager", "N/A"),
    draft_meters: readNumber(source, "draft_meters"),
    eta: readString(source, "eta", "N/A"),
    detected_at: readString(source, "detected_at", "N/A"),
  };
}

function readReport(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const syncId = readString(source, "syncId") || readString(source, "sync_id");
  if (!syncId || syncId.length > 128) return null;

  const sourceVessels = Array.isArray(source.vessels) ? source.vessels.slice(0, MAX_VESSELS) : [];
  const vessels = sourceVessels.map(normalizeFlatVessel).filter(Boolean);
  if (vessels.length === 0) return null;

  return JSON.parse(JSON.stringify({
    type: "fleet",
    format: "v2",
    source: "Core PRO",
    syncId,
    vessel_count: vessels.length,
    updated_at: readString(source, "updated_at", new Date().toISOString()),
    vessels,
  }));
}

function createForwardHeaders(req: Request, syncId: string) {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "x-core-pro-sync-id": syncId,
  });
  const incomingAuthorization = String(req.headers.get("authorization") || "").trim();
  const incomingApiKey = String(req.headers.get("x-api-key") || "").trim();
  const incomingSessionToken = String(req.headers.get("x-session-token") || "").trim();
  const apiSecret = readEnvironmentValue("DATA_BRIDGE_API_SECRET", "VITE_DATA_BRIDGE_API_SECRET");
  const apiKey = readEnvironmentValue("DATA_BRIDGE_API_KEY", "VITE_DATA_BRIDGE_API_KEY");
  const sessionToken = readEnvironmentValue("DATA_BRIDGE_SESSION_TOKEN", "VITE_DATA_BRIDGE_SESSION_TOKEN");
  const authorizationToken = apiSecret || sessionToken;

  if (authorizationToken) headers.set("authorization", `Bearer ${authorizationToken}`);
  else if (incomingAuthorization) headers.set("authorization", incomingAuthorization);

  const forwardedApiKey = apiKey || apiSecret || incomingApiKey;
  if (forwardedApiKey) headers.set("x-api-key", forwardedApiKey);

  const forwardedSessionToken = sessionToken || incomingSessionToken;
  if (forwardedSessionToken) headers.set("x-session-token", forwardedSessionToken);
  return headers;
}

function readUpstreamError(responseText: string, status: number) {
  try {
    const payload = JSON.parse(responseText) as Record<string, unknown>;
    const message = typeof payload.error === "string"
      ? payload.error
      : typeof payload.message === "string"
        ? payload.message
        : "";
    if (message) return message.slice(0, 300);
  } catch {
    // The upstream may return HTML for routing errors; do not relay it.
  }
  return `Data Bridge respondió ${status}.`;
}

async function waitForRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
}

async function postReportPreservingMethod(
  initialEndpoint: string,
  headers: Headers,
  body: string,
) {
  let endpoint = new URL(initialEndpoint);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error("Data Bridge redirect limit exceeded");
    endpoint = new URL(location, endpoint);
    if (!isValidHttpUrl(endpoint.href)) throw new Error("Data Bridge returned an invalid redirect");
  }
  throw new Error("Data Bridge redirect limit exceeded");
}

export default async (req: Request) => {
  const headers = createCorsHeaders(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const report = readReport(await req.json().catch(() => null));
  if (!report) {
    return Response.json({
      success: false,
      error: "Se requiere un reporte plano con syncId y al menos un buque con IMO válido.",
    }, { status: 400, headers });
  }

  const endpoint = getDataBridgeEndpoint();
  if (!isValidHttpUrl(endpoint)) {
    return Response.json({
      success: false,
      error: "Configura DATA_BRIDGE_CORE_PRO_SYNC_URL o DATA_BRIDGE_API_URL para enviar el reporte.",
    }, { status: 503, headers });
  }

  const requestHeaders = createForwardHeaders(req, report.syncId);
  const requestBody = JSON.stringify(report);
  let lastStatus = 502;
  let lastError = "No se pudo entregar el reporte a Data Bridge.";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const bridgeResponse = await postReportPreservingMethod(endpoint, requestHeaders, requestBody);
      const responseText = await bridgeResponse.text();
      lastStatus = bridgeResponse.status;
      lastError = readUpstreamError(responseText, bridgeResponse.status);

      if (bridgeResponse.ok) {
        let parsedPayload: Record<string, unknown> = {};
        try {
          parsedPayload = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
        } catch {
          parsedPayload = {};
        }
        if (parsedPayload.success === false) {
          lastError = readUpstreamError(responseText, bridgeResponse.status);
          break;
        }
        return Response.json({
          success: true,
          syncId: report.syncId,
          vessel_count: report.vessel_count,
          acceptedCount: Number(parsedPayload.acceptedCount) || report.vessel_count,
        }, { status: 200, headers });
      }

      if (bridgeResponse.status !== 429 && bridgeResponse.status < 500) break;
    } catch (error) {
      console.error("[databridge-core-pro-sync] Failed to notify Data Bridge.", error);
      lastStatus = 502;
      lastError = "No se pudo completar la comunicación con Data Bridge.";
    }

    if (attempt < MAX_ATTEMPTS - 1) await waitForRetry(attempt);
  }

  return Response.json({
    success: false,
    error: lastError,
    upstreamStatus: lastStatus,
  }, { status: 502, headers });
};

export const config: Config = {
  path: ["/api/databridge-core-pro-sync", "/.netlify/functions/databridge-core-pro-sync"],
};
