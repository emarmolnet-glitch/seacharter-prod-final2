import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractFlatRoute,
  normalizeBunkerArbitrageRequestBody,
} from "../netlify/functions/_shared/databridge-routing-helper.mjs";

const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const proxySource = await readFile(new URL("../netlify/functions/databridge-proxy.ts", import.meta.url), "utf8");

// Béjaïa (Algeria) to Aveiro (Portugal) route coordinates in [lat, lon]
const BEJAIA_COORDS = [36.7511783, 5.0643687];
const GIBRALTAR_STRAIT_COORDS = [35.98, -5.45];
const AVEIRO_COORDS = [40.640496, -8.6537841];
const BEJAIA_AVEIRO_ROUTE = [BEJAIA_COORDS, GIBRALTAR_STRAIT_COORDS, AVEIRO_COORDS];

test("index.html converts routeCoords from [lat, lon] to GeoJSON [lon, lat] and includes coordinate_order: 'lon_lat'", () => {
  assert.match(
    indexSource,
    /routeCoords\s*=\s*Array\.isArray\(rawRoute\)\s*\?\s*rawRoute\s*:\s*\(Array\.isArray\(rawRoute\?\.coordinates\)\s*\?\s*rawRoute\.coordinates\s*:\s*\[\]\)/
  );
  assert.match(
    indexSource,
    /geoJsonCoords\s*=\s*routeCoords\.map\(\s*\(\s*\[\s*lat\s*,\s*lon\s*\]\s*\)\s*=>\s*\[\s*lon\s*,\s*lat\s*\]\s*\)/
  );
  assert.match(indexSource, /route:\s*geoJsonCoords/);
  assert.match(indexSource, /maritime_route:\s*geoJsonCoords/);
  assert.match(indexSource, /waypoints:\s*geoJsonCoords/);
  assert.match(indexSource, /coordinate_order:\s*['"]lon_lat['"]/);
  assert.match(indexSource, /pol:\s*rawRoute\?\.pol/);
  assert.match(indexSource, /pod:\s*rawRoute\?\.pod/);
  assert.match(indexSource, /distance_nm:\s*Number\(rawRoute\?\.distance_nm\)/);
});

test("route coordinate conversion transforms Béjaïa [36.7511783, 5.0643687] to [5.0643687, 36.7511783] for PostGIS ST_GeomFromGeoJSON", () => {
  const toGeoJson = (coords) => coords.map(([lat, lon]) => [lon, lat]);
  const converted = toGeoJson(BEJAIA_AVEIRO_ROUTE);
  assert.deepEqual(converted[0], [5.0643687, 36.7511783], "Béjaïa [lat, lon] should be converted to [lon, lat]");
  assert.deepEqual(converted[1], [-5.45, 35.98]);
  assert.deepEqual(converted[2], [-8.6537841, 40.640496]);
});

test("searchProfitableBunkerDiversions displays clean informative feedback when no suggestions are returned", () => {
  assert.match(
    indexSource,
    /setBunkerArbitrageFeedback\(\s*['"]No hay desvíos más baratos que el puerto de origen con los precios vigentes\.['"]\s*,\s*['"]info['"]\s*\)/
  );
  assert.doesNotMatch(
    indexSource,
    /setBunkerArbitrageFeedback\(\s*['"]No hay desvíos más baratos que el puerto de origen con los precios vigentes\.['"]\s*,\s*['"]error['"]\s*\)/
  );
});

test("index.html does not contain duplicate inline comments in bunker record reads", () => {
  assert.doesNotMatch(indexSource, /const vlsfo = Number\(record\.vlsfo\);\s*\/\/\s*const vlsfo/);
  assert.doesNotMatch(indexSource, /const ifo380 = Number\(record\.hsfo\);\s*\/\/\s*const ifo380/);
  assert.doesNotMatch(indexSource, /const mgo = Number\(record\.mgo\);\s*\/\/\s*const mgo/);
  assert.match(indexSource, /const vlsfo = Number\(record\.vlsfo\);/);
});

test("databridge-proxy.ts does not contain hardcoded prices or a local simulator handler", () => {
  assert.doesNotMatch(proxySource, /bunkerArbitrageHandler/);
  assert.doesNotMatch(proxySource, /DEFAULT_BUNKER_HUBS/);
  assert.doesNotMatch(proxySource, /Gibraltar/);
  assert.doesNotMatch(proxySource, /582/);
  assert.doesNotMatch(proxySource, /803/);
});

test("databridge-proxy.ts forwards routing/bunker-arbitrage to targetUrl using fetchPreservingMethod", () => {
  assert.match(proxySource, /forwardPath === "routing\/bunker-arbitrage"/);
  assert.match(proxySource, /body = normalizeBunkerArbitrageRequestBody\(body\)/);
  assert.match(proxySource, /fetchPreservingMethod\(targetUrl, req\.method, forwardHeaders, body\)/);
});

test("extractFlatRoute extracts flat array from various route wrappers", () => {
  assert.deepEqual(extractFlatRoute({ route: BEJAIA_AVEIRO_ROUTE }), BEJAIA_AVEIRO_ROUTE);
  assert.deepEqual(extractFlatRoute({ route: { coordinates: BEJAIA_AVEIRO_ROUTE } }), BEJAIA_AVEIRO_ROUTE);
  assert.deepEqual(extractFlatRoute({ route: { geometry: { coordinates: BEJAIA_AVEIRO_ROUTE } } }), BEJAIA_AVEIRO_ROUTE);
  assert.deepEqual(extractFlatRoute({ maritime_route: BEJAIA_AVEIRO_ROUTE }), BEJAIA_AVEIRO_ROUTE);
  assert.deepEqual(extractFlatRoute({ waypoints: BEJAIA_AVEIRO_ROUTE }), BEJAIA_AVEIRO_ROUTE);
});

test("normalizeBunkerArbitrageRequestBody converts wrapped route into flat array while preserving other fields", () => {
  const originalPayload = {
    route: {
      coordinates: BEJAIA_AVEIRO_ROUTE,
      source: "seacharter-routing-engine",
      distance_nm: 940,
    },
    coordinate_order: "lon_lat",
    pol: "Bejaia",
    pod: "Aveiro",
    distance_nm: 940,
    volume_required: 120,
    tce_daily: 15000,
    opex_daily: 5000,
    daily_consumption: 25,
    origin_price: 645,
    fuel_grade: "VLSFO",
  };

  const inputBuffer = new TextEncoder().encode(JSON.stringify(originalPayload)).buffer;
  const normalizedBuffer = normalizeBunkerArbitrageRequestBody(inputBuffer);
  assert.ok(normalizedBuffer, "Expected normalized buffer");

  const normalizedText = new TextDecoder().decode(normalizedBuffer);
  const normalizedJson = JSON.parse(normalizedText);

  assert.deepEqual(normalizedJson.route, BEJAIA_AVEIRO_ROUTE);
  assert.equal(normalizedJson.coordinate_order, "lon_lat");
  assert.equal(normalizedJson.pol, "Bejaia");
  assert.equal(normalizedJson.pod, "Aveiro");
  assert.equal(normalizedJson.distance_nm, 940);
  assert.equal(normalizedJson.volume_required, 120);
  assert.equal(normalizedJson.tce_daily, 15000);
  assert.equal(normalizedJson.origin_price, 645);
});
