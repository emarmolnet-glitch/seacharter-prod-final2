import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";
import { filterVesselsByTaxonomies, parseRequestedTaxonomies } from "./_shared/ais-taxonomy.js";
import { parseAisGeofence } from "./_shared/ais-geofence.js";
import {
  buildPortDestinationAliases,
  classifyCandidateMatch,
} from "./_shared/commercial-vessel-search.mjs";
import { fetchOpenShipsLive } from "./_shared/openships-rest.mjs";
import { filterStrictDryCargoVessels, validImo } from "./_shared/strict-dry-cargo.js";

type Vessel = Record<string, unknown>;
type MasterVesselRow = Vessel & {
  imo_number?: unknown;
  vessel_name?: unknown;
  dwt?: unknown;
  vessel_type?: unknown;
  draft_meters?: unknown;
  gross_tonnage?: unknown;
  loa_meters?: unknown;
  beam_meters?: unknown;
  year_built?: unknown;
  flag?: unknown;
  owner_manager?: unknown;
  has_gears?: unknown;
  source_payload?: unknown;
};
type OpenShipsDiagnostics = {
  httpStatus?: number | null;
  statusText?: string;
  message?: string;
  requestUrl?: string;
  clientFallback?: Record<string, unknown>;
};

function readOpenShipsDiagnostics(error: unknown): OpenShipsDiagnostics {
  if (!error || typeof error !== "object" || !("diagnostics" in error)) return {};
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
  return diagnostics && typeof diagnostics === "object" ? diagnostics as OpenShipsDiagnostics : {};
}

function finiteNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parsePayload(value: unknown): Vessel {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Vessel;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Vessel : {};
  } catch {
    return {};
  }
}

