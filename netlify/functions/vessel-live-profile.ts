import type { Config, Context } from "@netlify/functions";
import { createRequire } from "node:module";
import * as cheerio from "cheerio";
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

type AisStreamSocket = {
  on(event: "open" | "error" | "close", listener: () => void): void;
  on(event: "message", listener: (data: unknown) => void): void;
  send(payload: string): void;
  close(): void;
  terminate?(): void;
};

type AisStreamSocketConstructor = new (endpoint: string) => AisStreamSocket;

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

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function mergeRecord(left: unknown, right: unknown): UnknownRecord {
  return { ...asRecord(left), ...asRecord(right) };
}

export function normalizeAisStreamSnapshot(value: unknown): UnknownRecord {
  const root = asRecord(value);
  const metadata = asRecord(root.MetaData || root.metadata);
  const message = asRecord(root.Message || root.message);
  const position = asRecord(
    message.PositionReport
    || message.StandardClassBPositionReport
    || message.ExtendedClassBPositionReport
    || root.PositionReport
    || root.StandardClassBPositionReport
    || root.ExtendedClassBPositionReport
    || root.position,
  );
  const staticData = asRecord(message.ShipStaticData || root.ShipStaticData || root.shipStaticData);
  const scopes = [root, metadata, message, position, staticData];
  const latitude = numberValue(scopes, ["Latitude", "latitude", "lat"]);
  const longitude = numberValue(scopes, ["Longitude", "longitude", "lon", "lng"]);
  const mmsi = digitsOnly(firstValue(scopes, ["MMSI", "mmsi", "UserID", "userId"]));
  return {
    name: textValue(scopes, ["ShipName", "shipName", "vesselName", "vessel_name", "Name", "name"]),
    imo: digitsOnly(firstValue(scopes, ["IMO", "imo", "ImoNumber", "imoNumber", "imo_number"])) || null,
    mmsi: mmsi || null,
    latitude,
    longitude,
    destination: textValue(scopes, ["Destination", "destination", "PortOfDestination", "currentDestination"]),
    vesselType: textValue(scopes, ["ShipType", "shipType", "Type", "vesselType", "vessel_type"]),
    speed: numberValue(scopes, ["Sog", "SOG", "sog", "SpeedOverGround", "speedOverGround", "speed"]),
    cog: numberValue(scopes, ["Cog", "COG", "cog", "CourseOverGround", "courseOverGround", "course"]),
    heading: numberValue(scopes, ["TrueHeading", "trueHeading", "Heading", "heading"]),
    timestamp: textValue(scopes, ["time_utc", "timestamp", "Timestamp", "receivedAt"]),
    rawData: root,
  };
}

async function fetchAisStreamSnapshot(mmsi: string, timeoutMs = 4_000): Promise<UnknownRecord | null> {
  const apiKey = String(process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY || "").trim();
  if (!apiKey || !/^\d{9}$/.test(mmsi)) return null;
  const endpoint = String(process.env.AISSTREAM_WS_URL || "wss://stream.aisstream.io/v0/stream").trim();
  const WebSocketClient = createRequire(`${process.cwd()}/package.json`)("ws") as AisStreamSocketConstructor;

  return await new Promise((resolve) => {
    let socket: AisStreamSocket | null = null;
    let snapshot: UnknownRecord = {};
    let settled = false;
    let positionTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (positionTimer) clearTimeout(positionTimer);
      try {
        if (socket?.terminate) socket.terminate();
        else socket?.close();
      } catch {}
      const latitude = numberValue([snapshot], ["latitude"]);
      const longitude = numberValue([snapshot], ["longitude"]);
      resolve(Number.isFinite(latitude) && Number.isFinite(longitude) ? snapshot : null);
    };

    const timeoutTimer = setTimeout(finish, Math.max(1_500, Math.min(8_000, timeoutMs)));
    try {
      socket = new WebSocketClient(endpoint);
      socket.on("open", () => {
        socket?.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
          FiltersShipMMSI: [mmsi],
        }));
      });
      socket.on("message", (data) => {
        try {
          const incoming = normalizeAisStreamSnapshot(JSON.parse(String(data)));
          if (digitsOnly(incoming.mmsi) !== mmsi) return;
          snapshot = {
            ...snapshot,
            ...Object.fromEntries(Object.entries(incoming).filter(([, fieldValue]) => fieldValue !== null && fieldValue !== "")),
            rawData: mergeRecord(snapshot.rawData, incoming.rawData),
          };
          if (Number.isFinite(Number(snapshot.latitude)) && Number.isFinite(Number(snapshot.longitude)) && !positionTimer) {
            positionTimer = setTimeout(finish, 600);
          }
        } catch {}
      });
      socket.on("error", finish);
      socket.on("close", finish);
    } catch {
      finish();
    }
  });
}

