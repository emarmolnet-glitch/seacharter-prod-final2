import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationsUrl = new URL("../netlify/database/migrations/", import.meta.url);
const productionFloor = "20260803120000";
const baselineTag = "20260804000000_baseline_existing_schema";

test("Drizzle baseline stays ahead of the installed production migration", async () => {
  const entries = await readdir(migrationsUrl, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.name !== "meta")
    .map((entry) => entry.name.replace(/\.sql$/, ""));

  assert.ok(!migrationNames.some((name) => name.startsWith("0000_")));
  assert.ok(migrationNames.includes(baselineTag));
  assert.ok(baselineTag.slice(0, 14) > productionFloor);
});

test("Drizzle metadata and generation strategy use the timestamp baseline", async () => {
  const baselineSnapshot = JSON.parse(
    await readFile(
      new URL(`${baselineTag}/snapshot.json`, migrationsUrl),
      "utf8",
    ),
  );
  const drizzleConfig = await readFile(
    new URL("../drizzle.config.ts", import.meta.url),
    "utf8",
  );
  const baselineSql = await readFile(
    new URL(`${baselineTag}/migration.sql`, migrationsUrl),
    "utf8",
  );

  assert.equal(baselineSnapshot.version, "8");
  assert.equal(baselineSnapshot.dialect, "postgres");
  assert.match(drizzleConfig, /prefix:\s*["']timestamp["']/);
  assert.match(baselineSql, /to_regclass/);
  assert.doesNotMatch(baselineSql, /CREATE TABLE/);
});
