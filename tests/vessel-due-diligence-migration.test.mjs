import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appliedMigration = new URL(
  "../netlify/database/migrations/20260803000000_add_vessel_scraper_fields/migration.sql",
  import.meta.url,
);
const removedReplacement = new URL(
  "../netlify/database/migrations/20260802193000_add_vessel_scraper_fields/migration.sql",
  import.meta.url,
);
const etaMigration = new URL(
  "../netlify/database/migrations/20260803000100_convert_vessels_master_eta_to_timestamptz/migration.sql",
  import.meta.url,
);

test("Due Diligence keeps the migration identifier recorded by Netlify", () => {
  assert.equal(existsSync(appliedMigration), true);
  assert.equal(existsSync(removedReplacement), false);

  const migration = readFileSync(appliedMigration, "utf8");
  for (const field of ["call_sign", "net_tonnage", "beam_meters"]) {
    assert.match(migration, new RegExp(`ADD COLUMN "${field}"`));
  }
  assert.equal(existsSync(etaMigration), true);
  const etaMigrationSql = readFileSync(etaMigration, "utf8");
  assert.match(etaMigrationSql, /ALTER COLUMN "eta" TYPE timestamptz/);
  assert.match(etaMigrationSql, /WHEN "eta"::text ~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}'/);
});
