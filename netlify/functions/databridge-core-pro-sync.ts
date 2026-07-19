import type { Config } from "@netlify/functions";
import { createCorsHeaders } from "./_shared/cors.js";

declare const process: { env: Record<string, string | undefined> };

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
  );
  if (configuredEndpoint) return configuredEndpoint;

  const apiUrl = readEnvironmentValue("DATA_BRIDGE_API_URL", "VITE_DATA_BRIDGE_API_URL");
  if (!isValidHttpUrl(apiUrl)) return "";

  const syncPath = readEnvironmentValue(
    "DATA_BRIDGE_CORE_PRO_SYNC_PATH",
    "VITE_DATA_BRIDGE_CORE_PRO_SYNC_PATH",
  ) || "/api/core-pro-frozen-report";
  return new URL(syncPath, `${apiUrl.replace(/\/+$/, "")}/`).href;
}

function getDataBridgeApiSecret() {
  return readEnvironmentValue("DATA_BRIDGE_API_SECRET", "VITE_DATA_BRIDGE_API_SECRET");
}

function readSignal(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const syncId = typeof source.syncId === "string" ? source.syncId.trim() : "";
  if (!syncId || syncId.length > 128) return null;

  return {
    type: "CORE_PRO_FROZEN_REPORT_COMMITTED",
    syncId,
    vessel_count: Number.isFinite(Number(source.vessel_count)) ? Number(source.vessel_count) : 0,
    updated_at: typeof source.updated_at === "string" && source.updated_at.trim()
      ? source.updated_at.trim()
      : new Date().toISOString(),
  };
}

export default async (req: Request) => {
  const headers = createCorsHeaders(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const signal = readSignal(await req.json().catch(() => null));
  if (!signal) {
    return Response.json({ success: false, error: "Se requiere un syncId válido." }, { status: 400, headers });
  }

  const endpoint = getDataBridgeEndpoint();
  if (!isValidHttpUrl(endpoint)) {
    return Response.json({
      success: false,
      error: "Configura DATA_BRIDGE_CORE_PRO_SYNC_URL o DATA_BRIDGE_API_URL para enviar la señal.",
    }, { status: 503, headers });
  }

  const apiSecret = getDataBridgeApiSecret();
  try {
    const bridgeResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(apiSecret ? { Authorization: `Bearer ${apiSecret}` } : {}),
      },
      body: JSON.stringify(signal),
      signal: AbortSignal.timeout(10_000),
    });

    if (!bridgeResponse.ok) {
      return Response.json({
        success: false,
        error: `Data Bridge rechazó la señal (${bridgeResponse.status}).`,
      }, { status: 502, headers });
    }

    return Response.json({ success: true, syncId: signal.syncId }, { status: 200, headers });
  } catch (error) {
    console.error("[databridge-core-pro-sync] Failed to notify Data Bridge.", error);
    return Response.json({
      success: false,
      error: "No se pudo entregar la señal a Data Bridge.",
    }, { status: 502, headers });
  }
};

export const config: Config = {
  path: "/api/databridge-core-pro-sync",
};
