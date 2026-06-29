import type { Config } from "@netlify/functions";
import { seaRoute, type SeaRouteFeature } from "searoute-ts";

type RoutePoint = {
  name?: string;
  lat: number;
  lon: number;
};

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toRoutePoint(value: unknown): RoutePoint | null {
  const objectValue = pickObject(value);
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

function extractLineCoordinates(route: SeaRouteFeature): number[][] {
  const coords = route.geometry?.coordinates;
  if (!Array.isArray(coords)) return [];

  return coords
    .filter((coord): coord is [number, number] => (
      Array.isArray(coord)
      && Number.isFinite(Number(coord[0]))
      && Number.isFinite(Number(coord[1]))
    ))
    .map((coord) => [Number(coord[1]), Number(coord[0])]);
}

function pinEndpoints(coordinates: number[][], origin: RoutePoint, destination: RoutePoint): number[][] {
  const pinned = coordinates.length > 1
    ? coordinates.map((coord) => [Number(coord[0]), Number(coord[1])])
    : [[origin.lat, origin.lon], [destination.lat, destination.lon]];

  pinned[0] = [origin.lat, origin.lon];
  pinned[pinned.length - 1] = [destination.lat, destination.lon];

  return pinned.filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = pickObject(await req.json());
    const origin = toRoutePoint(body.origin);
    const destination = toRoutePoint(body.destination);

    if (!origin || !destination) {
      return Response.json({ error: "Invalid origin or destination" }, { status: 400 });
    }

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

    const coordinates = pinEndpoints(extractLineCoordinates(route), origin, destination);
    const distance = Number(route.properties?.length);

    return Response.json({
      success: coordinates.length > 1 && Number.isFinite(distance),
      distance: Number.isFinite(distance) ? distance : 0,
      coordinates,
      nodes: [origin, destination],
      passages: route.properties?.passages || [],
      units: route.properties?.units || "nauticalmiles",
    });
  } catch (err) {
    console.error("[route] Maritime route calculation failed.", err);
    return Response.json({ success: false, error: "Route calculation failed" }, { status: 422 });
  }
};

export const config: Config = {
  path: "/api/route",
};
