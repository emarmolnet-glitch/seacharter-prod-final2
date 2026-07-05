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

function normalizeVessel(value: unknown): ReportVessel | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mmsi = cleanText(source.mmsi);
  const imo = cleanText(source.imo);
  const latitud = cleanNumber(source.latitud);
  const longitud = cleanNumber(source.longitud);

  if (!mmsi && !imo) return null;
  if (latitud === null || longitud === null) return null;

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
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const payload = await req.json().catch(() => null);
  const report = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const vessels = Array.isArray(report.vessels)
    ? report.vessels.map(normalizeVessel).filter((row): row is ReportVessel => row !== null)
    : [];

  if (vessels.length === 0) {
    return Response.json({ success: false, error: "Report payload does not contain valid vessels" }, { status: 400, headers: jsonHeaders });
  }

  const acceptedAt = new Date().toISOString();
  const dataBridgePayload = {
    source: "SeaCharter Radar",
    acceptedAt,
    frozenAt: cleanText(report.frozenAt),
    generatedAt: cleanText(report.generatedAt),
    taxonomy: report.taxonomy && typeof report.taxonomy === "object" ? report.taxonomy : null,
    vessels,
  };

  return Response.json({
    success: true,
    status: "success",
    action: "pending_audit",
    acceptedAt,
    acceptedCount: vessels.length,
    vessels,
    dataBridgePayload,
  }, { status: 201, headers: jsonHeaders });
};

export const config: Config = {
  path: "/api/data-bridge-export",
};
