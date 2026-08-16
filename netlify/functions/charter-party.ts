import type { Config, Context } from "@netlify/functions";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { voyagesTracking } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

type UnknownRecord = Record<string, unknown>;

const CONTRACT_PATTERN = /^[A-Z0-9][A-Z0-9/_-]{2,79}$/;

function headersFor(request: Request) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...createCorsHeaders(request, "POST, OPTIONS"),
  };
}

function errorResponse(request: Request, status: number, error: string) {
  return Response.json({ success: false, error }, { status, headers: headersFor(request) });
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 180) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanCoordinate(value: unknown, minimum: number, maximum: number) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : null;
}

function cleanTimestamp(value: unknown) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00.000Z`)
    : new Date(text);
  return Number.isNaN(safeDate.getTime()) ? null : safeDate;
}

function emptyStringsToNull<T>(value: T): T {
  if (value === "") return null as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(emptyStringsToNull) as T;
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, emptyStringsToNull(nestedValue)]),
    ) as T;
  }
  return value;
}

export default async (request: Request, context: Context) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(request) });
  if (request.method !== "POST") return errorResponse(request, 405, "Método no permitido.");

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return errorResponse(request, 400, "El body debe ser un JSON válido.");
  if (Object.values(body).some((value) => isRecord(value) || Array.isArray(value))) {
    return errorResponse(request, 400, "El payload del Charter Party debe contener exclusivamente campos planos.");
  }

  const contractRef = cleanText(body.contractRef, 80).toUpperCase();
  const imoNumber = cleanText(body.imoNumber, 16).replace(/\D/g, "");
  const polName = cleanText(body.polName);
  const podName = cleanText(body.podName);
  const vesselName = cleanText(body.vesselName) || (imoNumber ? `Buque IMO ${imoNumber}` : "");
  const laydaysStartAt = cleanTimestamp(body.laydaysStartAt);
  const cancellingAt = cleanTimestamp(body.cancellingAt);
  const polLatitude = cleanCoordinate(body.polLatitude, -90, 90);
  const polLongitude = cleanCoordinate(body.polLongitude, -180, 180);
  const podLatitude = cleanCoordinate(body.podLatitude, -90, 90);
  const podLongitude = cleanCoordinate(body.podLongitude, -180, 180);

  if (!CONTRACT_PATTERN.test(contractRef)) return errorResponse(request, 400, "La referencia contractual no es válida.");
  if (!/^\d{7}$/.test(imoNumber)) return errorResponse(request, 400, "El IMO del buque debe contener 7 dígitos.");
  if (!polName || !podName) return errorResponse(request, 400, "POL y POD son obligatorios.");
  if (!laydaysStartAt || !cancellingAt) return errorResponse(request, 400, "Laydays y Cancelling deben contener fechas válidas.");
  if (cancellingAt < laydaysStartAt) return errorResponse(request, 400, "La fecha de Cancelling no puede ser anterior a Laydays.");
  if (polLatitude === null || polLongitude === null || podLatitude === null || podLongitude === null) {
    return errorResponse(request, 400, "POL y POD deben tener coordenadas válidas antes de guardar.");
  }

  const cargoQuantityMt = Number(body.cargoQuantityMt);
  const ballastDistanceNm = Number(body.ballastDistanceNm);
  const vesselDwt = Number(body.vesselDwt);
  const vesselGt = Number(body.vesselGt);
  const vesselYearBuilt = Number(body.vesselYearBuilt);
  const savedAt = new Date();
  const charterPartyDetails = {
    charterPartyGeneratedAt: savedAt.toISOString(),
    ballastDistanceNm: Number.isFinite(ballastDistanceNm) && ballastDistanceNm >= 0 ? ballastDistanceNm : null,
    vesselDwt: Number.isFinite(vesselDwt) && vesselDwt > 0 ? vesselDwt : null,
    vesselGt: Number.isFinite(vesselGt) && vesselGt > 0 ? vesselGt : null,
    vesselFlag: cleanText(body.vesselFlag, 80) || null,
    vesselYearBuilt: Number.isFinite(vesselYearBuilt) && vesselYearBuilt > 0 ? Math.round(vesselYearBuilt) : null,
  };
  const values = {
    contractRef,
    polName,
    polLatitude,
    polLongitude,
    podName,
    podLatitude,
    podLongitude,
    laydaysStartAt,
    cancellingAt,
    vesselName,
    imoNumber,
    mmsi: cleanText(body.mmsi, 16) || null,
    cargoName: cleanText(body.cargoName) || "Carga contractual",
    cargoQuantityMt: Number.isFinite(cargoQuantityMt) && cargoQuantityMt > 0 ? cargoQuantityMt : 0,
    updatedAt: savedAt,
  };

  try {
    const existing = await db
      .select({ id: voyagesTracking.id, commercialDetails: voyagesTracking.commercialDetails })
      .from(voyagesTracking)
      .where(sql`upper(${voyagesTracking.contractRef}) = ${contractRef}`)
      .limit(1);
    const commercialDetails = {
      ...(isRecord(existing[0]?.commercialDetails) ? existing[0].commercialDetails : {}),
      ...charterPartyDetails,
    };
    const persistenceValues = emptyStringsToNull({ ...values, commercialDetails });

    const [savedVoyage] = existing[0]
      ? await db.update(voyagesTracking).set(persistenceValues).where(eq(voyagesTracking.id, existing[0].id)).returning()
      : await db.insert(voyagesTracking).values(persistenceValues).returning();

    return Response.json({
      success: true,
      reference: savedVoyage.contractRef,
      created: !existing[0],
    }, {
      status: existing[0] ? 200 : 201,
      headers: headersFor(request),
    });
  } catch (error) {
    console.error("[charter-party] Database persistence failed.", {
      requestId: context.requestId,
      contractRef,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({
      success: false,
      error: "Fallo DB",
    }, {
      status: 500,
      headers: headersFor(request),
    });
  }
};

export const config: Config = {
  path: "/api/v1/charter-party",
};