async function resolveVesselFinderSnapshot(imo: string): Promise<UnknownRecord | null> {
  if (!/^\d{7}$/.test(imo)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://www.vesselfinder.com/vessels/details/${imo}`, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "SeaCharterCorePRO/1.0 fleet-intelligence-capture",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    const dataJson = $("[data-json*='ship_lat']").first().attr("data-json");
    let liveData: UnknownRecord = {};
    try {
      liveData = asRecord(dataJson ? JSON.parse(dataJson) : null);
    } catch {}
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const mmsi = digitsOnly(liveData.mmsi || bodyText.match(/\bMMSI\s*[:#-]?\s*(\d{9})\b/i)?.[1]);
    const destinationLabel = $(".vilabel").filter((_, element) => $(element).text().trim().toLowerCase() === "destination").first();
    const destination = destinationLabel.closest(".vi__r1, .vi__r2, .flx").find("a._npNa, a[href*='/ports/'], ._value").first().text().trim();
    const latitude = numberValue([liveData], ["ship_lat", "latitude", "lat"]);
    const longitude = numberValue([liveData], ["ship_lon", "longitude", "lon"]);
    if (!mmsi && latitude === null && longitude === null) return null;
    return {
      imo,
      mmsi: mmsi || null,
      name: $("h1").first().text().trim() || $("title").text().split("-")[0].trim() || null,
      destination: destination || null,
      latitude,
      longitude,
      speed: numberValue([liveData], ["ship_sog"]),
      cog: numberValue([liveData], ["ship_cog"]),
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
        WHERE ($2 <> '' AND regexp_replace(COALESCE(
            imo_number::text,
            source_payload->>'imo',
            source_payload->>'IMO',
            source_payload->>'imo_number',
            source_payload#>>'{MetaData,IMO}',
            source_payload#>>'{Message,ShipStaticData,ImoNumber}',
            ''
          ), '\\D', '', 'g') = $2)
          OR ($3 <> '' AND regexp_replace(COALESCE(mmsi, source_payload->>'mmsi', source_payload#>>'{MetaData,MMSI}', ''), '\\D', '', 'g') = $3)
          OR lower(vessel_name) = lower($1)
          OR vessel_name ILIKE '%' || $1 || '%'
        ORDER BY
          CASE WHEN $2 <> '' AND regexp_replace(COALESCE(imo_number::text, source_payload->>'imo', source_payload->>'IMO', source_payload#>>'{MetaData,IMO}', ''), '\\D', '', 'g') = $2 THEN 0 ELSE 1 END,
          CASE WHEN $3 <> '' AND regexp_replace(COALESCE(mmsi, source_payload->>'mmsi', source_payload#>>'{MetaData,MMSI}', ''), '\\D', '', 'g') = $3 THEN 0 ELSE 1 END,
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
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND (
            ($2 <> '' AND regexp_replace(COALESCE(
              raw_data->>'imo',
              raw_data->>'IMO',
              raw_data->>'imo_number',
              raw_data#>>'{MetaData,IMO}',
              raw_data#>>'{Message,ShipStaticData,ImoNumber}',
              raw_data#>>'{ShipStaticData,ImoNumber}',
              ''
            ), '\\D', '', 'g') = $2)
            OR ($3 <> '' AND mmsi::text = $3)
            OR lower(vessel_name) = lower($4)
            OR vessel_name ILIKE '%' || $1 || '%'
          )
        ORDER BY
          CASE WHEN $3 <> '' AND mmsi::text = $3 THEN 0 ELSE 1 END,
          CASE WHEN $2 <> '' AND regexp_replace(COALESCE(raw_data->>'imo', raw_data->>'IMO', raw_data->>'imo_number', raw_data#>>'{MetaData,IMO}', raw_data#>>'{Message,ShipStaticData,ImoNumber}', ''), '\\D', '', 'g') = $2 THEN 0 ELSE 1 END,
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
    const vesselFinderSnapshot = resolvedImo ? await resolveVesselFinderSnapshot(resolvedImo) : null;
    const liveMmsi = digitsOnly(resolvedMmsi || openShips?.mmsi || ais?.mmsi || master?.mmsi || vesselFinderSnapshot?.mmsi);
    let liveAisStream: UnknownRecord | null = null;
    let liveFetchAttempted = false;

    if (liveMmsi.length === 9) {
      liveFetchAttempted = true;
      try {
        liveAisStream = await fetchAisStreamSnapshot(liveMmsi);
      } catch (error) {
        console.warn("[vessel-live-profile] AISStream lookup unavailable; using local fallback.", {
          requestId: context.requestId,
          code: error instanceof Error && "code" in error ? String(error.code) : "AISSTREAM_UNAVAILABLE",
        });
      }
    }

    if (!master && !liveAisStream && !openShips && !ais && !vesselFinderSnapshot) {
      return Response.json({
        success: true,
        found: false,
        query,
        vessel: null,
        message: "No se encontró ningún buque con ese IMO, MMSI o nombre.",
      }, { headers: { "cache-control": "no-store" } });
    }

    const masterPayload = asRecord(master?.source_payload);
    const masterMetadata = asRecord(masterPayload.MetaData || masterPayload.metadata);
    const masterMessage = asRecord(masterPayload.Message || masterPayload.message);
    const masterPosition = asRecord(masterMessage.PositionReport || masterMessage.positionReport || masterPayload.PositionReport || masterPayload.position);
    const masterStatic = asRecord(masterMessage.ShipStaticData || masterMessage.shipStaticData || masterPayload.ShipStaticData || masterPayload.shipStaticData);
    const openShipsPayload = asRecord(openShips?.raw_data);
    const aisPayload = asRecord(ais?.raw_data);
    const aisMetadata = asRecord(aisPayload.MetaData || aisPayload.metadata);
    const aisMessage = asRecord(aisPayload.Message || aisPayload.message);
    const aisPosition = asRecord(aisMessage.PositionReport || aisMessage.positionReport || aisPayload.position || aisPayload.positionReport);
    const aisStatic = asRecord(aisMessage.ShipStaticData || aisMessage.shipStaticData || aisPayload.ShipStaticData || aisPayload.shipStaticData);
    const scopes = [liveAisStream || {}, openShipsPayload, aisPosition, aisStatic, aisMessage, aisMetadata, aisPayload, masterPosition, masterStatic, masterMessage, masterMetadata, masterPayload, vesselFinderSnapshot || {}];
    const latitude = numberValue([liveAisStream || {}], ["latitude", "lat"])
      ?? openShips?.latitude ?? ais?.latitude ?? master?.latitude
      ?? numberValue([vesselFinderSnapshot || {}], ["latitude", "lat"])
      ?? numberValue(scopes, ["Latitude", "latitude", "lat", "AIS_Live_Lat"]);
    const longitude = numberValue([liveAisStream || {}], ["longitude", "lon", "lng"])
      ?? openShips?.longitude ?? ais?.longitude ?? master?.longitude
      ?? numberValue([vesselFinderSnapshot || {}], ["longitude", "lon", "lng"])
      ?? numberValue(scopes, ["Longitude", "longitude", "lon", "lng", "AIS_Live_Lon"]);
    const hasPosition = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    const vesselName = textValue([liveAisStream || {}], ["vesselName", "vessel_name", "ShipName", "name"])
      || openShips?.vessel_name || ais?.vessel_name || master?.vessel_name || textValue([vesselFinderSnapshot || {}], ["name"]) || textValue(scopes, ["ShipName", "vesselName", "vessel_name", "name"]) || query;

    const positionUpdatedAt = textValue([liveAisStream || {}], ["timestamp", "observedAt", "observed_at", "time"])
      || isoValue(openShips?.observed_at || openShips?.fetched_at || ais?.last_seen_at || master?.fecha_ultima_actualizacion || null)
      || textValue([vesselFinderSnapshot || {}], ["timestamp"]);
    const vessel = {
      name: vesselName,
      imo: textValue([liveAisStream || {}], ["imo", "IMO", "imo_number"]) || ais?.imo_number || master?.imo_number || resolvedImo || textValue(scopes, ["IMO", "imo", "imo_number"]),
      mmsi: textValue([liveAisStream || {}], ["mmsi", "MMSI"]) || openShips?.mmsi || ais?.mmsi || master?.mmsi || textValue([vesselFinderSnapshot || {}], ["mmsi"]) || textValue(scopes, ["MMSI", "mmsi"]),
      vesselType: textValue([liveAisStream || {}], ["vesselType", "vessel_type", "ShipType", "shipType"]) || openShips?.vessel_type || ais?.vessel_type || master?.vessel_type || textValue(scopes, ["ShipType", "vesselType", "vessel_type"]),
      flag: master?.flag || textValue(scopes, ["Flag", "flag"]),
      dwt: master?.dwt ?? numberValue(scopes, ["DWT", "dwt", "deadweight"]),
      destination: textValue([liveAisStream || {}], ["Destination", "destination", "currentDestination"]) || master?.current_destination || textValue([vesselFinderSnapshot || {}], ["destination"]) || textValue(scopes, ["Destination", "destination", "currentDestination"]),
      lastPort: master?.last_port || textValue(scopes, ["LastPort", "lastPort", "last_port"]),
      eta: isoValue(master?.eta || null) || textValue(scopes, ["ETA", "eta"]),
      lat: hasPosition ? Number(latitude) : null,
      lon: hasPosition ? Number(longitude) : null,
      speed: numberValue([liveAisStream || {}], ["speed", "speed_over_ground", "SpeedOverGround", "SOG", "sog"]) ?? openShips?.speed_over_ground ?? numberValue(scopes, ["SpeedOverGround", "speedOverGround", "speed_over_ground", "SOG", "sog"]),
      cog: numberValue([liveAisStream || {}], ["course", "course_over_ground", "CourseOverGround", "COG", "cog"]) ?? openShips?.course_over_ground ?? numberValue(scopes, ["CourseOverGround", "courseOverGround", "course_over_ground", "COG", "cog"]),
      heading: numberValue([liveAisStream || {}], ["heading", "TrueHeading", "trueHeading", "Heading"]) ?? openShips?.heading ?? numberValue(scopes, ["TrueHeading", "trueHeading", "heading", "Heading"]),
      timestamp: positionUpdatedAt,
      position: hasPosition
        ? { lat: Number(latitude), lng: Number(longitude), latitude: Number(latitude), longitude: Number(longitude) }
        : null,
      positionUpdatedAt,
      positionSource: liveAisStream ? "AISSTREAM_LIVE" : (openShips ? "OPENSHIPS_BUFFER" : (ais?.source || (master && hasPosition ? "vessels_master" : (vesselFinderSnapshot && hasPosition ? "VESSELFINDER_LIVE_FALLBACK" : null)))),
      telemetryLive: Boolean(liveAisStream),
      liveFetchAttempted,
      liveFetchedAt: liveAisStream ? new Date().toISOString() : null,
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
