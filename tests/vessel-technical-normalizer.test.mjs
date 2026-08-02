import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeEta,
  prepareVesselTechnicalPersistence,
  sanitizeVesselTechnicalRecord,
} from "../db/vessel-technical-normalizer.mjs";

test("technical persistence sanitizes empty and invalid values to null", () => {
  assert.deepEqual(sanitizeVesselTechnicalRecord({
    imoNumber: "9876543",
    mmsi: undefined,
    vesselName: "  TEST VESSEL  ",
    dwt: "10,953 MT",
    latitude: "",
    longitude: undefined,
    vesselType: "General Cargo",
    draftMeters: "0",
    flag: "Barbados",
    callSign: " ",
    yearBuilt: "not-a-year",
    grossTonnage: "7,580",
    netTonnage: "",
    loaMeters: "138.4 m",
    beamMeters: undefined,
    lastPort: " ",
    eta: "",
  }), {
    imoNumber: 9876543,
    mmsi: null,
    vesselName: "TEST VESSEL",
    dwt: 10953,
    latitude: null,
    longitude: null,
    vesselType: "General Cargo",
    draftMeters: null,
    flag: "BB",
    callSign: null,
    yearBuilt: null,
    grossTonnage: 7580,
    netTonnage: null,
    loaMeters: 138.4,
    beamMeters: null,
    lastPort: null,
    eta: null,
  });
});

test("technical persistence keeps ISO and textual ETA values safely", () => {
  const prepared = prepareVesselTechnicalPersistence({
    imoNumber: 9337250,
    flag: "Liberia",
    callSign: "D5MB8",
    vesselType: "Container Ship",
    netTonnage: 16420,
    loaMeters: 222.15,
    beamMeters: 30,
    lastPort: "Tokyo, Japan",
    eta: "2026-08-04T22:00:00Z",
  });

  assert.equal(prepared.parameters.length, 17);
  assert.equal(prepared.parameters[8], "LR");
  assert.equal(prepared.parameters[9], "D5MB8");
  assert.equal(prepared.parameters[12], 16420);
  assert.equal(prepared.parameters[13], 222.15);
  assert.equal(prepared.parameters[14], 30);
  assert.equal(prepared.parameters[15], "Tokyo, Japan");
  assert.equal(prepared.parameters[16], "2026-08-04T22:00:00.000Z");
});

test("VesselFinder textual ETA is converted using the August 2, 2026 reference date", () => {
  assert.equal(
    normalizeEta("Aug 4, 22:00", new Date("2026-08-02T12:00:00Z")),
    "2026-08-04T22:00:00.000Z",
  );
  assert.equal(normalizeEta("not-a-date", new Date("2026-08-02T12:00:00Z")), null);
});

test("unknown flags and non-scalar ETA values never reach SQL", () => {
  const prepared = prepareVesselTechnicalPersistence({
    imoNumber: 9337250,
    flag: "Atlantis",
    eta: { invalid: true },
  });

  assert.equal(prepared.parameters[8], null);
  assert.equal(prepared.parameters[16], null);
});
