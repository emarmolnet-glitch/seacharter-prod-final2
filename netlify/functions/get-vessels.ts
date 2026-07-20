import type { Config } from "@netlify/functions";
import WebSocket from "ws";
import { countVessels, isCargoShipType, readVessels, readVesselsNearPoint, upsertVessels, type VesselRecord } from "./vessel-store.js";
import { filterVesselsByTaxonomies, parseRequestedTaxonomies } from "./ais-taxonomy.js";
import { upsertRadarVesselsMaster } from "../../db/vessels-master-sync.js";

type VesselMessage = Record<string, unknown>;
type LiveCollectionResult = {
  vessels: VesselMessage[];
  completion: "target" | "timeout" | "closed" | "error";
};
declare const process: { env: Record<string, string | undefined> };

const AIS_STREAM_URL = "wss://stream.aisstream.io/v0/stream";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_TIMEOUT_MS = 6000;
const DEFAULT_QUANTITY = 1000;
const MAX_AIS_STREAM_COLLECTION = 1000;
const MAX_QUANTITY = 1000;
const STORED_LOOKUP_LIMIT = 1000;
const HANDYSIZE_MIN_DWT = 25000;
const SUPRAMAX_MAX_DWT = 65000;
const POL_VISUAL_RADIUS_NM = 1000;
const POD_VISUAL_RADIUS_NM = 100;
const ROUTE_CORRIDOR_RADIUS_NM = 100;
const PROJECTION_SCAN_RADIUS_NM = 1000;
const PROJECTION_LOOKAHEAD_HOURS = 72;
const PROJECTION_VECTOR_MINUTES = 60;

let vesselCache: VesselMessage[] = [];
let cacheUpdatedAt = 0;

type AisBoundingBox = [[number, number], [number, number]];

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function vesselsResponse(body: Record<string, unknown>, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers || {}),
    },
  });
}

function numberParam(url: URL, names: string[], fallback: number) {
  for (const name of names) {
    const value = Number(url.searchParams.get(name));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function parseRequestedBoxes(url: URL) {
  const rawBoxes = url.searchParams.get("boxes");
  if (!rawBoxes) return null;

  try {
    const parsed = JSON.parse(rawBoxes) as unknown;
    if (!Array.isArray(parsed)) return null;

    const boxes = parsed
      .map((box) => {
        if (!Array.isArray(box) || !Array.isArray(box[0]) || !Array.isArray(box[1])) return null;
        const minLat = parseFloat(String(box[0][0]));
        const minLon = parseFloat(String(box[0][1]));
        const maxLat = parseFloat(String(box[1][0]));
        const maxLon = parseFloat(String(box[1][1]));
        if (![minLat, minLon, maxLat, maxLon].every(Number.isFinite)) return null;
        if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) return null;
        if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) return null;
        return [
          [Math.min(minLat, maxLat), Math.min(minLon, maxLon)],
          [Math.max(minLat, maxLat), Math.max(minLon, maxLon)],
        ] satisfies AisBoundingBox;
      })
      .filter((box): box is AisBoundingBox => Array.isArray(box));

    return boxes.length > 0 ? boxes.slice(0, 4) : null;
  } catch (_) {
    return null;
  }
}

function parseRouteCoordinate(url: URL, name: "coords_pol" | "coords_pod") {
  const raw = url.searchParams.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    const lat = Number(parsed[0]);
    const lon = Number(parsed[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  } catch (_) {
    return null;
  }
}

function createBoundingBoxAroundCoordinate(point: { lat: number; lon: number }, radiusNm: number): AisBoundingBox {
  const latDelta = radiusNm / 60;
  const lonDelta = radiusNm / (60 * Math.max(0.25, Math.cos(point.lat * Math.PI / 180)));
  return [
    [Math.max(-90, point.lat - latDelta), Math.max(-180, point.lon - lonDelta)],
    [Math.min(90, point.lat + latDelta), Math.min(180, point.lon + lonDelta)],
  ];
}

function getRequestedBoundingBoxes(url: URL) {
  const requestedBoxes = parseRequestedBoxes(url);
  if (requestedBoxes) return requestedBoxes;
  const pol = parseRouteCoordinate(url, "coords_pol");
  const pod = parseRouteCoordinate(url, "coords_pod");
  const requestedRadiusNm = Math.min(2000, Math.max(25, numberParam(url, ["radiusNm", "radius_nm"], POL_VISUAL_RADIUS_NM)));
  const boxes = [
    pol ? createBoundingBoxAroundCoordinate(pol, requestedRadiusNm) : null,
    pod ? createBoundingBoxAroundCoordinate(pod, POD_VISUAL_RADIUS_NM) : null,
  ].filter((box): box is AisBoundingBox => box !== null);
  return boxes.length > 0 ? boxes : null;
}

function isForceLiveRequest(url: URL) {
  return ["1", "true", "yes"].includes(textParam(url, ["force", "live"], "0").toLowerCase());
}

function getApiKey() {
  return String(process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY || "").trim();
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeDraughtMeters(value: unknown) {
  const draught = normalizeNumber(value);
  if (draught === undefined) return undefined;
  return draught > 25 ? Math.round((draught / 10) * 100) / 100 : draught;
}

function normalizeDestination(value: unknown) {
  const text = String(value || "").trim();
  if (!text || text.toUpperCase() === "NOT AVAILABLE" || text.toUpperCase() === "N/A") return null;
  return text;
}

function textParam(url: URL, names: string[], fallback = "") {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value && value.trim()) return value.trim();
  }
  return fallback;
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusNm = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radiusNm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number) {
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angularDifferenceDegrees(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function projectPoint(lat: number, lon: number, course: number, distanceNm: number) {
  const radiusNm = 3440.065;
  const delta = distanceNm / radiusNm;
  const theta = course * Math.PI / 180;
  const phi1 = lat * Math.PI / 180;
  const lambda1 = lon * Math.PI / 180;
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
  );
  return {
    lat: phi2 * 180 / Math.PI,
    lon: ((((lambda2 * 180 / Math.PI) + 540) % 360) - 180),
  };
}

function routeCorridorMatch(
  lat: number,
  lon: number,
  pol: { lat: number; lon: number } | null,
  pod: { lat: number; lon: number } | null,
  radiusNm = ROUTE_CORRIDOR_RADIUS_NM,
) {
  if (!pol || !pod) return null;
  const midLatRad = ((pol.lat + pod.lat + lat) / 3) * Math.PI / 180;
  const nmPerDegreeLat = 60;
  const nmPerDegreeLon = 60 * Math.max(0.1, Math.cos(midLatRad));
  const ax = pol.lon * nmPerDegreeLon;
  const ay = pol.lat * nmPerDegreeLat;
  const bx = pod.lon * nmPerDegreeLon;
  const by = pod.lat * nmPerDegreeLat;
  const px = lon * nmPerDegreeLon;
  const py = lat * nmPerDegreeLat;
  const dx = bx - ax;
  const dy = by - ay;
  const routeLengthSquared = dx * dx + dy * dy;
  if (routeLengthSquared <= 0) return null;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / routeLengthSquared));
  const nearestX = ax + t * dx;
  const nearestY = ay + t * dy;
  const crossTrackNm = Math.hypot(px - nearestX, py - nearestY);
  return {
    inside: crossTrackNm <= radiusNm,
    crossTrackNm: Math.round(crossTrackNm),
    alongTrackNm: Math.round(Math.sqrt(routeLengthSquared) * t),
    corridorRadiusNm: radiusNm,
  };
}

