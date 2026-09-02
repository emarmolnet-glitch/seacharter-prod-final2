import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeDatalasticParticulars,
  resolveVesselByImo,
  serializeVesselRecord,
} from "../netlify/functions/_shared/vessel-lookup.mjs";

const endpointSource = await readFile(new URL("../netlify/functions/vessel.ts", import.meta.url), "utf8");
const cacheSource = await readFile(new URL("../db/vessel-technical-cache.ts", import.meta.url), "utf8");

test("the vessel endpoint exposes the IMO route and queries vessels_master before Datalastic", () => {
  assert.match(endpointSource, /path: "\/api\/vessel\/:imo"/);
  assert.match(endpointSource, /findVesselTechnicalRecord\(imo, null, null\)/);
  assert.match(endpointSource, /getVesselParticulars\(String\(imo\)\)/);
  assert.match(endpointSource, /upsertVesselTechnicalRecord/);
  assert.match(cacheSource, /FROM vessels_master/);
  assert.doesNotMatch(endpointSource, /vessels_master_table/);
  assert.doesNotMatch(cacheSource, /vessels_master_table/);
});

test("database failures abort the Datalastic fallback", () => {
  assert.match(endpointSource, /Neon lookup failed; Datalastic fallback aborted/);
  assert.match(endpointSource, /error instanceof LocalDatabaseLookupError/);
});

test("database hits consume no provider credits and perform no writes", async () => {
  const cached = { imoNumber: 9319466, vesselName: "Cached Vessel" };
  const calls = [];
  const result = await resolveVesselByImo({
    imoNumber: 9319466,
    findInDatabase: async () => cached,
    fetchFromDatalastic: async () => {
      calls.push("fetch");
      return { data: {} };
    },
    saveRecord: async () => {
      calls.push("save");
      return cached;
    },
  });

  assert.equal(result.cache, "hit");
  assert.strictEqual(result.vessel, cached);
  assert.deepEqual(calls, []);
  assert.match(endpointSource, /creditsConsumed: result\.cache === "hit" \|\| result\.providerMeta\?\.cacheStatus !== "MISS" \? 0 : 1/);
});

test("database misses normalize Datalastic particulars and persist the upserted record", async () => {
  const calls = [];
  const result = await resolveVesselByImo({
    imoNumber: 9319466,
    findInDatabase: async () => null,
    fetchFromDatalastic: async () => {
      calls.push("fetch");
      return {
        data: {
          imoNumber: "9319466",
          vesselName: "DATALASTIC STAR",
          dwt: "52123",
          draftMeters: "10.4",
          loaMeters: "189.5",
          beamMeters: "32.2",
        },
        meta: { cacheStatus: "MISS" },
      };
    },
    saveRecord: async (record) => {
      calls.push("save");
      return { ...record, grossTonnage: 30200 };
    },
  });

  assert.equal(result.cache, "miss");
  assert.equal(result.providerMeta.cacheStatus, "MISS");
  assert.equal(result.vessel.dwt, 52123);
  assert.equal(result.vessel.draftMeters, 10.4);
  assert.equal(result.vessel.loaMeters, 189.5);
  assert.equal(result.vessel.beamMeters, 32.2);
  assert.deepEqual(calls, ["fetch", "save"]);
  assert.match(endpointSource, /"VERIFIED_DATALASTIC"/);
});

test("Datalastic responses cannot overwrite a different requested IMO", () => {
  assert.throws(
    () => normalizeDatalasticParticulars({ imoNumber: 9999999, vesselName: "Wrong Vessel" }, 9319466),
    /different IMO number/,
  );
});

test("serialized records expose calculator technical field names", () => {
  const vessel = serializeVesselRecord(normalizeDatalasticParticulars({
    imoNumber: 9319466,
    vesselName: "Mapped Vessel",
    dwt: 52123,
    draftMeters: 10.4,
    loaMeters: 189.5,
    beamMeters: 32.2,
  }, 9319466));

  assert.equal(vessel.imo_number, 9319466);
  assert.equal(vessel.imo, 9319466);
  assert.equal(vessel.vessel_name, "Mapped Vessel");
  assert.equal(vessel.vesselName, "Mapped Vessel");
  assert.equal(vessel.dwt, 52123);
  assert.equal(vessel.draft_meters, 10.4);
  assert.equal(vessel.draft, 10.4);
  assert.equal(vessel.loa_meters, 189.5);
  assert.equal(vessel.loa, 189.5);
  assert.equal(vessel.beam_meters, 32.2);
  assert.equal(vessel.beam, 32.2);
  assert.equal(vessel.mmsi, null);
  assert.equal(vessel.data_source, "vessels_master");
  assert.ok("service_speed_knots" in vessel);
  assert.ok("spd_laden" in vessel);
  assert.ok("spd_ballast" in vessel);
  assert.ok("fuel_consumption_laden" in vessel);
  assert.ok("fuel_consumption_ballast" in vessel);
  assert.ok("owner_manager" in vessel);
});
