import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const currentMigration = new URL(
  "../netlify/database/migrations/20260802193000_add_vessel_scraper_fields/migration.sql",
  import.meta.url,
);
const futureMigration = new URL(
  "../netlify/database/migrations/20260803000000_add_vessel_scraper_fields/migration.sql",
  import.meta.url,
);
const etaMigration = new URL(
  "../netlify/database/migrations/20260802213000_convert_vessels_master_eta_to_timestamptz/migration.sql",
  import.meta.url,
);

test("Due Diligence field migration is deployable on August 2, 2026", () => {
  assert.equal(existsSync(currentMigration), true);
  assert.equal(existsSync(futureMigration), false);

  const migration = readFileSync(currentMigration, "utf8");
  for (const field of ["call_sign", "net_tonnage", "beam_meters", "last_port", "eta"]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS "${field}"`));
  }
  assert.equal(existsSync(etaMigration), true);
  const etaMigrationSql = readFileSync(etaMigration, "utf8");
  assert.match(etaMigrationSql, /ALTER COLUMN "eta" TYPE timestamptz/);
  assert.match(etaMigrationSql, /WHEN "eta"::text ~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}'/);
});
