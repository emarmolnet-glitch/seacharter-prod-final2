import type { Config } from "@netlify/functions";
import { filterVesselsByTaxonomies, parseRequestedTaxonomies } from "./_shared/ais-taxonomy.js";
import { parseAisGeofence } from "./_shared/ais-geofence.js";
import {
  buildPortDestinationAliases,
  classifyCandidateMatch,
} from "./_shared/commercial-vessel-search.mjs";
import { fetchOpenShipsLive } from "./_shared/openships-rest.mjs";

type Vessel = Record<string, unknown>;
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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
      limit: Number.isFinite(requestedProviderLimit) ? requestedProviderLimit : 5000,
    });
    const taxonomyVessels = taxonomies.length > 0
      ? filterVesselsByTaxonomies(live.vessels, taxonomies)
      : live.vessels;
    const polData = getPolData(url);
    const laycanEnd = url.searchParams.get("laycanEnd") || url.searchParams.get("cancellingDate");
    const vessels = taxonomyVessels.flatMap((vessel) => {
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
      warnings,
      vessels,
    }, { headers: { "cache-control": "no-store, no-cache, must-revalidate" } });
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
