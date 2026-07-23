import type { Config, Handler } from "@netlify/functions";
import { upsertRadarVesselsMaster, type RadarVesselMasterInput } from "../../db/vessels-master-sync.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

type NormalizedFleetVessel = {
  imo: string;
  name: string;
  dwt: number | null;
  mmsi: string | null;
  type: string | null;
  flag: string | null;
  draft: number | null;
  latitude: number | null;
  longitude: number | null;
  eta: string | null;
  lastPort: string | null;
  destination: string | null;
  raw: Record<string, unknown>;
};

function createResponse(
  statusCode: number,
  payload: { success: boolean; message: string; [key: string]: unknown },
) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  };
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function readFirstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = source[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return String(val).trim();
    }
  }
  return "";
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeImoNumber(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
}

function extractFleetVessels(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;

  if (Array.isArray(obj.fleet)) return obj.fleet;
  if (Array.isArray(obj.vessels)) return obj.vessels;
  if (Array.isArray(obj.buques)) return obj.buques;
  if (Array.isArray(obj.selectedVessels)) return obj.selectedVessels;

  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (Array.isArray(dataObj.fleet)) return dataObj.fleet;
    if (Array.isArray(dataObj.vessels)) return dataObj.vessels;
    if (Array.isArray(dataObj.buques)) return dataObj.buques;
  }

  if (obj.fleet && typeof obj.fleet === "object" && !Array.isArray(obj.fleet)) {
    const fleetObj = obj.fleet as Record<string, unknown>;
    if (Array.isArray(fleetObj.vessels)) return fleetObj.vessels;
    if (Array.isArray(fleetObj.buques)) return fleetObj.buques;
    if (Array.isArray(fleetObj.items)) return fleetObj.items;
  }

  return [];
}

function normalizeVesselItem(item: unknown, index: number): NormalizedFleetVessel | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const source = item as Record<string, unknown>;

  const imoKeys = ["imo", "IMO", "imoNumber", "imo_number", "numero_imo", "numeroIMO", "IMONumber"];
  const nameKeys = ["vesselName", "vessel_name", "nombre", "name", "ShipName", "shipName", "vessel"];
  const dwtKeys = ["dwt", "DWT", "deadweight", "dwt_ajustado"];
  const mmsiKeys = ["mmsi", "MMSI"];
  const typeKeys = ["vesselType", "vessel_type", "type", "tipo", "tipo_buque", "shipType"];
  const flagKeys = ["flag", "Flag", "bandera"];
  const draftKeys = ["draft", "Draft", "draft_meters", "calado"];
  const latKeys = ["latitude", "lat", "LAT", "AIS_Live_Lat", "Latitude"];
  const lonKeys = ["longitude", "lon", "lng", "LONG", "LON", "AIS_Live_Lon", "Longitude"];
  const etaKeys = ["eta", "ETA", "eta_puerto_carga", "estimatedEta"];
  const portKeys = ["lastPort", "last_port", "ultimo_puerto", "lastPortOfCall"];
  const destKeys = ["destination", "current_destination", "destino_actual", "plannedDestination"];

  const imo = normalizeImoNumber(readFirstString(source, imoKeys));
  const name = readFirstString(source, nameKeys) || (imo ? `IMO ${imo}` : `Buque #${index + 1}`);
  const mmsi = readFirstString(source, mmsiKeys) || null;

  if (!imo && !name && !mmsi) return null;

  return {
    imo: imo || "N/A",
    name: name || "Unknown Vessel",
    dwt: cleanNumber(readFirstString(source, dwtKeys)),
    mmsi,
    type: readFirstString(source, typeKeys) || null,
    flag: readFirstString(source, flagKeys) || null,
    draft: cleanNumber(readFirstString(source, draftKeys)),
    latitude: cleanNumber(readFirstString(source, latKeys)),
    longitude: cleanNumber(readFirstString(source, lonKeys)),
    eta: readFirstString(source, etaKeys) || null,
    lastPort: readFirstString(source, portKeys) || null,
    destination: readFirstString(source, destKeys) || null,
    raw: source,
  };
}