function estimateDwt(message: VesselMessage) {
  const metadata = asRecord(message.MetaData);
  const direct = normalizeNumber(firstDefined(message.DWT, message.dwt, message.DWT_real, message.deadweight, metadata.DWT, metadata.dwt, metadata.DWT_real, metadata.deadweight));
  if (direct && direct > 0) return direct;

  const seed = String(firstDefined(message.IMO, message.imo, metadata.IMO, message.MMSI, message.mmsi, metadata.MMSI, message.ShipName, metadata.ShipName, "") || "");
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }
  return HANDYSIZE_MIN_DWT + (Math.abs(hash) % (SUPRAMAX_MAX_DWT - HANDYSIZE_MIN_DWT + 1));
}

function vesselClassLabel(dwt: number, shipType: unknown) {
  const type = String(shipType || "").toLowerCase();
  if (type.includes("supramax") || dwt >= 50000) return "Supramax";
  return "Handysize";
}

function normalizeLoadState(message: VesselMessage, requestedState: string) {
  const metadata = asRecord(message.MetaData);
  const raw = String(firstDefined(
    message.loadState,
    message.estado_carga,
    message.cargoStatus,
    metadata.loadState,
    metadata.estado_carga,
    metadata.cargoStatus,
    "",
  ) || "").toLowerCase();

  if (raw.includes("laden") || raw.includes("carg")) return "Laden";
  if (raw.includes("ballast") || raw.includes("vacio") || raw.includes("vacío")) return "Ballast";

  const speed = normalizeNumber(firstDefined(message.speed, metadata.speed)) ?? 0;
  const destination = String(firstDefined(message.destination, message.Destination, metadata.Destination, "") || "").trim();
  if (requestedState === "Laden" || requestedState === "Ballast") return requestedState;
  return destination && speed > 0.5 ? "Laden" : "Ballast";
}

function estimateProjectedLoadState(message: VesselMessage, requestedState: string) {
  const metadata = asRecord(message.MetaData);
  const draft = normalizeNumber(firstDefined(message.draft, message.Draft, metadata.draft, metadata.Draft));
  const designDraft = normalizeNumber(firstDefined(message.designDraft, message.maxDraft, metadata.designDraft, metadata.maxDraft));
  if (draft !== undefined && designDraft !== undefined && designDraft > 0) {
    return draft / designDraft >= 0.62 ? "Laden" : "Ballast";
  }
  if (draft !== undefined) {
    return draft >= 8.5 ? "Laden" : "Ballast";
  }
  return normalizeLoadState(message, requestedState);
}

function normalizeEta(message: VesselMessage, reference?: { lat: number; lon: number }) {
  const metadata = asRecord(message.MetaData);
  const explicit = String(firstDefined(message.eta, message.ETA, message.Eta, metadata.eta, metadata.ETA, metadata.Eta, "") || "").trim();
  if (explicit) return explicit;

  if (!reference) return "N/A";
  const lat = normalizeNumber(firstDefined(message.latitude, message.AIS_Live_Lat, metadata.latitude));
  const lon = normalizeNumber(firstDefined(message.longitude, message.AIS_Live_Lon, metadata.longitude));
  if (lat === undefined || lon === undefined) return "N/A";
  const speed = Math.max(8, normalizeNumber(firstDefined(message.speed, metadata.speed)) ?? 11);
  const eta = new Date(Date.now() + (haversineNm(reference.lat, reference.lon, lat, lon) / speed) * 60 * 60 * 1000);
  return eta.toISOString();
}

function getShipTypeValue(message: VesselMessage) {
  const metadata = asRecord(message.MetaData);
  const nestedMessage = asRecord(message.Message);
  const staticData = asRecord(message.ShipStaticData || nestedMessage.ShipStaticData);
  return firstDefined(
    message.ShipType,
    message.shipType,
    message.type,
    message.Type,
    message.Tipo,
    message.tipo,
    message.cargoType,
    message.tipo_carga,
    message.vesselType,
    message.categoryLabel,
    message.radarCategory,
    metadata.ShipType,
    metadata.shipType,
    metadata.type,
    metadata.Tipo,
    metadata.tipo,
    metadata.cargoType,
    metadata.tipo_carga,
    metadata.vesselType,
    metadata.categoryLabel,
    staticData.Type,
  );
}

