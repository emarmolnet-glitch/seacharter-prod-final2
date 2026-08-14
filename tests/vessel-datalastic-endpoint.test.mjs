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

  assert.deepEqual(vessel, {
    imo_number: 9319466,
    mmsi: null,
    vessel_name: "Mapped Vessel",
    dwt: 52123,
    latitude: null,
    longitude: null,
    vessel_type: null,
    draft_meters: 10.4,
    flag: null,
    call_sign: null,
    year_built: null,
    gross_tonnage: null,
    net_tonnage: null,
    loa_meters: 189.5,
    beam_meters: 32.2,
    last_port: null,
    eta: null,
  });
});
