import type { Config } from "@netlify/functions";
import { seaRoute, type SeaRouteFeature } from "searoute-ts";
import { createResponseCacheHeaders, getOrSetCachedJson } from "./_shared/response-cache.js";

type RoutePoint = {
  name?: string;
  lat: number;
  lon: number;
};

const ANCHORAGE_RADIUS_NM = 15;

function toRadians(value: number): number {
  return value * (Math.PI / 180);
}

export function haversineDistanceNm(origin: RoutePoint, destination: RoutePoint): number {
  const earthRadiusNm = 3440.065;
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lon - origin.lon);
  const originLatitude = toRadians(origin.lat);
  const destinationLatitude = toRadians(destination.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toRoutePoint(value: unknown, arrayOrder: "latLon" | "lonLat" = "latLon"): RoutePoint | null {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    const lat = arrayOrder === "lonLat" ? second : first;
    const lon = arrayOrder === "lonLat" ? first : second;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  }

  const objectValue = pickObject(value);
  const coordinateOrder = objectValue.coordinateOrder === "lonLat" || objectValue.order === "lonLat" ? "lonLat" : arrayOrder;
  const coordinates = objectValue.coordinates ?? objectValue.coordinate ?? objectValue.point;
  if (Array.isArray(coordinates)) {
    const point = toRoutePoint(coordinates, coordinateOrder);
    if (point) {
      return {
        ...point,
        name: typeof objectValue.name === "string" ? objectValue.name : undefined,
      };
    }
  }

  const lat = Number(objectValue.lat ?? objectValue.latitude);
  const lon = Number(objectValue.lon ?? objectValue.lng ?? objectValue.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return {
    name: typeof objectValue.name === "string" ? objectValue.name : undefined,
    lat,
    lon,
  };
}

function getRequestRoutePoints(body: Record<string, unknown>): { origin: RoutePoint | null; destination: RoutePoint | null } {
  const coordinatePairs = Array.isArray(body.coordinates) ? body.coordinates : [];
  const originInput = body.origin ?? body.from ?? body.start ?? body.source ?? coordinatePairs[0];
  const destinationInput = body.destination ?? body.to ?? body.end ?? body.target ?? coordinatePairs[1];
  const arrayOrder = body.coordinateOrder === "lonLat" || body.order === "lonLat" ? "lonLat" : "latLon";
  const coordinatesArrayOrder = body.coordinates ? "lonLat" : arrayOrder;

  return {
    origin: toRoutePoint(originInput, coordinatesArrayOrder),
    destination: toRoutePoint(destinationInput, coordinatesArrayOrder),
  };
}

function extractLineCoordinates(route: SeaRouteFeature): number[][] {
  const coords = route.geometry?.coordinates;
  if (!Array.isArray(coords)) return [];

  const lineCoordinates: number[][] = [];
  const collectCoordinates = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2
      && Number.isFinite(Number(value[0]))
      && Number.isFinite(Number(value[1]))
    ) {
      lineCoordinates.push([Number(value[1]), Number(value[0])]);
      return;
    }
    value.forEach(collectCoordinates);
  };

  collectCoordinates(coords);
  return lineCoordinates;
}

function pinEndpoints(coordinates: number[][], origin: RoutePoint, destination: RoutePoint): number[][] {
  const pinned = coordinates.length > 1
    ? coordinates.map((coord) => [Number(coord[0]), Number(coord[1])])
    : [[origin.lat, origin.lon], [destination.lat, destination.lon]];

  pinned[0] = [origin.lat, origin.lon];
  pinned[pinned.length - 1] = [destination.lat, destination.lon];

  return pinned.filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
}

function isBallastRoute(body: Record<string, unknown>): boolean {
  const routeKind = String(body.routeKind ?? body.legType ?? body.routeType ?? "").trim().toLowerCase();
  return routeKind === "ballast" || routeKind === "lastre";
}

function createZeroBallastRoute(origin: RoutePoint, destination: RoutePoint, directDistanceNm: number) {
  const coordinates = [[origin.lat, origin.lon], [destination.lat, destination.lon]];
  return {
    success: true,
    distance: 0,
    distance_nm: 0,
    duration_hours: 0,
    coordinates,
    geojson: {
      type: "Feature",
      properties: {
        distance: 0,
        distance_nm: 0,
        duration_hours: 0,
        units: "nauticalmiles",
        passages: [],
        zeroBallast: true,
      },
      geometry: {
        type: "LineString",
        coordinates: coordinates.map(([lat, lon]) => [lon, lat]),
      },
    },
    nodes: [origin, destination],
    passages: [],
    units: "nauticalmiles",
    coordinateOrder: "latLon",
    zeroBallast: true,
    fallbackReason: "anchorage-radius",
    directDistanceNm,
    anchorageRadiusNm: ANCHORAGE_RADIUS_NM,
  };
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = pickObject(await req.json());
    const { origin, destination } = getRequestRoutePoints(body);

    if (!origin || !destination) {
      return Response.json({
        success: false,
        error: "Invalid route payload",
        expected: {
          origin: { lat: "number", lon: "number", name: "optional string" },
          destination: { lat: "number", lon: "number", name: "optional string" },
        },
        acceptedAliases: ["origin/destination", "from/to", "start/end", "coordinates: [[lon, lat], [lon, lat]]"],
        receivedKeys: Object.keys(body),
      }, { status: 400 });
    }

    const directDistanceNm = haversineDistanceNm(origin, destination);
    if (isBallastRoute(body) && directDistanceNm < ANCHORAGE_RADIUS_NM) {
      return Response.json(createZeroBallastRoute(origin, destination, directDistanceNm), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const cachedRoute = await getOrSetCachedJson({
      namespace: "maritime-routes-v2",
      key: {
        origin: { lat: origin.lat, lon: origin.lon },
        destination: { lat: destination.lat, lon: destination.lon },
      },
      ttlMs: 24 * 60 * 60 * 1000,
      staleTtlMs: 7 * 24 * 60 * 60 * 1000,
      producer: async () => {
        const route = seaRoute(
          [origin.lon, origin.lat],
          [destination.lon, destination.lat],
          {
            units: "nauticalmiles",
            appendOriginDestination: true,
            returnPassages: true,
            maxSnapDistanceKm: 250,
          },
        );
        const routedCoordinates = extractLineCoordinates(route);
        const coordinates = pinEndpoints(routedCoordinates, origin, destination);
        const distance = Number(route.properties?.length);
        return {
          success: routedCoordinates.length > 1 && coordinates.length > 1 && Number.isFinite(distance),
          distance: Number.isFinite(distance) ? distance : 0,
          coordinates,
          geojson: {
            type: "Feature",
            properties: {
              distance: Number.isFinite(distance) ? distance : 0,
              units: route.properties?.units || "nauticalmiles",
              passages: route.properties?.passages || [],
            },
            geometry: {
              type: "LineString",
              coordinates: coordinates.map(([lat, lon]) => [lon, lat]),
            },
          },
          nodes: [origin, destination],
          passages: route.properties?.passages || [],
          units: route.properties?.units || "nauticalmiles",
          coordinateOrder: "latLon",
        };
      },
    });

    return Response.json(cachedRoute.value, {
      headers: createResponseCacheHeaders(cachedRoute, 86_400, 604_800),
    });
  } catch (err) {
    console.error("[route] Maritime route calculation failed.", err);
    return Response.json({ success: false, error: "Route calculation failed" }, { status: 422 });
  }
};

export const config: Config = {
  path: "/api/route",
};