async function enrichOpenShipsSnapshot(vessels: Vessel[]) {
  const imoNumbers = [...new Set(vessels
    .map((vessel) => validImo(vessel.imo ?? vessel.IMO ?? vessel.imo_number))
    .filter(Boolean)
    .map(Number))];
  if (imoNumbers.length === 0) return { vessels, degraded: false, matched: 0 };

  let degraded = false;
  let rows: MasterVesselRow[] = [];
  try {
    const result = await getPool().query<MasterVesselRow>(
      `
        SELECT imo_number, vessel_name, dwt, mmsi, vessel_type, draft_meters,
          gross_tonnage, loa_meters, beam_meters, year_built, flag,
          owner_manager, has_gears, source_payload
        FROM vessels_master
        WHERE imo_number = ANY($1::integer[])
      `,
      [imoNumbers],
    );
    rows = result.rows;
  } catch (error) {
    degraded = true;
    console.error("[openships-live-status] Batch master lookup failed; raw OpenShips snapshot preserved.", error);
  }
  const masterByImo = new Map<string, MasterVesselRow>(rows
    .map((row) => [validImo(row.imo_number), row] as const)
    .filter(([imo]) => Boolean(imo)));
  let matched = 0;
  const enriched = vessels.flatMap((vessel) => {
    if (degraded) return [vessel];
    const imo = validImo(vessel.imo ?? vessel.IMO ?? vessel.imo_number);
    const master = imo ? masterByImo.get(imo) : null;
    if (!master) return [vessel];
    matched += 1;
    const sourcePayload = parsePayload(master.source_payload);
    return [{
      ...vessel,
      ...sourcePayload,
      imo,
      IMO: imo,
      imo_number: imo,
      vesselName: master.vessel_name ?? vessel.vesselName ?? vessel.vessel_name,
      vessel_name: master.vessel_name ?? vessel.vessel_name ?? vessel.vesselName,
      dwt: finiteNumber(master.dwt) ?? finiteNumber(vessel.dwt ?? vessel.DWT),
      DWT: finiteNumber(master.dwt) ?? finiteNumber(vessel.DWT ?? vessel.dwt),
      vesselType: master.vessel_type ?? vessel.vesselType ?? vessel.vessel_type,
      vessel_type: master.vessel_type ?? vessel.vessel_type ?? vessel.vesselType,
      draft: finiteNumber(master.draft_meters) ?? finiteNumber(vessel.draft),
      grossTonnage: finiteNumber(master.gross_tonnage),
      gross_tonnage: finiteNumber(master.gross_tonnage),
      loaMeters: finiteNumber(master.loa_meters),
      loa_meters: finiteNumber(master.loa_meters),
      beamMeters: finiteNumber(master.beam_meters),
      yearBuilt: finiteNumber(master.year_built),
      flag: master.flag ?? vessel.flag,
      ownerManager: master.owner_manager ?? vessel.ownerManager,
      hasGears: master.has_gears ?? vessel.hasGears,
      ballastSpeed: finiteNumber(sourcePayload.ballastSpeed ?? sourcePayload.spd_ballast ?? sourcePayload.speed_ballast),
      ladenSpeed: finiteNumber(sourcePayload.ladenSpeed ?? sourcePayload.spd_laden ?? sourcePayload.speed_laden),
      consumptionSea: finiteNumber(sourcePayload.consumptionSea ?? sourcePayload.cons_sea ?? sourcePayload.consumption_sea),
      consumptionPort: finiteNumber(sourcePayload.consumptionPort ?? sourcePayload.cons_port ?? sourcePayload.consumption_port),
      latitude: vessel.latitude ?? vessel.lat,
      lat: vessel.lat ?? vessel.latitude,
      longitude: vessel.longitude ?? vessel.lon ?? vessel.lng,
      lon: vessel.lon ?? vessel.longitude ?? vessel.lng,
      speed: vessel.speed ?? vessel.speed_over_ground ?? vessel.sog,
      masterTruthApplied: true,
    }];
  });
  return { vessels: enriched, degraded, matched };
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusNm = 3440.065;
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return radiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function vesselDistance(vessel: Vessel, latitude: number, longitude: number) {
  const vesselLatitude = finiteNumber(vessel.latitude ?? vessel.lat);
  const vesselLongitude = finiteNumber(vessel.longitude ?? vessel.lon ?? vessel.lng);
  if (vesselLatitude === null || vesselLongitude === null) return null;
  return haversineNm(latitude, longitude, vesselLatitude, vesselLongitude);
}

function vesselDestination(vessel: Vessel) {
  const metadata = vessel.MetaData && typeof vessel.MetaData === "object" ? vessel.MetaData as Vessel : {};
  return vessel.destination ?? vessel.Destination ?? vessel.current_destination ?? metadata.Destination ?? null;
}

function vesselEta(vessel: Vessel) {
  const metadata = vessel.MetaData && typeof vessel.MetaData === "object" ? vessel.MetaData as Vessel : {};
  return vessel.eta ?? vessel.ETA ?? metadata.ETA ?? null;
}

function vesselSpeed(vessel: Vessel) {
  return finiteNumber(vessel.speed_over_ground ?? vessel.speed ?? vessel.sog ?? vessel.SOG);
}

function getPolData(url: URL) {
  const polName = String(url.searchParams.get("polName") || "").trim();
  const polUnlocode = String(url.searchParams.get("polUnlocode") || url.searchParams.get("unlocode") || "").trim();
  return {
    name: polName,
    officialName: polName,
    unLocode: polUnlocode,
    aliases: buildPortDestinationAliases({ name: polName, officialName: polName, unLocode: polUnlocode }),
  };
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(req.url);
  const geofence = parseAisGeofence(url);
  if (!geofence) {
    return Response.json({ success: false, error: "Valid POL coordinates are required", vessels: [] }, { status: 400 });
  }

  const taxonomies = parseRequestedTaxonomies(url);
  if (url.searchParams.get("taxonomyMode") === "strict" && taxonomies.length === 0) {
    return Response.json({ success: false, error: "At least one valid vessel taxonomy is required", vessels: [] }, { status: 400 });
  }

  try {
    const requestedProviderLimit = Number(url.searchParams.get("providerLimit"));
    const live = await fetchOpenShipsLive({
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      limit: Number.isFinite(requestedProviderLimit) ? requestedProviderLimit : 5000,
      aisTypes: [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
    });
    const strictVessels = filterStrictDryCargoVessels(live.vessels);
    const taxonomyVessels = taxonomies.length > 0
      ? filterVesselsByTaxonomies(strictVessels, taxonomies)
      : strictVessels;
    const polData = getPolData(url);
    const laycanEnd = url.searchParams.get("laycanEnd") || url.searchParams.get("cancellingDate");
    const commercialVessels = taxonomyVessels.flatMap((vessel) => {
      const distanceNm = vesselDistance(vessel, geofence.latitude, geofence.longitude);
      const matchReason = classifyCandidateMatch({
        distanceNm,
        radiusNm: geofence.radiusNm,
        destination: vesselDestination(vessel),
        polData,
        eta: vesselEta(vessel),
        speedKnots: vesselSpeed(vessel),
        laycanEnd,
      });
      if (!matchReason) return [];
      return [{
        ...vessel,
        distance_to_pol_nm: distanceNm,
        distance_nm: distanceNm,
        matchReason,
        inboundToPol: matchReason === "INBOUND_TO_POL",
        longDistanceTransitToPol: matchReason === "INBOUND_TO_POL",
        fetched_at: live.fetchedAt,
      }];
    });
    const masterEnrichment = await enrichOpenShipsSnapshot(commercialVessels);
    const vessels = masterEnrichment.vessels;
    const degraded = masterEnrichment.degraded;
    const warnings = live.count === 0
      ? [{
        code: "OPENSHIPS_EMPTY_PROVIDER_PAYLOAD",
        message: `OpenShips returned JSON but no vessel rows were recognized. Top-level keys: ${live.providerDiagnostics.topLevelKeys.join(", ") || "none"}`,
        requestUrl: live.providerDiagnostics.requestUrl,
      }]
      : vessels.length === 0
        ? [{
          code: "OPENSHIPS_FILTERED_EMPTY",
          message: `OpenShips returned ${live.count} vessels, but none matched the active taxonomy, geofence, destination, or laycan filters.`,
          requestUrl: live.providerDiagnostics.requestUrl,
        }]
        : [];

    return Response.json({
      success: true,
      source: "OPENSHIPS_REST_LIVE",
      cache: "disabled",
      fetchedAt: live.fetchedAt,
      providerCount: live.count,
      taxonomyCount: taxonomyVessels.length,
      recent_vessels: vessels.length,
      count: vessels.length,
      openshipsCount: vessels.length,
      geofence: { polLat: geofence.latitude, polLon: geofence.longitude, radiusNm: geofence.radiusNm },
      destinationAliases: polData.aliases,
      providerDiagnostics: live.providerDiagnostics,
      masterEnrichment: { matched: masterEnrichment.matched, degraded },
      warnings,
      vessels,
    }, { status: degraded ? 206 : 200, headers: { "cache-control": "no-store, no-cache, must-revalidate" } });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "OPENSHIPS_UNAVAILABLE";
    const message = error instanceof Error ? error.message : "OpenShips REST request failed";
    const diagnostics = readOpenShipsDiagnostics(error);
    const warning = {
      code,
      message: diagnostics.message || message,
      httpStatus: diagnostics.httpStatus ?? null,
      statusText: diagnostics.statusText || null,
      requestUrl: diagnostics.requestUrl || null,
    };
    console.error("[openships-live-status] Live REST request failed.", warning);
    return Response.json({
      success: false,
      source: "OPENSHIPS_REST_LIVE",
      cache: "disabled",
      error: code,
      message,
      upstream: warning,
      warnings: [warning],
      clientFallback: diagnostics.clientFallback || { allowed: false, reason: "Browser fallback unavailable" },
      vessels: [],
      count: 0,
    }, { status: code === "OPENSHIPS_NOT_CONFIGURED" ? 503 : 502, headers: { "cache-control": "no-store" } });
  }
};

export const config: Config = {
  path: "/api/openships/live-status",
  method: "GET",
};
