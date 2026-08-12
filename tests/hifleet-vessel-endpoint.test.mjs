import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fetchHifleetVessel,
  formatHifleetApiError,
  HifleetConfigurationError,
  HifleetUpstreamError,
  normalizeHifleetPayload,
  resolveVesselByImo,
} from "../netlify/functions/_shared/hifleet-vessel.mjs";

const endpointSource = await readFile(new URL("../netlify/functions/vessel.ts", import.meta.url), "utf8");

test("the vessel endpoint exposes the dynamic IMO route and uses the local cache first", () => {
  assert.match(endpointSource, /path: "\/api\/vessel\/:imo"/);
  assert.match(endpointSource, /findVesselTechnicalRecord/);
  assert.match(endpointSource, /fetchHifleetVessel/);
  assert.match(endpointSource, /upsertVesselTechnicalRecord/);
  assert.match(endpointSource, /formatHifleetApiError/);
});

test("cache hits never call HiFleet or write the database", async () => {
  const calls = [];
  const cached = { imoNumber: 9319466, vesselName: "Cached Vessel" };
  const result = await resolveVesselByImo({
    imoNumber: 9319466,
    findCached: async () => cached,
    fetchRemote: async () => calls.push("fetch"),
    saveRecord: async () => calls.push("save"),
  });

  assert.equal(result.cache, "hit");
  assert.strictEqual(result.vessel, cached);
  assert.deepEqual(calls, []);
});

test("cache misses fetch, normalize, persist, and return the saved record", async () => {
  const calls = [];
  const remote = { imoNumber: 9319466, vesselName: "Remote Vessel", dwt: 52123 };
  const saved = { ...remote, grossTonnage: 30200 };
  const result = await resolveVesselByImo({
    imoNumber: 9319466,
    findCached: async () => null,
    fetchRemote: async () => {
      calls.push("fetch");
      return remote;
    },
    saveRecord: async (record) => {
      calls.push("save");
      assert.strictEqual(record, remote);
      return saved;
    },
  });

  assert.equal(result.cache, "miss");
  assert.strictEqual(result.vessel, saved);
  assert.deepEqual(calls, ["fetch", "save"]);
});

test("HiFleet numeric strings are converted into database-ready numbers", () => {
  const vessel = normalizeHifleetPayload({
    IMO: "9319466",
    ShipName: "AUTHENTICATED STAR",
    DWT: "52,123 MT",
    GT: "30,200",
    LOA: "189.5 m",
    Beam: "32,20 m",
    Built: "2011",
  }, 9319466);

  assert.equal(vessel.imoNumber, 9319466);
  assert.equal(vessel.dwt, 52123);
  assert.equal(vessel.grossTonnage, 30200);
  assert.equal(vessel.loaMeters, 189.5);
  assert.equal(vessel.beamMeters, 32.2);
  assert.equal(vessel.yearBuilt, 2011);
});

test("censored HiFleet fields are rejected instead of entering the cache", () => {
  assert.throws(
    () => normalizeHifleetPayload({ imo: 9319466, vesselName: "MASKED", dwt: "******", gt: "******" }, 9319466),
    HifleetUpstreamError,
  );
});

test("HiFleet requests require HIFLEET_COOKIE and use the exact getShipDatav3 payload", async () => {
  await assert.rejects(
    fetchHifleetVessel({
      imoNumber: 9319466,
      env: { HIFLEET_API_URL: "https://provider.test/getShipDatav3" },
      fetchImpl: async () => Response.json({}),
    }),
    HifleetConfigurationError,
  );

  const requests = [];
  const vessel = await fetchHifleetVessel({
    imoNumber: 9319466,
    env: {
      HIFLEET_API_URL: "https://provider.test/getShipDatav3",
      HIFLEET_COOKIE: "session=test-value",
    },
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return Response.json({
        total: 1,
        data: [
          { imo: 9319466, vesselName: "AUTHORIZED", dwt: "10000", gt: "7000" },
          { imo: 9999999, vesselName: "IGNORED", dwt: "99999", gt: "99999" },
        ],
      });
    },
  });

  assert.equal(requests[0].url.search, "");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Cookie, "session=test-value");
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.equal(vessel.vesselName, "AUTHORIZED");
  assert.equal(vessel.imoNumber, 9319466);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    limit: 1,
    offset: 1,
    params: {
      shipname: "",
      callsign: "",
      shiptype: "",
      shipflag: "",
      keyword: "",
      mmsi: -1,
      imo: 9319466,
    },
    _v: "5.3.588",
  });
});

test("HiFleet ignores legacy provider variable names", async () => {
  await assert.rejects(
    fetchHifleetVessel({
      imoNumber: 9319466,
      env: {
        HIFLEET_GET_SHIP_DATA_URL: "https://provider.test/getShipDatav3",
        HIFLEET_SESSION_COOKIE: "session=legacy-value",
      },
      fetchImpl: async () => Response.json({}),
    }),
    HifleetConfigurationError,
  );
});

test("HiFleet HTTP errors preserve the provider status and response detail", async () => {
  await assert.rejects(
    fetchHifleetVessel({
      imoNumber: 9319466,
      env: {
        HIFLEET_API_URL: "https://provider.test/getShipDatav3",
        HIFLEET_COOKIE: "session=test-value",
      },
      fetchImpl: async () => Response.json(
        { error: "Cookie expired" },
        { status: 401 },
      ),
    }),
    (error) => {
      assert.ok(error instanceof HifleetUpstreamError);
      assert.equal(error.status, 401);
      assert.equal(error.detail, '{"error":"Cookie expired"}');
      assert.equal(
        formatHifleetApiError(error),
        'HiFleet API Error [401]: {"error":"Cookie expired"}',
      );
      return true;
    },
  );
});

test("HiFleet request exceptions extract Axios-style status and data", async () => {
  await assert.rejects(
    fetchHifleetVessel({
      imoNumber: 9319466,
      env: {
        HIFLEET_API_URL: "https://provider.test/getShipDatav3",
        HIFLEET_COOKIE: "session=test-value",
      },
      fetchImpl: async () => {
        throw {
          response: {
            status: 400,
            data: { message: "Malformed payload" },
          },
        };
      },
    }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(
        formatHifleetApiError(error),
        'HiFleet API Error [400]: {"message":"Malformed payload"}',
      );
      return true;
    },
  );
});
