import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, x-api-key",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const DEFAULT_DATA_BRIDGE_ORIGIN = "https://calm-shortbread-55bcfc.netlify.app";
const DATA_BRIDGE_CONNECTION_CONFIG_KEY = "databridge_connection_state";

async function persistDataBridgeConnectionState(connected: boolean): Promise<void> {
  try {
    const { getDatabaseConnectionString } = await import("../../db/connection-string.js");
    if (!getDatabaseConnectionString()) return;
    const { db } = await import("../../db/index.js");
    const { appConfig } = await import("../../db/schema.js");
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
  } catch (err) {
    // No interrumpir la verificación si la base de datos no está disponible
  }
}

function getDataBridgeApiUrl(): string {
  return String(
    process.env.DATA_BRIDGE_API_URL
      || process.env.DATA_BRIDGE_PROXY_ORIGIN
      || process.env.VITE_DATA_BRIDGE_API_URL
      || DEFAULT_DATA_BRIDGE_ORIGIN,
  ).trim();
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getDataBridgeApiSecret(req: Request): string {
  const authorization = String(req.headers.get("authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const requestToken = match ? match[1].trim() : "";
  return requestToken || String(process.env.DATA_BRIDGE_API_SECRET || process.env.VITE_DATA_BRIDGE_API_SECRET || "").trim();
}

export default async (req: Request): Promise<Response> => {
  // Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const apiUrl = getDataBridgeApiUrl();
    const apiSecret = getDataBridgeApiSecret(req);

    if (!isValidHttpUrl(apiUrl)) {
      return new Response(
        JSON.stringify({
          success: false,
          connected: false,
          error: "DATA_BRIDGE_API_URL no es una URL válida.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/verify-connection`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...(apiSecret ? { Authorization: `Bearer ${apiSecret}` } : {}),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    let payload: unknown = null;
    try {
      payload = await upstreamResponse.json();
    } catch {
      payload = null;
    }

    if (!upstreamResponse.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error || "")
          : payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: unknown }).message || "")
            : `DataBridge respondió con estado ${upstreamResponse.status}`;

      return new Response(
        JSON.stringify({
          success: false,
          connected: false,
          error: message,
          status: upstreamResponse.status,
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    // Persistir estado de forma asíncrona no bloqueante
    persistDataBridgeConnectionState(true).catch(() => undefined);

    const resultPayload = payload && typeof payload === "object"
      ? { success: true, connected: true, ...payload }
      : { success: true, connected: true };

    return new Response(JSON.stringify(resultPayload), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error: unknown) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    const errorMessage = isAbort
      ? "La verificación con Data Bridge excedió el tiempo límite (timeout)."
      : (error instanceof Error ? error.message : "Error inesperado al conectar con DataBridge.");

    console.error("[verify-connection] Error alcanzando DataBridge:", errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        connected: false,
        error: errorMessage,
      }),
      { status: 500, headers: corsHeaders },
    );
  }
};

export const config: Config = {
  path: "/api/verify-connection",
};
