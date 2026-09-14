import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPortClientModule() {
  const source = await readFile(
    new URL("../netlify/functions/_shared/datalastic-port-client.ts", import.meta.url),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

async function loadPortsSearchModule() {
  const sharedModule = await loadPortClientModule();
  const fileUrl = new URL("../netlify/functions/ports-search.ts", import.meta.url);
  let source = await readFile(fileUrl, "utf8");
  
  // Replace imports to use data url or mocked bindings
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  // Provide a self-contained module that uses sharedModule
  const wrapped = transpiled
    .replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/_shared\/datalastic-port-client\.js["'];?/, `
      const { resolvePortsWithFailover, DatalasticPortError } = globalThis.__mockSharedModule;
    `)
    .replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/_shared\/response-cache\.js["'];?/, `
      const createResponseCacheHeaders = () => ({});
      const getOrSetCachedJson = async ({ producer }) => ({ value: await producer() });
    `);

  globalThis.__mockSharedModule = sharedModule;
  return import(`data:text/javascript;base64,${Buffer.from(wrapped).toString("base64")}`);
}

test("Datalastic port normalization preserves map coordinates, identifiers, and required fields", async () => {
  const { normalizeDatalasticPort } = await loadPortClientModule();
  const port = normalizeDatalasticPort({
    uuid: "port-uuid",
    port_name: "VALENCIA",
    country_iso: "ES",
    unlocode: "ESVLC",
    lat: 39.44,
    lon: -0.31,
    max_operational_draft: 13.5,
  });

  assert.equal(port.officialLabel, "VALENCIA (ES)");
  assert.equal(port.latitude, 39.44);
  assert.equal(port.longitude, -0.31);
  assert.equal(port.maxOperationalDraftMeters, 13.5);
  assert.equal(port.source, "DATALASTIC");

  // Normalized schema required: { lat, lon, displayName, source }
  assert.equal(port.lat, 39.44);
  assert.equal(port.lon, -0.31);
  assert.equal(port.displayName, "VALENCIA (ES)");
  assert.equal(port.source, "DATALASTIC");
});

test("zero and null provider drafts remain unknown instead of becoming fatal limits", async () => {
  const { normalizeDatalasticPort } = await loadPortClientModule();
  const port = normalizeDatalasticPort({
    port_name: "PORT WITHOUT DRAFT",
    country_iso: "GB",
    lat: 51.5,
    lon: -0.04,
    max_draft: 0,
    channel_depth: null,
  });

  assert.equal(port.maxOperationalDraftMeters, null);
  assert.equal(port.draftSourceField, null);
});

test("depth values reported in feet are converted to meters", async () => {
  const { extractMaxOperationalDraft } = await loadPortClientModule();
  const draft = extractMaxOperationalDraft({ maximum_draft: { value: 40, unit: "ft" } });
  assert.equal(draft.meters, 12.192);
});

test("Datalastic and Nominatim both normalize to the exact same {lat, lon, displayName, source} schema", async () => {
  const { normalizeDatalasticPort, normalizeNominatimLocation } = await loadPortClientModule();

  const datalasticItem = normalizeDatalasticPort({
    uuid: "dt-123",
    port_name: "PRAIA",
    country_iso: "CV",
    country_name: "Cape Verde",
    lat: 14.916667,
    lon: -23.516667,
    port_type: "port",
  });

  const nominatimItem = normalizeNominatimLocation({
    place_id: 98765,
    lat: "14.9315243",
    lon: "-23.5125399",
    name: "Praia",
    display_name: "Praia, Ilha de Santiago, 7600, Cabo Verde",
    type: "city",
    address: {
      city: "Praia",
      country: "Cabo Verde",
      country_code: "cv",
    },
  });

  assert.ok(datalasticItem);
  assert.ok(nominatimItem);

  // Both must have exactly the same core property keys
  const expectedKeys = [
    "lat",
    "lon",
    "displayName",
    "source",
    "uuid",
    "portName",
    "officialLabel",
    "countryCode",
    "countryName",
    "unlocode",
    "portType",
    "latitude",
    "longitude",
    "maxOperationalDraftMeters",
    "draftSourceField",
  ];

  for (const key of expectedKeys) {
    assert.ok(key in datalasticItem, `Datalastic item missing key: ${key}`);
    assert.ok(key in nominatimItem, `Nominatim item missing key: ${key}`);
  }

  assert.equal(typeof datalasticItem.lat, "number");
  assert.equal(typeof datalasticItem.lon, "number");
  assert.equal(typeof datalasticItem.displayName, "string");
  assert.equal(datalasticItem.source, "DATALASTIC");

  assert.equal(typeof nominatimItem.lat, "number");
  assert.equal(typeof nominatimItem.lon, "number");
  assert.equal(typeof nominatimItem.displayName, "string");
  assert.equal(nominatimItem.source, "NOMINATIM");

  assert.equal(nominatimItem.lat, 14.9315243);
  assert.equal(nominatimItem.lon, -23.5125399);
  assert.equal(nominatimItem.displayName, "Praia, Ilha de Santiago, 7600, Cabo Verde");
  assert.equal(nominatimItem.countryCode, "CV");
});

test("Nominatim requests obligatorily include User-Agent: SeaCharterCorePRO/1.0 header", async (t) => {
  const { findNominatimLocations, NOMINATIM_USER_AGENT } = await loadPortClientModule();
  assert.equal(NOMINATIM_USER_AGENT, "SeaCharterCorePRO/1.0");

  const originalFetch = globalThis.fetch;
  let capturedHeaders = null;

  globalThis.fetch = async (url, options) => {
    capturedHeaders = options?.headers;
    return new Response(JSON.stringify([
      {
        place_id: 111,
        lat: "14.9315",
        lon: "-23.5125",
        display_name: "Praia, Cabo Verde",
        name: "Praia",
        address: { country_code: "cv" },
      },
    ]), { status: 200, headers: { "content-type": "application/json" } });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const results = await findNominatimLocations("Praia, Cabo Verde");
  assert.ok(results.length > 0);
  assert.equal(results[0].source, "NOMINATIM");
  assert.equal(capturedHeaders?.["User-Agent"], "SeaCharterCorePRO/1.0");
});

test("resolvePortsWithFailover uses Datalastic as primary provider when available", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DATALASTIC_API_KEY;
  process.env.DATALASTIC_API_KEY = "test-datalastic-key";

  let datalasticCalled = false;
  let nominatimCalled = false;

  globalThis.fetch = async (url, options) => {
    const urlString = String(url);
    if (urlString.includes("datalastic")) {
      datalasticCalled = true;
      return new Response(JSON.stringify({
        meta: { success: true },
        data: [
          {
            uuid: "dl-praia",
            port_name: "PRAIA",
            country_iso: "CV",
            lat: 14.9167,
            lon: -23.5167,
            port_type: "port",
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (urlString.includes("nominatim") || urlString.includes("openstreetmap")) {
      nominatimCalled = true;
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) process.env.DATALASTIC_API_KEY = originalEnv;
    else delete process.env.DATALASTIC_API_KEY;
  });

  const { resolvePortsWithFailover } = await loadPortClientModule();
  const results = await resolvePortsWithFailover("Praia");

  assert.equal(datalasticCalled, true);
  assert.equal(nominatimCalled, false, "Nominatim should not be called when Datalastic succeeds");
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "DATALASTIC");
  assert.equal(results[0].lat, 14.9167);
  assert.equal(results[0].lon, -23.5167);
  assert.equal(results[0].displayName, "PRAIA (CV)");
});

test("resolvePortsWithFailover automatically switches to Nominatim when Datalastic throws credit error or fails", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DATALASTIC_API_KEY;
  process.env.DATALASTIC_API_KEY = "test-key";

  let datalasticCalled = false;
  let nominatimCalled = false;
  let capturedNominatimUserAgent = "";

  globalThis.fetch = async (url, options) => {
    const urlString = String(url);
    if (urlString.includes("datalastic")) {
      datalasticCalled = true;
      // Simulate Datalastic credit exhaustion / 402 Payment Required error
      return new Response(JSON.stringify({
        meta: { success: false, status: 402, message: "Credit balance exhausted" },
      }), { status: 402, headers: { "content-type": "application/json" } });
    }
    if (urlString.includes("nominatim") || urlString.includes("openstreetmap")) {
      nominatimCalled = true;
      capturedNominatimUserAgent = options?.headers?.["User-Agent"] || "";
      return new Response(JSON.stringify([
        {
          place_id: 1234,
          lat: "14.9315",
          lon: "-23.5125",
          name: "Praia",
          display_name: "Praia, Cabo Verde",
          type: "city",
          address: { country_code: "cv", country: "Cabo Verde" },
        },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) process.env.DATALASTIC_API_KEY = originalEnv;
    else delete process.env.DATALASTIC_API_KEY;
  });

  const { resolvePortsWithFailover } = await loadPortClientModule();
  const results = await resolvePortsWithFailover("Praia, Cabo Verde");

  assert.equal(datalasticCalled, true, "Datalastic must be primary provider");
  assert.equal(nominatimCalled, true, "System must switch to Nominatim on Datalastic credit error");
  assert.equal(capturedNominatimUserAgent, "SeaCharterCorePRO/1.0");
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "NOMINATIM");
  assert.equal(results[0].lat, 14.9315);
  assert.equal(results[0].lon, -23.5125);
  assert.equal(results[0].displayName, "Praia, Cabo Verde");
});

test("resolvePortsWithFailover automatically switches to Nominatim when Datalastic does not respond or throws network exception", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DATALASTIC_API_KEY;
  process.env.DATALASTIC_API_KEY = "test-key";

  let datalasticCalled = false;
  let nominatimCalled = false;

  globalThis.fetch = async (url, options) => {
    const urlString = String(url);
    if (urlString.includes("datalastic")) {
      datalasticCalled = true;
      throw new Error("Network timeout or connection refused");
    }
    if (urlString.includes("nominatim") || urlString.includes("openstreetmap")) {
      nominatimCalled = true;
      return new Response(JSON.stringify([
        {
          place_id: 5678,
          lat: "14.9315",
          lon: "-23.5125",
          name: "Praia",
          display_name: "Praia, Ilha de Santiago, Cabo Verde",
          address: { country_code: "cv" },
        },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) process.env.DATALASTIC_API_KEY = originalEnv;
    else delete process.env.DATALASTIC_API_KEY;
  });

  const { resolvePortsWithFailover } = await loadPortClientModule();
  const results = await resolvePortsWithFailover("Praia, Cabo Verde");

  assert.equal(datalasticCalled, true);
  assert.equal(nominatimCalled, true);
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "NOMINATIM");
  assert.equal(results[0].displayName, "Praia, Ilha de Santiago, Cabo Verde");
});

test("ports-search handler returns normalized {lat, lon, displayName, source} and supports failover", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DATALASTIC_API_KEY;
  delete process.env.DATALASTIC_API_KEY; // Simulate unconfigured / missing API key

  globalThis.fetch = async (url, options) => {
    const urlString = String(url);
    if (urlString.includes("nominatim") || urlString.includes("openstreetmap")) {
      return new Response(JSON.stringify([
        {
          place_id: 9999,
          lat: "14.9315",
          lon: "-23.5125",
          name: "Praia",
          display_name: "Praia, Cabo Verde",
          address: { country_code: "cv" },
        },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) process.env.DATALASTIC_API_KEY = originalEnv;
  });

  const { default: portsSearchHandler } = await loadPortsSearchModule();
  const request = new Request("https://example.com/api/v1/ports/search?q=Praia%2C%20Cabo%20Verde");
  const response = await portsSearchHandler(request);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.ports), "body.ports must be an array");
  assert.ok(body.ports.length > 0);

  const firstPort = body.ports[0];
  assert.equal(firstPort.source, "NOMINATIM");
  assert.equal(firstPort.lat, 14.9315);
  assert.equal(firstPort.lon, -23.5125);
  assert.equal(firstPort.displayName, "Praia, Cabo Verde");
});