function buildProjection(message: VesselMessage, target?: { role: string; lat: number; lon: number; radiusNm: number }) {
  const metadata = asRecord(message.MetaData);
  const lat = normalizeNumber(firstDefined(message.latitude, message.AIS_Live_Lat, metadata.latitude));
  const lon = normalizeNumber(firstDefined(message.longitude, message.AIS_Live_Lon, metadata.longitude));
  const sog = Math.max(0, normalizeNumber(firstDefined(message.speed, message.SOG, metadata.speed, metadata.SOG)) ?? 0);
  const cog = normalizeNumber(firstDefined(message.course, message.COG, message.cog, metadata.course, metadata.COG, metadata.cog));
  if (lat === undefined || lon === undefined || cog === undefined || sog <= 0.2) return null;

  const points = [PROJECTION_VECTOR_MINUTES / 60].map((hours) => {
    const point = projectPoint(lat, lon, cog, sog * hours);
    return { hours, minutes: Math.round(hours * 60), lat: point.lat, lon: point.lon };
  });
  const projection: Record<string, unknown> = { cog, sog, points, minutes: PROJECTION_VECTOR_MINUTES };

  if (target) {
    const distanceToTarget = haversineNm(lat, lon, target.lat, target.lon);
    const bearingToTarget = bearingDegrees(lat, lon, target.lat, target.lon);
    const courseDelta = angularDifferenceDegrees(cog, bearingToTarget);
    const crossTrackNm = Math.sin(courseDelta * Math.PI / 180) * distanceToTarget;
    const alongTrackNm = Math.cos(courseDelta * Math.PI / 180) * distanceToTarget;
    const reachesSearchRadius = alongTrackNm > 0 && Math.abs(crossTrackNm) <= target.radiusNm;
    const distanceToRadiusNm = reachesSearchRadius
      ? Math.max(0, alongTrackNm - Math.sqrt(Math.max(0, target.radiusNm ** 2 - crossTrackNm ** 2)))
      : null;
    const etaProjected = distanceToRadiusNm !== null
      ? new Date(Date.now() + (distanceToRadiusNm / sog) * 60 * 60 * 1000).toISOString()
      : null;
    Object.assign(projection, {
      targetRole: target.role,
      targetDistanceNm: Math.round(distanceToTarget),
      courseDelta: Math.round(courseDelta),
      crossTrackNm: Math.round(Math.abs(crossTrackNm)),
      projectedIntersection: reachesSearchRadius,
      distanceToRadiusNm: distanceToRadiusNm !== null ? Math.round(distanceToRadiusNm) : null,
      etaProjected,
    });
  }

  return projection;
}

function etaDriftHours(aisEta: string, projectedEta: unknown) {
  if (!aisEta || aisEta === "N/A" || typeof projectedEta !== "string") return null;
  const aisMs = Date.parse(aisEta);
  const projectedMs = Date.parse(projectedEta);
  if (!Number.isFinite(aisMs) || !Number.isFinite(projectedMs)) return null;
  return Math.round(Math.abs(aisMs - projectedMs) / 36_000) / 100;
}

