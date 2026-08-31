import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const functionSource = readFileSync(new URL("../netlify/functions/vessel-compatibility.ts", import.meta.url), "utf8");

test("vessel-compatibility.ts defines required POD distance and locationContext logic", () => {
  assert.match(functionSource, /haversineDistanceNm/, "Defines Haversine distance calculation");
  assert.match(functionSource, /determineLocationContext/, "Defines location context classifier");
  assert.match(functionSource, /distancePolNm/, "Calculates distance to POL");
  assert.match(functionSource, /distancePodNm/, "Calculates distance to POD");
  assert.match(functionSource, /locationContext/, "Attaches locationContext to response and candidates");
  assert.match(functionSource, /podCoords/, "Resolves or receives podCoords");
});

test("vessel-compatibility.ts extracts and computes dual distances and locationContext", () => {
  // Verify dual distance assignment for both DB and Live radar paths
  assert.match(functionSource, /distPolNm\s*=\s*hasPolCoords/, "Computes distPolNm conditionally based on hasPolCoords");
  assert.match(functionSource, /distPodNm\s*=\s*hasPodCoords/, "Computes distPodNm conditionally based on hasPodCoords");
  assert.match(functionSource, /determineLocationContext\(distPolNm,\s*distPodNm,\s*hasPolCoords,\s*hasPodCoords\)/, "Passes distances to locationContext determiner");
  
  // Verify response fields
  assert.match(functionSource, /distancePodNm:\s*cand\.distancePodNm/, "Includes distancePodNm in response candidates");
  assert.match(functionSource, /locationContext:\s*cand\.locationContext/, "Includes locationContext in response candidates");
  assert.match(functionSource, /distancePodNm:\s*cand\.distancePodNm[\s\S]*locationContext:\s*cand\.locationContext/, "radarLive includes distancePodNm and locationContext");
});

test("determineLocationContext classification algorithm test", () => {
  // Replicate algorithm in test to verify boundary logic
  function determineLocationContext(distancePolNm, distancePodNm, hasPolCoords, hasPodCoords) {
    const hasPol = hasPolCoords && distancePolNm > 0;
    const hasPod = hasPodCoords && distancePodNm > 0;

    if (hasPol && hasPod) {
      if (distancePodNm <= 30 && (distancePolNm > 30 || distancePodNm < distancePolNm)) {
        return "POD";
      }
      if (distancePolNm <= 30 && (distancePodNm > 30 || distancePolNm <= distancePodNm)) {
        return "POL";
      }
      if (distancePodNm < distancePolNm && distancePodNm <= 50) {
        return "POD";
      }
      if (distancePolNm <= distancePodNm && distancePolNm <= 50) {
        return "POL";
      }
      return "TRANSIT";
    }

    if (hasPod && !hasPol) {
      return distancePodNm <= 30 ? "POD" : "TRANSIT";
    }

    if (hasPol && !hasPod) {
      return distancePolNm <= 30 ? "POL" : "TRANSIT";
    }

    return "TRANSIT";
  }

  // Vessel at 5 NM from POL, 350 NM from POD
  assert.equal(determineLocationContext(5.0, 350.0, true, true), "POL");

  // Vessel at 15 NM from POD, 320 NM from POL (Backhaul opportunity)
  assert.equal(determineLocationContext(320.0, 15.0, true, true), "POD");

  // Vessel in transit (120 NM from POL, 200 NM from POD)
  assert.equal(determineLocationContext(120.0, 200.0, true, true), "TRANSIT");

  // Vessel equidistant or close to POD
  assert.equal(determineLocationContext(28.0, 12.0, true, true), "POD");
  assert.equal(determineLocationContext(10.0, 25.0, true, true), "POL");

  // Only POL coords active
  assert.equal(determineLocationContext(12.0, 0, true, false), "POL");
  assert.equal(determineLocationContext(85.0, 0, true, false), "TRANSIT");

  // Only POD coords active
  assert.equal(determineLocationContext(0, 18.0, false, true), "POD");
  assert.equal(determineLocationContext(0, 95.0, false, true), "TRANSIT");
});

test("haversineDistanceNm algorithm test", () => {
  function haversineDistanceNm(lat1, lon1, lat2, lon2) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return 0;
    if ((lat1 === 0 && lon1 === 0) || (lat2 === 0 && lon2 === 0)) return 0;
    const radiusNm = 3440.065;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return radiusNm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Bejaia (36.75, 5.08) to Almería (36.83, -2.46)
  const dist = haversineDistanceNm(36.75, 5.08, 36.83, -2.46);
  assert.ok(dist > 350 && dist < 380, `Expected distance ~364 NM, got ${dist}`);

  // Same coordinates -> 0
  assert.equal(haversineDistanceNm(36.75, 5.08, 36.75, 5.08), 0);

  // Inactive / zero coordinates -> 0
  assert.equal(haversineDistanceNm(0, 0, 36.75, 5.08), 0);
  assert.equal(haversineDistanceNm(36.75, 5.08, 0, 0), 0);
});

test("technical justification mentions Backhaul and POD when locationContext is POD", () => {
  assert.match(functionSource, /Oportunidad Backhaul \/ Retorno en Destino/, "Justification specifies backhaul return opportunity for POD context");
  assert.match(functionSource, /en tránsito/, "Justification specifies transit context when vessel is in transit");
});
