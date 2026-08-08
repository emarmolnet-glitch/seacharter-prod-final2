const DEFAULT_RADIUS_NM = 1000;
const MIN_RADIUS_NM = 25;
const MAX_RADIUS_NM = 2000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

export type AisGeofence = {
  latitude: number;
  longitude: number;
  radiusNm: number;
  limit: number;
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  crossesAntimeridian: boolean;
};

function parseFiniteNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeLongitude(value: number) {
  return ((value + 540) % 360) - 180;
}

export function parseAisGeofence(url: URL): AisGeofence | null {
  const latitude = parseFiniteNumber(url.searchParams.get("polLat"));
  const longitude = parseFiniteNumber(url.searchParams.get("polLon"));
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const requestedRadius = parseFiniteNumber(url.searchParams.get("radiusNm")) ?? DEFAULT_RADIUS_NM;
  const requestedLimit = parseFiniteNumber(url.searchParams.get("limit")) ?? DEFAULT_LIMIT;
  const radiusNm = clamp(requestedRadius, MIN_RADIUS_NM, MAX_RADIUS_NM);
  const limit = Math.trunc(clamp(requestedLimit, 1, MAX_LIMIT));
  const latitudeDelta = radiusNm / 60;
  const longitudeDelta = radiusNm / (60 * Math.max(0.1, Math.cos(latitude * Math.PI / 180)));
  const rawMinLongitude = longitude - longitudeDelta;
  const rawMaxLongitude = longitude + longitudeDelta;

  return {
    latitude,
    longitude,
    radiusNm,
    limit,
    minLatitude: Math.max(-90, latitude - latitudeDelta),
    maxLatitude: Math.min(90, latitude + latitudeDelta),
    minLongitude: normalizeLongitude(rawMinLongitude),
    maxLongitude: normalizeLongitude(rawMaxLongitude),
    crossesAntimeridian: rawMinLongitude < -180 || rawMaxLongitude > 180,
  };
}

export function missingAisGeofenceResponse() {
  return Response.json({
    success: false,
    error: "POL geofence required",
    message: "Selecciona un Puerto de Carga válido antes de consultar buques.",
    vessels: [],
    count: 0,
  }, {
    status: 400,
    headers: { "cache-control": "no-store" },
  });
}