function filterSelectiveVessels(url: URL, vessels: VesselMessage[]) {
  const selective = false;
  const requestedState = textParam(url, ["loadState", "estado", "cargoState"], "any");
  const vesselSearch = textParam(url, ["q", "search", "vesselName"], "");
  const normalizedVesselSearch = vesselSearch
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const isGlobalNameSearch = normalizedVesselSearch.length > 0;
  const coordsPol = parseRouteCoordinate(url, "coords_pol");
  const coordsPod = parseRouteCoordinate(url, "coords_pod");
  const polLat = coordsPol?.lat ?? normalizeNumber(url.searchParams.get("polLat"));
  const polLon = coordsPol?.lon ?? normalizeNumber(url.searchParams.get("polLon"));
  const podLat = coordsPod?.lat ?? normalizeNumber(url.searchParams.get("podLat"));
  const podLon = coordsPod?.lon ?? normalizeNumber(url.searchParams.get("podLon"));
  const zone = textParam(url, ["zone"], "DUAL").toUpperCase();
  const matchingMode = ["1", "true", "yes"].includes(textParam(url, ["matchingMode", "projectionMatching"], "0").toLowerCase());
  const requestedPolRadiusNm = Math.min(2000, Math.max(25, numberParam(url, ["radiusNm", "radius_nm"], POL_VISUAL_RADIUS_NM)));
  const activePoints = [
    zone !== "POD" && polLat !== undefined && polLon !== undefined ? { role: "POL", lat: polLat, lon: polLon, radiusNm: requestedPolRadiusNm } : null,
    zone !== "POL" && podLat !== undefined && podLon !== undefined ? { role: "POD", lat: podLat, lon: podLon, radiusNm: POD_VISUAL_RADIUS_NM } : null,
  ].filter((point): point is { role: string; lat: number; lon: number; radiusNm: number } => Boolean(point));
  const selectedPolTarget = polLat !== undefined && polLon !== undefined
    ? { role: "POL", lat: polLat, lon: polLon, radiusNm: requestedPolRadiusNm }
    : null;
  const routePol = polLat !== undefined && polLon !== undefined ? { lat: polLat, lon: polLon } : null;
  const routePod = podLat !== undefined && podLon !== undefined ? { lat: podLat, lon: podLon } : null;

  return vessels
    .map(normalizeVesselMessage)
    .filter((vessel) => !selective || isCargoShipType(getShipTypeValue(vessel)))
    .map((vessel) => {
      const metadata = asRecord(vessel.MetaData);
      const lat = normalizeNumber(firstDefined(vessel.latitude, vessel.AIS_Live_Lat, metadata.latitude));
      const lon = normalizeNumber(firstDefined(vessel.longitude, vessel.AIS_Live_Lon, metadata.longitude));
      if (lat === undefined || lon === undefined) return null;
      if (normalizedVesselSearch) {
        const identityText = [
          vessel.vesselName,
          vessel.ShipName,
          vessel.name,
          vessel.IMO,
          vessel.imo,
          vessel.MMSI,
          vessel.mmsi,
          metadata.ShipName,
          metadata.VesselName,
          metadata.IMO,
          metadata.MMSI,
        ].filter(Boolean).join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "");
        if (!identityText.includes(normalizedVesselSearch)) return null;
      }

      const dwt = estimateDwt(vessel);
      const classification = vesselClassLabel(dwt, firstDefined(vessel.shipType, vessel.ShipType, metadata.ShipType));
      if (selective && !isGlobalNameSearch && (dwt < HANDYSIZE_MIN_DWT || dwt > SUPRAMAX_MAX_DWT)) return null;

      const loadState = estimateProjectedLoadState(vessel, requestedState);
      if (selective && !isGlobalNameSearch && (requestedState === "Laden" || requestedState === "Ballast") && loadState !== requestedState) return null;

      const pointDistances = activePoints.map((point) => ({
        ...point,
        distanceNm: haversineNm(point.lat, point.lon, lat, lon),
      }));
      const pointMatches = pointDistances.filter((point) => point.distanceNm <= point.radiusNm);

      const nearestByDistance = pointDistances.sort((a, b) => a.distanceNm - b.distanceNm)[0] || null;
      const nearestVisual = pointMatches.sort((a, b) => a.distanceNm - b.distanceNm)[0] || null;
      const routeCorridor = routeCorridorMatch(lat, lon, routePol, routePod);
      const insideRouteCorridor = !!routeCorridor?.inside;
      const insidePolGeofence = !selectedPolTarget || pointMatches.some((point) => point.role === "POL");
      if (!isGlobalNameSearch && selectedPolTarget && !insidePolGeofence && !insideRouteCorridor) return null;
      const projection = buildProjection(vessel, selectedPolTarget || nearestVisual || nearestByDistance);
      const distanceToPol = selectedPolTarget ? haversineNm(selectedPolTarget.lat, selectedPolTarget.lon, lat, lon) : null;
      const distanceToPod = routePod ? haversineNm(routePod.lat, routePod.lon, lat, lon) : null;
      const isPolOperationalMatch = distanceToPol !== null && distanceToPol <= requestedPolRadiusNm && loadState === "Laden";
      const isPodOperationalMatch = distanceToPod !== null && distanceToPod <= POD_VISUAL_RADIUS_NM && loadState === "Ballast";
      if (selective && !isGlobalNameSearch && nearestVisual?.role === "POL" && !isPolOperationalMatch) return null;
      if (selective && !isGlobalNameSearch && nearestVisual?.role === "POD" && !isPodOperationalMatch) return null;
      const hoursToPolCircle = Number(projection?.distanceToRadiusNm ?? Infinity) / Math.max(Number(projection?.sog ?? 0), 0.1);
      const isProjectionCandidate = !!(
        matchingMode &&
        selectedPolTarget &&
        distanceToPol !== null &&
        distanceToPol > requestedPolRadiusNm &&
        distanceToPol <= PROJECTION_SCAN_RADIUS_NM &&
        projection &&
        projection.projectedIntersection === true &&
        hoursToPolCircle < PROJECTION_LOOKAHEAD_HOURS
      );

      if (selective && !isGlobalNameSearch && matchingMode && !isProjectionCandidate && (!nearestVisual || nearestVisual.role !== "POL")) {
        return null;
      }
      if (selective && !isGlobalNameSearch && matchingMode && !isProjectionCandidate && (!projection || projection.projectedIntersection !== true || Number(projection.crossTrackNm ?? Infinity) > 50)) {
        return null;
      }

      const nearest = nearestVisual || nearestByDistance;
      const matchZone = isProjectionCandidate
        ? "PROJECTION"
        : isGlobalNameSearch
          ? "GLOBAL"
          : nearestVisual?.role || (insideRouteCorridor ? "ROUTE" : "GLOBAL");
      const priorityDistance = nearestVisual
        ? Math.round(nearestVisual.distanceNm)
        : insideRouteCorridor
          ? Math.round(routeCorridor?.crossTrackNm ?? 0)
          : nearestByDistance
            ? Math.round(nearestByDistance.distanceNm)
            : null;
      const imo = String(firstDefined(vessel.IMO, vessel.imo, metadata.IMO, "") || "").trim();
      const lastPort = String(firstDefined(vessel.lastPortOfCall, vessel.last_port_of_call, vessel.ultimo_puerto, metadata.lastPortOfCall, metadata.ultimo_puerto, "") || "").trim() || "N/A";
      const aisEta = normalizeEta(vessel, nearest);
      const driftHours = etaDriftHours(aisEta, projection?.etaProjected);
      const enriched: VesselMessage & { distanceNm: number | null } = {
        ...vessel,
        IMO: imo || "N/A",
        imo: imo || "N/A",
        dwt,
        DWT: dwt,
        vesselClass: classification,
        loadState,
        estado_carga: loadState,
        eta: aisEta,
        etaProjected: projection?.etaProjected || "N/A",
        etaDriftHours: driftHours,
        etaDesfase: driftHours !== null && driftHours > 6,
        projection,
        projectionCandidate: isProjectionCandidate,
        aisMarkerStyle: matchZone === "GLOBAL" ? "standard" : (isProjectionCandidate ? "ghost" : "focus"),
        aisRouteCorridor: routeCorridor || undefined,
        lastPortOfCall: lastPort,
        last_port_of_call: lastPort,
        ultimo_puerto: lastPort,
        matchZone,
        distanceNm: priorityDistance,
        distanceToPolNm: distanceToPol !== null ? Math.round(distanceToPol) : null,
        distanceToPodNm: distanceToPod !== null ? Math.round(distanceToPod) : null,
        destinationAvailability: isPodOperationalMatch,
        matchAlert: isPodOperationalMatch ? "Disponibilidad Destino" : null,
        MetaData: {
          ...metadata,
          IMO: imo || "N/A",
          DWT: dwt,
          vesselClass: classification,
          loadState,
          estado_carga: loadState,
          ETA: aisEta,
          etaProjected: projection?.etaProjected || "N/A",
          etaDriftHours: driftHours,
          etaDesfase: driftHours !== null && driftHours > 6,
          projection,
          projectionCandidate: isProjectionCandidate,
          aisMarkerStyle: matchZone === "GLOBAL" ? "standard" : (isProjectionCandidate ? "ghost" : "focus"),
          aisRouteCorridor: routeCorridor || undefined,
          lastPortOfCall: lastPort,
          ultimo_puerto: lastPort,
          matchZone,
          distanceNm: priorityDistance,
          distanceToPolNm: distanceToPol !== null ? Math.round(distanceToPol) : null,
          distanceToPodNm: distanceToPod !== null ? Math.round(distanceToPod) : null,
          destinationAvailability: isPodOperationalMatch,
          matchAlert: isPodOperationalMatch ? "Disponibilidad Destino" : null,
        },
      };
      return enriched;
    })
    .filter((vessel): vessel is VesselMessage & { distanceNm: number | null } => vessel !== null)
    .sort((a, b) => Number(a.distanceNm ?? 9999) - Number(b.distanceNm ?? 9999))
    .slice(0, numberParam(url, ["quantity", "limit"], DEFAULT_QUANTITY));
}

function getVesselKey(message: VesselMessage) {
  const metadata = asRecord(message.MetaData);
  return String(
    metadata.MMSI ||
    metadata.mmsi ||
    message.MMSI ||
    message.mmsi ||
    metadata.IMO ||
    message.IMO ||
    "",
  ).trim();
}

