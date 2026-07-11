import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

const FETCH_TIMEOUT_MS = 15000;
const DATA_BRIDGE_RECEIVE_CORE_DATA_URL = "https://calm-shortbread-55bcfc.netlify.app/api/receive-core-data";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getApiSecret() {
  return process.env.DATA_BRIDGE_API_SECRET || process.env.VITE_DATA_BRIDGE_API_SECRET || "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to forward vessels payload to Data Bridge.";
}

function cleanText(value: unknown, fallback = "N/A") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function readFirst(source: Record<string, unknown>, keys: string[], fallback: unknown = "N/A") {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function cleanNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanImo(value: unknown) {
  const rawValue = String(value ?? "").trim();
  const digits = rawValue.replace(/\D/g, "");
  return digits.length === 7 ? digits : rawValue || "N/A";
}

function getVesselsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const source = payload as Record<string, unknown>;
  if (Array.isArray(source.vessels)) return source.vessels;
  if (Array.isArray(source.buques)) return source.buques;
  if (Array.isArray(source.selectedVessels)) return source.selectedVessels;
  return [];
}

function normalizeCoreVessel(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    IMO: cleanImo(readFirst(source, ["IMO", "imo", "numero_imo", "imoNumber", "numeroIMO"], "")),
    nombre: cleanText(readFirst(source, ["nombre", "name", "vessel_name", "vesselName", "ShipName"], "")),
    dwt: cleanNumber(readFirst(source, ["dwt", "DWT", "deadweight", "dwt_ajustado"], 0)),
    mmsi: cleanText(readFirst(source, ["mmsi", "MMSI"], "")),
    type: cleanText(readFirst(source, ["type", "vessel_type", "tipo", "tipo_buque"], "")),
    draft: cleanNumber(readFirst(source, ["draft", "Draft", "draft_meters", "calado"], 0)),
    flag: cleanText(readFirst(source, ["flag", "Flag", "bandera"], "")),
    eta: cleanText(readFirst(source, ["eta", "ETA", "eta_puerto_carga", "estimatedEta", "etaEstimated"], "")),
    ultimo_puerto: cleanText(readFirst(source, ["ultimo_puerto", "last_port", "lastPort", "lastPortOfCall"], "")),
    destino_actual: cleanText(readFirst(source, ["destino_actual", "destination", "plannedDestination"], "")),
    eta_puerto_carga: cleanText(readFirst(source, ["eta_puerto_carga", "eta", "ETA"], "")),
    eta_delta: cleanText(readFirst(source, ["eta_delta"], "")),
    numero_imo: cleanText(readFirst(source, ["numero_imo", "IMO", "imo", "imoNumber"], "")),
    tipo_buque: cleanText(readFirst(source, ["tipo_buque", "vessel_type", "type", "tipo"], "")),
    ano_construccion: cleanText(readFirst(source, ["ano_construccion", "year_built", "builtYear", "built_year", "built"], "")),
    bandera: cleanText(readFirst(source, ["bandera", "flag", "Flag"], "")),
    armador_manager: cleanText(readFirst(source, ["armador_manager", "owner_manager", "armador", "owner", "manager", "operator"], "")),
    gruas_geared: Boolean(readFirst(source, ["gruas_geared", "has_gears", "hasCranes", "gruas"], false)),
    estadoProcesos: cleanText(readFirst(source, ["estadoProcesos", "status", "audit_status", "auditStatus"], "")),
  };
}

function buildCoreDataPayload(payload: unknown) {
  return {
    vessels: getVesselsFromPayload(payload)
      .map(normalizeCoreVessel)
      .filter((vessel) => vessel.IMO !== "N/A" || vessel.nombre !== "N/A"),
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ success: false, error: "Payload JSON inválido." }, { status: 400, headers: jsonHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const apiKey = getApiSecret();
    const coreDataPayload = buildCoreDataPayload(payload);

    if (coreDataPayload.vessels.length === 0) {
      return Response.json(
        { success: false, error: "No valid vessels were provided" },
        { status: 400, headers: jsonHeaders },
      );
    }

    console.log(`[Data Bridge] Forwarding vessels payload to: ${DATA_BRIDGE_RECEIVE_CORE_DATA_URL}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["x-api-key"] = apiKey;
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const bridgeResponse = await fetch(DATA_BRIDGE_RECEIVE_CORE_DATA_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(coreDataPayload),
      signal: controller.signal,
    });

    const responseBody = await bridgeResponse.text();

    if (bridgeResponse.status === 404) {
      console.error("Error: El endpoint de Data Bridge no fue encontrado. Verifica la URL de recepción");
    }

    if (!bridgeResponse.ok) {
      return new Response(responseBody || JSON.stringify({ success: false, error: `Data Bridge responded ${bridgeResponse.status}` }), {
        status: bridgeResponse.status,
        headers: {
          ...jsonHeaders,
          "content-type": bridgeResponse.headers.get("content-type") || jsonHeaders["content-type"],
        },
      });
    }

    return new Response(responseBody, {
      status: bridgeResponse.status,
      headers: {
        ...jsonHeaders,
        "content-type": bridgeResponse.headers.get("content-type") || jsonHeaders["content-type"],
      },
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError";
    const status = isTimeout ? 504 : 500;

    console.error("[Data Bridge] Error forwarding vessels payload:", error);

    return Response.json(
      { success: false, error: isTimeout ? "Data Bridge request timed out." : getErrorMessage(error) },
      { status, headers: jsonHeaders },
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const config: Config = {
  path: ["/api/receive-vessels", "/.netlify/functions/receive-vessels"],
};
