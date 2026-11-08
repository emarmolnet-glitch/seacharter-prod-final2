import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import esbuild from "esbuild";

function loadTsModule(filePath) {
  const tsCode = readFileSync(filePath, "utf8");
  const { code: jsCode } = esbuild.transformSync(tsCode, { loader: "ts", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(jsCode, "utf8").toString("base64")}`);
}

test("verify-connection function module imports without throwing even without database URL", async () => {
  const origDb = process.env.DATABASE_URL;
  const origNetlifyDb = process.env.NETLIFY_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.NETLIFY_DATABASE_URL;

  try {
    const mod = await loadTsModule("./netlify/functions/verify-connection.ts");
    assert.equal(typeof mod.default, "function");
    assert.equal(mod.config.path, "/api/verify-connection");
  } finally {
    if (origDb) process.env.DATABASE_URL = origDb;
    if (origNetlifyDb) process.env.NETLIFY_DATABASE_URL = origNetlifyDb;
  }
});

test("verify-connection handles OPTIONS with 204 and CORS headers", async () => {
  const { default: handler } = await loadTsModule("./netlify/functions/verify-connection.ts");
  const req = new Request("http://localhost/api/verify-connection", { method: "OPTIONS" });
  const res = await handler(req);

  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.ok(res.headers.get("access-control-allow-methods")?.includes("POST"));
});

test("verify-connection handles fetch timeout/failure with status 500 (never 502)", async () => {
  const { default: handler } = await loadTsModule("./netlify/functions/verify-connection.ts");

  const origUrl = process.env.DATA_BRIDGE_API_URL;
  process.env.DATA_BRIDGE_API_URL = "https://invalid-host-databridge-test.local";

  try {
    const req = new Request("http://localhost/api/verify-connection", { method: "POST" });
    const res = await handler(req);

    assert.equal(res.status, 500);
    assert.notEqual(res.status, 502);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.connected, false);
    assert.ok(body.error);
  } finally {
    if (origUrl) process.env.DATA_BRIDGE_API_URL = origUrl;
    else delete process.env.DATA_BRIDGE_API_URL;
  }
});

test("verify-connection handles live upstream connection with 200", async () => {
  const { default: handler } = await loadTsModule("./netlify/functions/verify-connection.ts");

  const req = new Request("http://localhost/api/verify-connection", { method: "POST" });
  const res = await handler(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.connected, true);
});