function normalizeVesselMessage(message: VesselMessage): VesselMessage {
  const metadata = asRecord(message.MetaData);
  const nestedMessage = asRecord(message.Message);
  const positionReport = asRecord(
    message.PositionReport
      || nestedMessage.PositionReport
      || message.StandardClassBPositionReport
      || nestedMessage.StandardClassBPositionReport
      || message.ExtendedClassBPositionReport
      || nestedMessage.ExtendedClassBPositionReport,
  );
  const staticData = asRecord(message.ShipStaticData || nestedMessage.ShipStaticData);

  const latitude = normalizeNumber(firstDefined(
    message.latitude,
    message.AIS_Live_Lat,
    metadata.latitude,
    metadata.AIS_Live_Lat,
    positionReport.Latitude,
    positionReport.latitude,
  ));
  const longitude = normalizeNumber(firstDefined(
    message.longitude,
    message.AIS_Live_Lon,
    metadata.longitude,
    metadata.AIS_Live_Lon,
    positionReport.Longitude,
    positionReport.longitude,
  ));
  const mmsi = firstDefined(message.MMSI, message.mmsi, metadata.MMSI, metadata.mmsi, positionReport.UserID, staticData.UserID);
  const shipName = firstDefined(message.ShipName, message.vesselName, message.name, metadata.ShipName, metadata.shipName, staticData.Name);
  const imo = firstDefined(message.IMO, message.imo, metadata.IMO, metadata.imo, staticData.ImoNumber);
  const shipType = firstDefined(message.ShipType, message.shipType, metadata.ShipType, metadata.shipType, staticData.Type);
  const draught = normalizeDraughtMeters(firstDefined(message.draught, message.Draught, message.draft, message.Draft, metadata.draught, metadata.Draught, metadata.draft, metadata.Draft, staticData.MaximumStaticDraught));
  const speed = normalizeNumber(firstDefined(message.speed, metadata.speed, positionReport.Sog, positionReport.SOG));
  const course = normalizeNumber(firstDefined(message.course, message.COG, message.cog, metadata.course, metadata.COG, metadata.cog, positionReport.Cog, positionReport.COG, positionReport.Course));
  const navigationalStatus = firstDefined(message.NavigationalStatus, metadata.NavigationalStatus, positionReport.NavigationalStatus);
  const destination = normalizeDestination(firstDefined(message.destination, message.Destination, message.destino_actual, metadata.Destination, metadata.destination, staticData.Destination, staticData.PortOfDestination));
  const lastPortOfCall = firstDefined(
    message.lastPortOfCall,
    message.last_port_of_call,
    message.ultimo_puerto,
    message.ultimoPuerto,
    message.LastPort,
    message.LastPortOfCall,
    message.PreviousPort,
    message.DeparturePort,
    metadata.lastPortOfCall,
    metadata.last_port_of_call,
    metadata.ultimo_puerto,
    metadata.LastPort,
    metadata.LastPortOfCall,
    metadata.PreviousPort,
    metadata.DeparturePort,
    staticData.LastPort,
    staticData.LastPortOfCall,
    staticData.PreviousPort,
    staticData.DeparturePort,
  );

  return {
    ...message,
    MMSI: mmsi,
    mmsi,
    ShipName: shipName,
    vesselName: shipName,
    IMO: imo || (mmsi ? "N/A" : undefined),
    imo: imo || (mmsi ? "N/A" : undefined),
    ShipType: shipType,
    shipType,
    draught,
    draft: draught,
    Draught: draught,
    Draft: draught,
    latitude,
    longitude,
    AIS_Live_Lat: latitude,
    AIS_Live_Lon: longitude,
    speed,
    course,
    COG: course,
    cog: course,
    NavigationalStatus: navigationalStatus,
    destination,
    Destination: destination,
    destino_actual: destination,
    lastPortOfCall,
    last_port_of_call: lastPortOfCall,
    ultimo_puerto: lastPortOfCall,
    MetaData: {
      ...metadata,
      MMSI: firstDefined(metadata.MMSI, mmsi),
      ShipName: firstDefined(metadata.ShipName, shipName),
      IMO: firstDefined(metadata.IMO, imo, mmsi ? "N/A" : undefined),
      ShipType: firstDefined(metadata.ShipType, shipType),
      Draught: firstDefined(metadata.Draught, draught),
      Draft: firstDefined(metadata.Draft, draught),
      latitude: firstDefined(metadata.latitude, latitude),
      longitude: firstDefined(metadata.longitude, longitude),
      speed: firstDefined(metadata.speed, speed),
      course: firstDefined(metadata.course, course),
      COG: firstDefined(metadata.COG, course),
      NavigationalStatus: firstDefined(metadata.NavigationalStatus, navigationalStatus),
      Destination: destination,
      lastPortOfCall: firstDefined(metadata.lastPortOfCall, lastPortOfCall),
      ultimo_puerto: firstDefined(metadata.ultimo_puerto, lastPortOfCall),
    },
  };
}