async function parseEventOrRequest(eventOrReq: unknown): Promise<{ method: string; body: unknown; syncId: string }> {
  if (!eventOrReq || typeof eventOrReq !== "object") {
    return { method: "POST", body: null, syncId: "" };
  }

  if (typeof (eventOrReq as Request).text === "function") {
    const req = eventOrReq as Request;
    const method = (req.method || "POST").toUpperCase();
    let body: unknown = null;
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
    }
    const syncId = String(
      (body as Record<string, unknown>)?.syncId ||
      (body as Record<string, unknown>)?.sync_id ||
      ""
    ).trim();
    return { method, body, syncId };
  }

  const evt = eventOrReq as Record<string, unknown>;
  const method = String(evt.httpMethod || evt.method || "POST").toUpperCase();
  let body: unknown = evt.body;
  if (typeof body === "string") {
    try {
      body = body.trim() ? JSON.parse(body) : null;
    } catch {
      body = null;
    }
  }
  const syncId = String(
    (body as Record<string, unknown>)?.syncId ||
    (body as Record<string, unknown>)?.sync_id ||
    ""
  ).trim();
  return { method, body, syncId };
}

export const handler: Handler = async (eventOrReq: unknown) => {
  try {
    const { method, body, syncId } = await parseEventOrRequest(eventOrReq);

    if (method === "OPTIONS") {
      return createResponse(200, {
        success: true,
        message: "CORS preflight OK",
      });
    }

    if (method !== "POST") {
      return createResponse(405, {
        success: false,
        message: "Método no permitido. Solo se admite POST.",
      });
    }

    if (!body || typeof body !== "object") {
      return createResponse(400, {
        success: false,
        message: "Cuerpo de solicitud JSON inválido o no proporcionado.",
      });
    }

    const rawVessels = extractFleetVessels(body);
    if (rawVessels.length === 0) {
      return createResponse(200, {
        success: true,
        message: "Carga útil de flota recibida sin buques para procesar.",
        syncId,
        receivedCount: 0,
        processedCount: 0,
        vessels: [],
      });
    }

    const normalizedVessels = rawVessels
      .map(normalizeVesselItem)
      .filter((v): v is NormalizedFleetVessel => v !== null);

    let persistedCount = 0;
    try {
      const masterRows: RadarVesselMasterInput[] = normalizedVessels
        .filter((v) => v.latitude !== null && v.longitude !== null && (v.latitude !== 0 || v.longitude !== 0))
        .map((v) => ({
          imoNumber: v.imo && v.imo !== "N/A" ? v.imo : null,
          mmsi: v.mmsi,
          vesselName: v.name,
          shipType: v.type,
          draught: v.draft,
          dwt: v.dwt,
          latitude: v.latitude!,
          longitude: v.longitude!,
          destination: v.destination,
          lastPortOfCall: v.lastPort,
          eta: v.eta,
          source: "Core PRO - receive-core-data",
          rawData: v.raw,
          flag: v.flag,
        }));

      if (masterRows.length > 0) {
        persistedCount = await upsertRadarVesselsMaster(masterRows);
      }
    } catch (dbError) {
      console.warn("[receive-core-data] Advertencia: No se pudo persistir en base de datos:", dbError);
    }

    return createResponse(200, {
      success: true,
      message: `Se procesaron ${normalizedVessels.length} buques de la flota correctamente.`,
      syncId: syncId || crypto.randomUUID(),
      receivedCount: rawVessels.length,
      processedCount: normalizedVessels.length,
      persistedCount,
      vessels: normalizedVessels.map((v) => ({
        imo: v.imo,
        nombre: v.name,
        name: v.name,
        dwt: v.dwt,
        mmsi: v.mmsi,
        tipo: v.type,
        type: v.type,
        status: "SYNCED",
      })),
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido al procesar los datos de la flota";
    console.error("[receive-core-data] Error procesando carga útil:", error);
    return createResponse(500, {
      success: false,
      message: `Error al procesar los datos de la flota: ${errorMessage}`,
      error: errorMessage,
    });
  }
};

export default handler;

export const config: Config = {
  path: ["/api/receive-core-data", "/.netlify/functions/receive-core-data", "/api/databridge/receive-core-data"],
};
