export function extractFlatRoute(body) {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body.route)) return body.route;
  const routeObj = body.route && typeof body.route === "object" ? body.route : null;
  if (Array.isArray(routeObj?.coordinates)) return routeObj.coordinates;
  const geomObj = routeObj?.geometry && typeof routeObj.geometry === "object" ? routeObj.geometry : null;
  if (Array.isArray(geomObj?.coordinates)) return geomObj.coordinates;
  if (Array.isArray(body.maritime_route)) return body.maritime_route;
  if (Array.isArray(body.waypoints)) return body.waypoints;
  return body.route;
}

export function normalizeBunkerArbitrageRequestBody(rawBuffer) {
  if (!rawBuffer) return undefined;
  try {
    const text = new TextDecoder().decode(rawBuffer);
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const flat = extractFlatRoute(parsed);
      if (flat) {
        parsed.route = flat;
      }
      return new TextEncoder().encode(JSON.stringify(parsed)).buffer;
    }
    return rawBuffer;
  } catch {
    return rawBuffer;
  }
}