function toVesselRecord(message: VesselMessage): VesselRecord | null {
  const normalized = normalizeVesselMessage(message);
  const metadata = asRecord(normalized.MetaData);
  const mmsi = String(firstDefined(normalized.mmsi, normalized.MMSI, metadata.MMSI, "") || "").trim();
  const latitude = normalizeNumber(firstDefined(normalized.latitude, normalized.AIS_Live_Lat, metadata.latitude));
  const longitude = normalizeNumber(firstDefined(normalized.longitude, normalized.AIS_Live_Lon, metadata.longitude));

  if (!mmsi || latitude === undefined || longitude === undefined) return null;

  const now = new Date().toISOString();
  const imo = String(firstDefined(normalized.imo, normalized.IMO, metadata.IMO, "") || "").trim();
  const estimatedEta = String(firstDefined(normalized.estimatedEta, normalized.etaEstimated, normalized.eta_calculado, metadata.estimatedEta, metadata.etaEstimated, "") || "").trim() || null;

  return {
    imoNumber: imo && imo !== "N/A" ? imo : `MMSI-${mmsi}`,
    mmsi,
    vesselName: String(firstDefined(normalized.vesselName, normalized.ShipName, metadata.ShipName, "") || "").trim() || null,
    shipType: String(firstDefined(normalized.shipType, normalized.ShipType, metadata.ShipType, "") || "").trim() || null,
    draught: normalizeDraughtMeters(firstDefined(normalized.draught, normalized.Draught, normalized.draft, normalized.Draft, metadata.Draught, metadata.Draft)) ?? null,
    latitude,
    longitude,
    speed: normalizeNumber(firstDefined(normalized.speed, metadata.speed)) ?? null,
    course: normalizeNumber(firstDefined(normalized.course, normalized.COG, metadata.course)) ?? null,
    heading: normalizeNumber(firstDefined(normalized.heading, normalized.TrueHeading, metadata.heading)) ?? null,
    navigationalStatus: String(firstDefined(normalized.NavigationalStatus, metadata.NavigationalStatus, "") || "").trim() || null,
    destination: normalizeDestination(firstDefined(normalized.destination, normalized.Destination, metadata.Destination, "")),
    lastPortOfCall: String(firstDefined(normalized.lastPortOfCall, normalized.last_port_of_call, normalized.ultimo_puerto, metadata.lastPortOfCall, metadata.ultimo_puerto, "") || "").trim() || null,
    eta: String(firstDefined(normalized.eta, normalized.ETA, metadata.ETA, "") || "").trim() || null,
    estimatedEta,
    estimatedEtaTarget: String(firstDefined(normalized.estimatedEtaTarget, metadata.estimatedEtaTarget, "") || "").trim() || null,
    estimatedEtaDistanceNm: normalizeNumber(firstDefined(normalized.estimatedEtaDistanceNm, metadata.estimatedEtaDistanceNm)) ?? null,
    estimatedEtaHours: normalizeNumber(firstDefined(normalized.estimatedEtaHours, metadata.estimatedEtaHours)) ?? null,
    estimatedEtaSpeedKnots: normalizeNumber(firstDefined(normalized.estimatedEtaSpeedKnots, metadata.estimatedEtaSpeedKnots)) ?? null,
    estimatedEtaConfidence: String(firstDefined(normalized.estimatedEtaConfidence, metadata.estimatedEtaConfidence, "") || "").trim() as VesselRecord["estimatedEtaConfidence"] || null,
    source: "AISStream",
    rawData: normalized,
    lastSeenAt: now,
    updatedAt: now,
    createdAt: now,
  };
}

function fromVesselRecord(row: VesselRecord): VesselMessage {
  return normalizeVesselMessage({
    MMSI: row.mmsi,
    mmsi: row.mmsi,
    IMO: row.imoNumber.startsWith("MMSI-") ? "N/A" : row.imoNumber,
    imo: row.imoNumber.startsWith("MMSI-") ? "N/A" : row.imoNumber,
    ShipName: row.vesselName,
    vesselName: row.vesselName,
    ShipType: row.shipType,
    shipType: row.shipType,
    cargoClass: row.cargoClass,
    vesselClass: row.vesselClass,
    DWT: row.dwt,
    dwt: row.dwt,
    Draught: row.draught,
    Draft: row.draught,
    draught: row.draught,
    draft: row.draught,
    latitude: row.latitude,
    longitude: row.longitude,
    AIS_Live_Lat: row.latitude,
    AIS_Live_Lon: row.longitude,
    speed: row.speed,
    course: row.course,
    heading: row.heading,
    NavigationalStatus: row.navigationalStatus,
    destination: row.destination,
    Destination: row.destination,
    destino_actual: row.destination,
    lastPortOfCall: row.lastPortOfCall,
    last_port_of_call: row.lastPortOfCall,
    ultimo_puerto: row.lastPortOfCall,
    loadState: row.loadState,
    estado_carga: row.loadState,
    predictedDestination: row.predictedDestination,
    predictedDestinationConfidence: row.predictedDestinationConfidence,
    eta: row.eta,
    estimatedEta: row.estimatedEta,
    etaEstimated: row.estimatedEta,
    eta_calculado: row.estimatedEta,
    estimatedEtaTarget: row.estimatedEtaTarget,
    estimatedEtaDistanceNm: row.estimatedEtaDistanceNm,
    estimatedEtaHours: row.estimatedEtaHours,
    estimatedEtaSpeedKnots: row.estimatedEtaSpeedKnots,
    estimatedEtaConfidence: row.estimatedEtaConfidence,
    source: row.source,
    lastSeenAt: row.lastSeenAt,
    rawData: row.rawData,
    MetaData: {
      MMSI: row.mmsi,
      IMO: row.imoNumber.startsWith("MMSI-") ? "N/A" : row.imoNumber,
      ShipName: row.vesselName,
      ShipType: row.shipType,
      cargoClass: row.cargoClass,
      vesselClass: row.vesselClass,
      DWT: row.dwt,
      Draught: row.draught,
      Draft: row.draught,
      latitude: row.latitude,
      longitude: row.longitude,
      speed: row.speed,
      NavigationalStatus: row.navigationalStatus,
      Destination: row.destination,
      lastPortOfCall: row.lastPortOfCall,
      ultimo_puerto: row.lastPortOfCall,
      loadState: row.loadState,
      estado_carga: row.loadState,
      predictedDestination: row.predictedDestination,
      predictedDestinationConfidence: row.predictedDestinationConfidence,
      estimatedEta: row.estimatedEta,
      etaEstimated: row.estimatedEta,
      eta_calculado: row.estimatedEta,
      estimatedEtaTarget: row.estimatedEtaTarget,
      estimatedEtaDistanceNm: row.estimatedEtaDistanceNm,
      estimatedEtaHours: row.estimatedEtaHours,
      estimatedEtaSpeedKnots: row.estimatedEtaSpeedKnots,
      estimatedEtaConfidence: row.estimatedEtaConfidence,
      classificationSignals: row.classificationSignals,
      missingData: row.missingData,
      classificationComplete: row.classificationComplete,
      radarSweepCount: row.radarSweepCount,
    },
  });
}

async function readStoredVesselMessages(limit: number, url?: URL) {
  try {
    const pol = url ? parseRouteCoordinate(url, "coords_pol") : null;
    const polLat = pol?.lat ?? (url ? normalizeNumber(url.searchParams.get("polLat")) : undefined);
    const polLon = pol?.lon ?? (url ? normalizeNumber(url.searchParams.get("polLon")) : undefined);
    const requestedRadius = url ? numberParam(url, ["radiusNm", "radius_nm"], POL_VISUAL_RADIUS_NM) : POL_VISUAL_RADIUS_NM;
    const radiusNm = Math.min(2000, Math.max(25, requestedRadius));
    const storedRows = polLat !== undefined && polLon !== undefined
      ? await readVesselsNearPoint(polLat, polLon, radiusNm, limit)
      : (await readVessels()).slice(0, limit);
    return storedRows.map(fromVesselRecord);
  } catch (error) {
    console.warn("AIS vessel store read failed:", error);
    return [];
  }
}

