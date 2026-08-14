import assert from "node:assert/strict";
import test from "node:test";

import {
  createAisCoordinator,
  getAisConsumptionSnapshot,
} from "../netlify/functions/_shared/aisCoordinator.js";

const environment = new Map([
  ["DATALASTIC_API_KEY", "test-key"],
  ["DATALASTIC_MONTHLY_CREDIT_LIMIT", "25"],
]);

globalThis.Netlify = {
  env: {
    get(name) {
      return environment.get(name);
    },
  },
};

function createMemoryStore() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async setJSON(key, value) {
      values.set(key, structuredClone(value));
    },
  };
}

function createBudgetGate({ allowed = true } = {}) {
  const calls = { locks: 0, reservations: 0, releases: 0 };
  return {
    calls,
    async withRequestLock(_cacheKey, operation) {
      calls.locks += 1;
      return operation({
        async reserve(period, limit) {
          calls.reservations += 1;
          return { allowed, usedCredits: allowed ? calls.reservations : limit, limit, period };
        },
        async release() {
          calls.releases += 1;
        },
      });
    },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("tracking reuses the five-minute cache and spends one credit", async () => {
  let fetchCount = 0;
  const budgetGate = createBudgetGate();
  const coordinator = createAisCoordinator({
    store: createMemoryStore(),
    budgetGate,
    now: () => Date.parse("2026-08-14T12:00:00.000Z"),
    fetchImpl: async (url) => {
      fetchCount += 1;
      assert.equal(url.pathname, "/api/v0/vessel");
      assert.equal(url.searchParams.get("imo"), "1234567");
      return jsonResponse({
        data: {
          name: "Shadow Vessel",
          imo: "1234567",
          lat: 41.2,
          lon: -8.7,
          speed: 11.5,
          eta_UTC: "2026-08-20T00:00:00Z",
        },
      });
    },
  });

  const first = await coordinator.getLivePosition("IMO 1234567");
  const second = await coordinator.getLivePosition("1234567");

  assert.equal(first.meta.cacheStatus, "MISS");
  assert.equal(second.meta.cacheStatus, "HIT");
  assert.equal(fetchCount, 1);
  assert.equal(budgetGate.calls.reservations, 1);
  assert.equal("eta" in first.data, false);
  assert.equal("eta_UTC" in first.data, false);
});

test("radar shares a normalized zone cache and excludes provider distance fields", async () => {
  let fetchCount = 0;
  const coordinator = createAisCoordinator({
    store: createMemoryStore(),
    budgetGate: createBudgetGate(),
    now: () => Date.parse("2026-08-14T12:05:00.000Z"),
    fetchImpl: async (url) => {
      fetchCount += 1;
      assert.equal(url.pathname, "/api/v0/vessel_inradius");
      assert.equal(url.searchParams.get("radius"), "10");
      return jsonResponse({
        data: {
          vessels: [{
            name: "Radar Vessel",
            imo: "7654321",
            lat: 40.1234,
            lon: -7.9876,
            distance: 3.2,
          }],
        },
      });
    },
  });

  const first = await coordinator.getRadarTraffic(40.12341, -7.98761);
  const second = await coordinator.getRadarTraffic(40.12342, -7.98762, 10);

  assert.equal(first.meta.cacheStatus, "MISS");
  assert.equal(second.meta.cacheStatus, "HIT");
  assert.equal(fetchCount, 1);
  assert.equal(first.data.length, 1);
  assert.equal("distance" in first.data[0], false);
});

test("the circuit breaker serves stale cache without another provider call", async () => {
  let currentTime = Date.parse("2026-08-14T12:00:00.000Z");
  let fetchCount = 0;
  const store = createMemoryStore();
  const warmCoordinator = createAisCoordinator({
    store,
    budgetGate: createBudgetGate(),
    now: () => currentTime,
    fetchImpl: async () => {
      fetchCount += 1;
      return jsonResponse({ data: { imo: "2345678", lat: 12, lon: 24 } });
    },
  });

  await warmCoordinator.getLivePosition("2345678");
  currentTime += 6 * 60 * 1000;

  const blockedCoordinator = createAisCoordinator({
    store,
    budgetGate: createBudgetGate({ allowed: false }),
    now: () => currentTime,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("provider should not be called");
    },
  });
  const result = await blockedCoordinator.getLivePosition("2345678");

  assert.equal(result.meta.cacheStatus, "STALE");
  assert.equal(result.meta.circuitBreaker, "BUDGET_LIMIT");
  assert.equal(fetchCount, 1);
});

test("failed provider calls release the reserved credit", async () => {
  const budgetGate = createBudgetGate();
  const coordinator = createAisCoordinator({
    store: createMemoryStore(),
    budgetGate,
    fetchImpl: async () => jsonResponse({ error: "upstream failure" }, 503),
  });

  await assert.rejects(() => coordinator.getLivePosition("3456789"));
  assert.equal(budgetGate.calls.reservations, 1);
  assert.equal(budgetGate.calls.releases, 1);
});

test("a missing provider key is reported before the budget database is contacted", async () => {
  const previousKey = environment.get("DATALASTIC_API_KEY");
  environment.delete("DATALASTIC_API_KEY");
  let budgetContacted = false;
  const coordinator = createAisCoordinator({
    store: createMemoryStore(),
    budgetGate: {
      async withRequestLock() {
        budgetContacted = true;
        throw new Error("budget should not be contacted");
      },
    },
  });

  try {
    await assert.rejects(
      () => coordinator.getLivePosition("9863118"),
      (error) => error?.code === "AIS_PROVIDER_NOT_CONFIGURED",
    );
    assert.equal(budgetContacted, false);
  } finally {
    environment.set("DATALASTIC_API_KEY", previousKey);
  }
});

test("the in-memory monitor counts provider credits but not cache hits", async () => {
  const before = getAisConsumptionSnapshot();
  const coordinator = createAisCoordinator({
    store: createMemoryStore(),
    budgetGate: createBudgetGate(),
    now: () => Date.parse("2026-08-14T15:00:00.000Z"),
    fetchImpl: async () => jsonResponse({ data: { imo: "4567890", lat: 10, lon: 20 } }),
  });

  await coordinator.getLivePosition("4567890");
  await coordinator.getLivePosition("4567890");
  const after = getAisConsumptionSnapshot();

  assert.equal(after.consumedCredits, before.consumedCredits + 1);
  assert.equal(after.providerRequests, before.providerRequests + 1);
  assert.equal(after.cacheHits, before.cacheHits + 1);
});
