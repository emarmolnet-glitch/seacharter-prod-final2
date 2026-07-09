import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

type StrictVessel = {
  imo: number;
  is_audit_required: boolean;
  vessel_name: string;
  dwt: number;
  has_gears: boolean;
  flag: string;
  last_port: string;
  vessel_type: string;
  year_built: number;
  owner_manager: string;
  draft_meters: number;
  eta: string;
  detected_at: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function cleanText(value: unknown, fallback = "N/A") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function cleanBoolean(value: unknown) {
  return Boolean(value);
}

function cleanEta(value: unknown) {
  return cleanText(value).split("T")[0] || "N/A";
}

function cleanImo(value: unknown) {
  const imo = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isInteger(imo) && imo >= 1000000 && imo <= 9999999 ? imo : 0;
}

function normalizeVessel(value: unknown): StrictVessel {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const imo = cleanImo(source.imo ?? source.IMO ?? source.numero_imo ?? source.imoNumber);

  return {
    imo,
    is_audit_required: cleanBoolean(source.is_audit_required ?? source.auditRequired),
    vessel_name: cleanText(source.vessel_name ?? source.name ?? source.nombre ?? source.ShipName ?? source.vesselName),
    dwt: cleanNumber(source.dwt ?? source.DWT),
    has_gears: cleanBoolean(source.has_gears ?? source.gruas_geared ?? source.gruas),
    flag: cleanText(source.flag ?? source.bandera ?? source.Flag).slice(0, 3) || "N/A",
    last_port: cleanText(source.last_port ?? source.ultimo_puerto ?? source.lastPort),
    vessel_type: cleanText(source.vessel_type ?? source.type ?? source.tipo_buque ?? source.tipo),
    year_built: cleanNumber(source.year_built ?? source.ano_construccion ?? source.builtYear ?? source.built_year ?? source.built),
    owner_manager: cleanText(source.owner_manager ?? source.armador_manager ?? source.owner ?? source.manager ?? source.armador),
    draft_meters: cleanNumber(source.draft_meters ?? source.draft ?? source.Draft ?? source.calado),
    eta: cleanEta(source.eta ?? source.ETA ?? source.eta_puerto_carga),
    detected_at: cleanEta(source.detected_at ?? source.detectedAt ?? source.created_at ?? source.createdAt ?? source.generated_at ?? source.generatedAt),
  };
}

function extractVesselsPayload(rawPayload: unknown) {
  if (Array.isArray(rawPayload)) return rawPayload;
  if (!rawPayload || typeof rawPayload !== "object") return [];

  const payload = rawPayload as Record<string, unknown>;
  if (Array.isArray(payload.vessels)) return payload.vessels;
  if (Array.isArray(payload.buques)) return payload.buques;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
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

function getBearerToken() {
  return String(process.env.API_SECRET || process.env.VITE_API_SECRET || "").trim();
}

function extractRemoteError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return String(record.error || record.message || record.detail || fallback);
  }
  return fallback;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const rawPayload = await req.json().catch(() => null);
  const rawVessels = extractVesselsPayload(rawPayload);
  const vessels = rawVessels.map(normalizeVessel);
  const auditRequiredCount = vessels.filter((vessel) => vessel.is_audit_required).length;

  for (const vessel of vessels) {
    if (vessel.is_audit_required) {
      console.info(
        "Procesando buque con datos incompletos (necesita auditoría manual):",
        vessel.vessel_name,
        vessel,
      );
    }
  }

  if (rawVessels.length === 0) {
    return Response.json({ success: false, error: "Expected a JSON array of vessels or an object with vessels/buques." }, { status: 400, headers: jsonHeaders });
  }

  const apiUrl = getDataBridgeApiUrl();
  if (!isValidHttpUrl(apiUrl)) {
    return Response.json(
      { success: false, error: "Configura DATA_BRIDGE_API_URL o VITE_DATA_BRIDGE_API_URL para exportar a Data Bridge." },
      { status: 500, headers: jsonHeaders },
    );
  }

  const token = getBearerToken();
  if (!token) {
    return Response.json({ success: false, error: "Conecta Data Bridge antes de exportar." }, { status: 400, headers: jsonHeaders });
  }

  try {
    const bridgeResponse = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/receive-vessels`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vessels),
    });

    let bridgePayload: unknown = null;
    try {
      bridgePayload = await bridgeResponse.json();
    } catch {
      bridgePayload = null;
    }

    if (bridgeResponse.status === 200) {
      console.log(`[Data Bridge] Envío exitoso a /api/receive-vessels: ${vessels.length} buque(s).`);
      return Response.json(
        { success: true, acceptedCount: vessels.length, auditRequiredCount, dataBridgeResponse: bridgePayload },
        { status: 200, headers: jsonHeaders },
      );
    }

    console.error("[Data Bridge] Rechazo desde /api/receive-vessels:", {
      status: bridgeResponse.status,
      response: bridgePayload,
    });

    return Response.json(
      { success: false, error: extractRemoteError(bridgePayload, `Data Bridge respondió ${bridgeResponse.status}`), dataBridgeResponse: bridgePayload },
      { status: bridgeResponse.status, headers: jsonHeaders },
    );
  } catch {
    return Response.json(
      { success: false, error: "No se pudo enviar el payload a Data Bridge." },
      { status: 502, headers: jsonHeaders },
    );
  }
};

export const config: Config = {
  path: ["/api/receive-vessels", "/.netlify/functions/receive-vessels"],
};