async function persistVesselMessages(vessels: VesselMessage[]) {
  const rows = vessels.map(toVesselRecord).filter((row): row is VesselRecord => row !== null);
  if (rows.length === 0) return { persistedCount: 0, masterPersistedCount: 0, databaseVesselCount: await countVessels() };
  await upsertVessels(rows);
  const masterPersistedCount = await upsertRadarVesselsMaster(rows);
  return { persistedCount: rows.length, masterPersistedCount, databaseVesselCount: await countVessels() };
}

function mergeVesselMessageLists(baseVessels: VesselMessage[], incomingVessels: VesselMessage[]) {
  const byKey = new Map<string, VesselMessage>();

  for (const vessel of baseVessels) {
    const normalized = normalizeVesselMessage(vessel);
    const key = getVesselKey(normalized);
    if (!key) continue;
    byKey.set(key, mergeDefinedVesselFields(byKey.get(key), normalized));
  }

  for (const vessel of incomingVessels) {
    const normalized = normalizeVesselMessage(vessel);
    const key = getVesselKey(normalized);
    if (!key) continue;
    byKey.set(key, mergeDefinedVesselFields(byKey.get(key), normalized));
  }

  return Array.from(byKey.values());
}

function completeIncomingVesselsFromStore(storedVessels: VesselMessage[], incomingVessels: VesselMessage[]) {
  const storedByKey = new Map<string, VesselMessage>();

  for (const vessel of storedVessels) {
    const normalized = normalizeVesselMessage(vessel);
    const key = getVesselKey(normalized);
    if (!key) continue;
    storedByKey.set(key, mergeDefinedVesselFields(storedByKey.get(key), normalized));
  }

  return incomingVessels
    .map((vessel) => {
      const normalized = normalizeVesselMessage(vessel);
      const key = getVesselKey(normalized);
      if (!key) return null;
      return mergeDefinedVesselFields(storedByKey.get(key), normalized);
    })
    .filter((vessel): vessel is VesselMessage => Boolean(vessel));
}

function mergeDefinedVesselFields(current: VesselMessage | undefined, incoming: VesselMessage) {
  const merged: VesselMessage = { ...(current || {}) };

  Object.entries(incoming).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    if (key === "MetaData" && typeof value === "object" && value && typeof merged.MetaData === "object" && merged.MetaData) {
      merged.MetaData = mergeDefinedVesselFields(merged.MetaData as VesselMessage, value as VesselMessage);
      return;
    }

    merged[key] = value;
  });

  return merged;
}

function collectVessels(url: URL, apiKey: string): Promise<LiveCollectionResult> {
  const quantity = Math.min(MAX_QUANTITY, Math.max(1, numberParam(url, ["quantity", "limit"], DEFAULT_QUANTITY)));
  const collectionTarget = Math.min(quantity, MAX_AIS_STREAM_COLLECTION);
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(2500, numberParam(url, ["timeoutMs"], DEFAULT_TIMEOUT_MS)));
  const bounds = getRequestedBoundingBoxes(url);
  if (!bounds) {
    return Promise.reject(new Error("AIS POL/POD bounding boxes are required."));
  }

  return new Promise<LiveCollectionResult>((resolve, reject) => {
    const vesselsByKey = new Map<string, VesselMessage>();
    const ws = new WebSocket(AIS_STREAM_URL, {
      handshakeTimeout: Math.min(timeoutMs, 5000),
      perMessageDeflate: false,
      family: 4,
    });
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = (completion: LiveCollectionResult["completion"], error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      try {
        ws.close();
      } catch (_) {}

      if (error && vesselsByKey.size === 0) {
        reject(error);
        return;
      }

      resolve({
        vessels: Array.from(vesselsByKey.values()).slice(0, collectionTarget),
        completion,
      });
    };

    timer = setTimeout(() => {
      console.log(`AIS stream live capture timed out after ${timeoutMs}ms with ${vesselsByKey.size} vessels.`);
      finish("timeout");
    }, timeoutMs);

    ws.on("open", () => {
      const subscriptionMessage: Record<string, unknown> = {
        APIKey: apiKey,
        BoundingBoxes: bounds,
        FilterMessageTypes: [
          "PositionReport",
          "StandardClassBPositionReport",
          "ExtendedClassBPositionReport",
          "ShipStaticData",
        ],
      };
      const debugSubscriptionMessage = { ...subscriptionMessage, APIKey: apiKey ? "[redacted]" : "" };
      console.log(JSON.stringify(debugSubscriptionMessage));
      ws.send(JSON.stringify(subscriptionMessage));
    });

    ws.on("message", (data: { toString: () => string }) => {
      try {
        const message = normalizeVesselMessage(JSON.parse(data.toString()) as VesselMessage);
        const key = getVesselKey(message);
        if (!key) return;
        vesselsByKey.set(key, mergeDefinedVesselFields(vesselsByKey.get(key), message));
        if (vesselsByKey.size >= collectionTarget) finish("target");
      } catch (_) {}
    });

    ws.on("error", (error: Error & { code?: string }) => {
      console.error("AIS stream websocket error:", {
        code: error.code || null,
        message: error.message,
      });
      const diagnosticCode = error.code ? ` (${error.code})` : "";
      finish("error", new Error(`AIS stream connection failed${diagnosticCode}.`));
    });

    ws.on("close", (code: number, reason: Buffer) => {
      const reasonText = reason?.toString() || "";
      console.warn("AIS stream websocket closed:", JSON.stringify({ code, reason: reasonText || null, collected: vesselsByKey.size }));
      finish("closed");
    });
  });
}

