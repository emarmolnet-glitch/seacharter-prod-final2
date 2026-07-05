import type { Config } from "@netlify/functions";

type ReportVessel = {
  mmsi?: string;
  imo?: string;
  nombre?: string;
  calado?: number | null;
  latitud?: number | null;
  longitud?: number | null;
  tipo?: string;
  shipTypeCode?: number | null;
};

declare const process: { env: Record<string, string | undefined> };

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDateForBridge(dateString: unknown) {
  if (typeof dateString !== "string") return dateString;
  const value = dateString.trim();
  if (!value) return dateString;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return dateString;

  return parsed.toISOString().slice(0, 10);
}

function isBridgeDateField(key: string) {
  return /date|fecha|eta|etd|createdAt|created_at|generatedAt|generated_at|frozenAt|frozen_at|updatedAt|updated_at|acceptedAt|accepted_at/i.test(key);
}

function normalizeBridgeDateFields(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeBridgeDateFields(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([field, fieldValue]) => [
        field,
        normalizeBridgeDateFields(fieldValue, field),
      ]),
    );
  }

  return isBridgeDateField(key) ? formatDateForBridge(value) : value;
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

function getBearerToken(req: Request) {
  const authorization = String(req.headers.get("authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const requestToken = match ? match[1].trim() : "";
  return requestToken || String(process.env.DATA_BRIDGE_API_SECRET || "").trim();
}

function extractRemoteError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.error || record.message || record.detail;
    if (message) return String(message);
  }
  return fallback;
}

function normalizeVessel(value: unknown): ReportVessel | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mmsi = cleanText(source.mmsi);
  const imo = cleanText(source.imo);
  const latitud = cleanNumber(source.latitud);
  const longitud = cleanNumber(source.longitud);

  if (!mmsi && !imo) return null;

  return {
    mmsi: mmsi || "N/A",
    imo: imo || "N/A",
    nombre: cleanText(source.nombre) || "Unknown vessel",
    calado: cleanNumber(source.calado),
    latitud,
    longitud,
    tipo: cleanText(source.tipo) || "N/A",
    shipTypeCode: cleanNumber(source.shipTypeCode),
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const rawPayload = await req.json().catch(() => null);
  const payload = normalizeBridgeDateFields(rawPayload);
  const report = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rawVessels = Array.isArray(payload)
    ? payload
    : Array.isArray(report.vessels)
      ? report.vessels
      : [];
  const vessels = rawVessels.map(normalizeVessel).filter((row): row is ReportVessel => row !== null);

  if (rawVessels.length === 0) {
    return Response.json({ success: false, error: "Report payload does not contain vessels" }, { status: 400, headers: jsonHeaders });
  }

  const apiUrl = getDataBridgeApiUrl();
  if (!isValidHttpUrl(apiUrl)) {
    return Response.json(
      { success: false, error: "Configura DATA_BRIDGE_API_URL o VITE_DATA_BRIDGE_API_URL para exportar a Data Bridge." },
      { status: 500, headers: jsonHeaders },
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return Response.json({ success: false, error: "Conecta Data Bridge antes de exportar." }, { status: 400, headers: jsonHeaders });
  }

  const exportBody = Array.isArray(payload)
    ? payload
    : Array.isArray(report.vessels)
      ? report.vessels
      : rawVessels;

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/receive-audit`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(exportBody),
    });

    let bridgePayload: unknown = null;
    try {
      bridgePayload = await response.json();
    } catch {
      bridgePayload = null;
    }

    if (!response.ok) {
      return Response.json(
        { success: false, error: extractRemoteError(bridgePayload, `Data Bridge respondió ${response.status}`) },
        { status: response.status, headers: jsonHeaders },
      );
    }

    const acceptedAt = new Date().toISOString();
    return Response.json({
      success: true,
      status: "success",
      action: "pending_audit",
      acceptedAt,
      acceptedCount: rawVessels.length,
      vessels,
      dataBridgeResponse: bridgePayload,
    }, { status: 200, headers: jsonHeaders });
  } catch {
    return Response.json(
      { success: false, error: "No se pudo enviar el payload a Data Bridge." },
      { status: 502, headers: jsonHeaders },
    );
  }
};

export const config: Config = {
  path: ["/api/data-bridge-export", "/.netlify/functions/data-bridge-export"],
};
