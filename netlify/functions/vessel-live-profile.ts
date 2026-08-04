import type { Config, Context } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

type VesselMasterRow = QueryResultRow & {
  imo_number: number | string | null;
  vessel_name: string | null;
  mmsi: string | null;
  vessel_type: string | null;
  flag: string | null;
  dwt: number | null;
  latitude: number | null;
  longitude: number | null;
  current_destination: string | null;
  last_port: string | null;
  eta: Date | string | null;
  fecha_ultima_actualizacion: Date | string | null;
  source_payload: unknown;
};

type AisVesselRow = QueryResultRow & {
  imo_number: string;
  vessel_name: string | null;
  mmsi: string | null;
  vessel_type: string | null;
  latitude: number;
  longitude: number;
  source: string;
  audit_status: string;
  raw_data: unknown;
  last_seen_at: Date | string;
};

type OpenShipsTelemetryRow = QueryResultRow & {
  vessel_key: string;
  mmsi: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  latitude: number;
  longitude: number;
  speed_over_ground: number | null;
  course_over_ground: number | null;
  heading: number | null;
  observed_at: Date | string | null;
  fetched_at: Date | string;
  raw_data: unknown;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function firstValue(scopes: UnknownRecord[], keys: string[]): unknown {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return null;
}

function textValue(scopes: UnknownRecord[], keys: string[]): string | null {
  const value = firstValue(scopes, keys);
  const text = String(value ?? "").trim();
  return text || null;
}

function numberValue(scopes: UnknownRecord[], keys: string[]): number | null {
  const value = firstValue(scopes, keys);
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoValue(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeQuery(value: string | null): string {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:NOVI\b[\s:|/_-]*)+/i, "")
    .trim();
  const identifierMatch = normalized.match(/^(?:IMO|MMSI)?[\s:#/_-]*([\d\s.-]+)$/i);
  if (!identifierMatch) return normalized;
  const digits = identifierMatch[1].replace(/\D/g, "");
  return digits.length === 7 || digits.length === 9 ? digits : normalized;
}

function normalizeImo(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
}

function normalizeMmsi(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

export default async (request: Request, context: Context) => {
  if (request.method !== "GET") {
    return Response.json({ success: false, error: "Método no permitido." }, { status: 405 });
  }

  const url = new URL(request.url);
  const query = normalizeQuery(url.searchParams.get("q") || url.searchParams.get("imo") || url.searchParams.get("name"));
  if (query.length < 2 || query.length > 80) {
    return Response.json({ success: false, error: "Introduce un IMO, MMSI o nombre de buque válido." }, { status: 400 });
  }

  const imo = normalizeImo(query);
  const mmsi = normalizeMmsi(query);

  try {
    const masterResult = await getPool().query<VesselMasterRow>(
      `
        SELECT
          imo_number,
          vessel_name,
          mmsi,
          vessel_type,
          flag,
          dwt,
          latitude,
          longitude,
          current_destination,
          last_port,
          eta,
          fecha_ultima_actualizacion,
          source_payload
        FROM vessels_master
        WHERE ($2 <> '' AND imo_number::text = $2)
          OR ($3 <> '' AND mmsi = $3)
          OR lower(vessel_name) = lower($1)
          OR vessel_name ILIKE '%' || $1 || '%'
        ORDER BY
          CASE WHEN $2 <> '' AND imo_number::text = $2 THEN 0 ELSE 1 END,
          CASE WHEN $3 <> '' AND mmsi = $3 THEN 0 ELSE 1 END,
          CASE WHEN lower(vessel_name) = lower($1) THEN 0 ELSE 1 END,
          fecha_ultima_actualizacion DESC NULLS LAST
        LIMIT 1
      `,
      [query, imo, mmsi],
    );

    const master = masterResult.rows[0] || null;
    const resolvedImo = String(master?.imo_number || imo || "").replace(/\D/g, "");
    const resolvedMmsi = String(master?.mmsi || mmsi || "").trim();
    const resolvedName = String(master?.vessel_name || query).trim();

    const openShipsResult = await getPool().query<OpenShipsTelemetryRow>(
      `
        SELECT
          vessel_key,
          mmsi::text,
          vessel_name,
          vessel_type,
          latitude,
          longitude,
          speed_over_ground,
          course_over_ground,
          heading,
          observed_at,
          fetched_at,
          raw_data
        FROM ais_telemetry_buffer
        WHERE fetched_at >= NOW() - INTERVAL '24 hours'
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND (
            ($2 <> '' AND regexp_replace(COALESCE(raw_data->>'imo', raw_data->>'IMO', raw_data->>'imo_number', ''), '\\D', '', 'g') = $2)
            OR ($3 <> '' AND mmsi::text = $3)
            OR lower(vessel_name) = lower($4)
            OR vessel_name ILIKE '%' || $1 || '%'
          )
        ORDER BY
          CASE WHEN $3 <> '' AND mmsi::text = $3 THEN 0 ELSE 1 END,
          CASE WHEN $2 <> '' AND regexp_replace(COALESCE(raw_data->>'imo', raw_data->>'IMO', raw_data->>'imo_number', ''), '\\D', '', 'g') = $2 THEN 0 ELSE 1 END,
          CASE WHEN lower(vessel_name) = lower($4) THEN 0 ELSE 1 END,
          COALESCE(observed_at, fetched_at) DESC NULLS LAST
        LIMIT 1
      `,
      [query, resolvedImo, resolvedMmsi, resolvedName],
    );

    const aisResult = await getPool().query<AisVesselRow>(
      `
        SELECT
          imo_number,
          vessel_name,
          mmsi,
          vessel_type,
          latitude,
          longitude,
          source,
          audit_status,
          raw_data,
          last_seen_at
        FROM ais_vessels
        WHERE ($2 <> '' AND regexp_replace(imo_number, '\\D', '', 'g') = $2)
          OR ($3 <> '' AND mmsi = $3)
          OR lower(vessel_name) = lower($4)
          OR vessel_name ILIKE '%' || $1 || '%'
        ORDER BY
          CASE WHEN $2 <> '' AND regexp_replace(imo_number, '\\D', '', 'g') = $2 THEN 0 ELSE 1 END,
          CASE WHEN $3 <> '' AND mmsi = $3 THEN 0 ELSE 1 END,
          CASE WHEN lower(vessel_name) = lower($4) THEN 0 ELSE 1 END,
          CASE WHEN audit_status = 'VALIDATED' THEN 0 ELSE 1 END,
          last_seen_at DESC
        LIMIT 1
      `,
      [query, resolvedImo, resolvedMmsi, resolvedName],
    );

    const openShips = openShipsResult.rows[0] || null;
    const ais = aisResult.rows[0] || null;
    if (!master && !openShips && !ais) {
      return Response.json({
        success: true,
        found: false,
        query,
        vessel: null,
        message: "No se encontró ningún buque con ese IMO, MMSI o nombre.",
      }, { headers: { "cache-control": "no-store" } });
    }

    const masterPayload = asRecord(master?.source_payload);
    const openShipsPayload = asRecord(openShips?.raw_data);
    const aisPayload = asRecord(ais?.raw_data);
    const aisMetadata = asRecord(aisPayload.MetaData || aisPayload.metadata);
    const aisMessage = asRecord(aisPayload.Message || aisPayload.message);
    const aisPosition = asRecord(aisMessage.PositionReport || aisMessage.positionReport || aisPayload.position || aisPayload.positionReport);
    const aisStatic = asRecord(aisMessage.ShipStaticData || aisMessage.shipStaticData || aisPayload.ShipStaticData || aisPayload.shipStaticData);
    const scopes = [openShipsPayload, aisPosition, aisStatic, aisMessage, aisMetadata, aisPayload, masterPayload];
    const latitude = openShips?.latitude ?? ais?.latitude ?? master?.latitude ?? null;
    const longitude = openShips?.longitude ?? ais?.longitude ?? master?.longitude ?? null;
    const hasPosition = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    const vesselName = openShips?.vessel_name || ais?.vessel_name || master?.vessel_name || textValue(scopes, ["ShipName", "vesselName", "vessel_name", "name"]) || query;

    const positionUpdatedAt = isoValue(openShips?.observed_at || openShips?.fetched_at || ais?.last_seen_at || master?.fecha_ultima_actualizacion || null);
    const vessel = {
      name: vesselName,
      imo: ais?.imo_number || master?.imo_number || textValue(scopes, ["IMO", "imo", "imo_number"]),
      mmsi: openShips?.mmsi || ais?.mmsi || master?.mmsi || textValue(scopes, ["MMSI", "mmsi"]),
      vesselType: openShips?.vessel_type || ais?.vessel_type || master?.vessel_type || textValue(scopes, ["ShipType", "vesselType", "vessel_type"]),
      flag: master?.flag || textValue(scopes, ["Flag", "flag"]),
      dwt: master?.dwt ?? numberValue(scopes, ["DWT", "dwt", "deadweight"]),
      destination: master?.current_destination || textValue(scopes, ["Destination", "destination", "currentDestination"]),
      lastPort: master?.last_port || textValue(scopes, ["LastPort", "lastPort", "last_port"]),
      eta: isoValue(master?.eta || null) || textValue(scopes, ["ETA", "eta"]),
      lat: hasPosition ? Number(latitude) : null,
      lon: hasPosition ? Number(longitude) : null,
      speed: openShips?.speed_over_ground ?? numberValue(scopes, ["SpeedOverGround", "speedOverGround", "speed_over_ground", "SOG", "sog"]),
      cog: openShips?.course_over_ground ?? numberValue(scopes, ["CourseOverGround", "courseOverGround", "course_over_ground", "COG", "cog"]),
      heading: openShips?.heading ?? numberValue(scopes, ["TrueHeading", "trueHeading", "heading", "Heading"]),
      timestamp: positionUpdatedAt,
      position: hasPosition
        ? { lat: Number(latitude), lng: Number(longitude), latitude: Number(latitude), longitude: Number(longitude) }
        : null,
      positionUpdatedAt,
      positionSource: openShips ? "OPENSHIPS" : (ais?.source || (latitude !== null && longitude !== null ? "vessels_master" : null)),
      telemetryLive: Boolean(openShips),
      auditStatus: ais?.audit_status || masterPayload.audit_status || null,
    };

    return Response.json({
      success: true,
      found: true,
      generatedAt: new Date().toISOString(),
      vessel: {
        ...vessel,
        speedKnots: vessel.speed,
        course: vessel.cog,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[vessel-live-profile] Lookup failed.", {
      requestId: context.requestId,
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ success: false, error: "No fue posible consultar el maestro de buques y AIS." }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/v1/vessel/live-profile",
  method: "GET",
};