export async function handleGetVessels(req: Request) {
  const url = new URL(req.url);
  const strictTaxonomyMode = url.searchParams.get("taxonomyMode") === "strict";
  const requestedTaxonomies = parseRequestedTaxonomies(url);
  if (strictTaxonomyMode && requestedTaxonomies.length === 0) {
    return vesselsResponse({
      vessels: [],
      error: "At least one valid vessel taxonomy is required",
      source: "strict-taxonomy-validation",
    }, { status: 400 });
  }
  const requestedQuantity = Math.min(MAX_QUANTITY, Math.max(1, numberParam(url, ["quantity", "limit"], DEFAULT_QUANTITY)));
  const apiKey = getApiKey();
  const forceLive = isForceLiveRequest(url);

  if (url.searchParams.get("action") === "reset-cache") {
    vesselCache = [];
    cacheUpdatedAt = 0;
    return vesselsResponse({ ok: true, reset: true });
  }

  if (url.searchParams.get("action") === "validate-key") {
    if (!apiKey) {
      return vesselsResponse(
        { ok: false, valid: false, error: "AIS stream API key is not configured on the server." },
        { status: 401 },
      );
    }

    return vesselsResponse({ ok: true, valid: true });
  }

  if (!getRequestedBoundingBoxes(url)) {
    const vesselSearch = textParam(url, ["q", "search", "vesselName"], "");
    if (vesselSearch) {
      if (vesselCache.length === 0) {
        vesselCache = await readStoredVesselMessages(requestedQuantity);
        if (vesselCache.length > 0) cacheUpdatedAt = Date.now();
      }
      const filtered = vesselCache;
      return vesselsResponse({
        vessels: filtered,
        updatedAt: cacheUpdatedAt,
        source: vesselCache.length ? "global-cache-search" : "empty-fallback",
      });
    }
    return vesselsResponse({
      vessels: [],
      updatedAt: cacheUpdatedAt,
      source: "geofence-required",
      message: "POL coordinates and a geographic radius are required.",
    }, { status: 400 });
  }

  if (!apiKey) {
    if (forceLive) {
      return vesselsResponse(
        {
          vessels: [],
          message: "Data recolectada: 0 buques recibidos del barrido en vivo",
          warning: "AIS stream API key is not configured on the server.",
          updatedAt: cacheUpdatedAt,
          source: "live-error-empty",
        },
        { status: 401 },
      );
    }

    const storedVessels = await readStoredVesselMessages(requestedQuantity, url);
    if (storedVessels.length > 0) {
      vesselCache = storedVessels;
      cacheUpdatedAt = Date.now();
    }

    const filtered = filterSelectiveVessels(url, vesselCache);
    return vesselsResponse({
      vessels: filtered,
      message: `Data recolectada: ${filtered.length} buques filtrados con éxito`,
      warning: "AIS stream API key is not configured on the server.",
      updatedAt: cacheUpdatedAt,
      source: vesselCache.length ? "stored-cache" : "empty-fallback",
    });
  }

  try {
    const liveResult = await collectVessels(url, apiKey);
    const liveVessels = liveResult.vessels;
    const storedVessels = await readStoredVesselMessages(Math.max(requestedQuantity, STORED_LOOKUP_LIMIT), url);
    const completedLiveVessels = completeIncomingVesselsFromStore(storedVessels, liveVessels);
    const acceptedLiveVessels = strictTaxonomyMode
      ? filterVesselsByTaxonomies(completedLiveVessels, requestedTaxonomies)
      : completedLiveVessels;
    const vessels = completedLiveVessels.length > 0
      ? mergeVesselMessageLists(storedVessels, liveVessels)
      : [];
    let persistenceResult = { persistedCount: 0, masterPersistedCount: 0, databaseVesselCount: await countVessels() };

    if (acceptedLiveVessels.length > 0) {
      vesselCache = vessels;
      cacheUpdatedAt = Date.now();
      persistenceResult = await persistVesselMessages(acceptedLiveVessels);
    } else if (!forceLive && vesselCache.length === 0) {
      vesselCache = storedVessels;
      if (vesselCache.length > 0) cacheUpdatedAt = Date.now();
    }

    const responseVessels = filterSelectiveVessels(
      url,
      forceLive ? acceptedLiveVessels : (vessels.length ? vessels : vesselCache),
    );
    const source = vessels.length
      ? "aisstream-live"
      : forceLive && liveResult.completion === "timeout"
        ? "live-timeout-empty"
        : forceLive
          ? "live-empty"
          : "stored-cache";
    return vesselsResponse(
      {
        vessels: responseVessels,
        updatedAt: cacheUpdatedAt,
        source,
        persistedCount: persistenceResult.persistedCount,
        databaseVesselCount: persistenceResult.databaseVesselCount,
        selectedTaxonomies: strictTaxonomyMode ? requestedTaxonomies : undefined,
        discardedByTaxonomy: strictTaxonomyMode ? Math.max(0, completedLiveVessels.length - acceptedLiveVessels.length) : 0,
        message: forceLive
          ? `Data recolectada: ${responseVessels.length} buques recibidos del barrido en vivo`
          : `Data recolectada: ${responseVessels.length} buques filtrados con éxito`,
      },
      {
        headers: {
          "x-ais-persisted-count": String(persistenceResult.persistedCount),
          "x-ais-target-count": String(requestedQuantity),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "AIS stream request failed.";
    const storedVessels = await readStoredVesselMessages(Math.max(requestedQuantity, STORED_LOOKUP_LIMIT), url);
    const acceptedStoredVessels = strictTaxonomyMode
      ? filterVesselsByTaxonomies(storedVessels, requestedTaxonomies)
      : storedVessels;
    if (storedVessels.length > 0) {
      vesselCache = storedVessels;
      cacheUpdatedAt = Date.now();
    }
    const filtered = filterSelectiveVessels(url, acceptedStoredVessels);
    const databaseVesselCount = await countVessels();

    return vesselsResponse({
      ok: true,
      vessels: filtered,
      message: filtered.length > 0
        ? `AISStream no está disponible; se cargaron ${filtered.length} buques validados desde la base de datos.`
        : "AISStream no está disponible y no hay buques validados para los filtros y la zona solicitados.",
      warning: message,
      degraded: true,
      liveConnection: false,
      availableVesselCount: filtered.length,
      persistedCount: 0,
      masterPersistedCount: 0,
      databaseVesselCount,
      selectedTaxonomies: strictTaxonomyMode ? requestedTaxonomies : undefined,
      updatedAt: cacheUpdatedAt,
      source: filtered.length > 0 ? "stored-fallback" : "stored-fallback-empty",
    }, {
      headers: {
        "x-ais-persisted-count": "0",
        "x-ais-target-count": String(requestedQuantity),
        "x-ais-degraded": "true",
      },
    });
  }
}

export default handleGetVessels;

export const config: Config = {
  method: ["GET", "POST"],
};
