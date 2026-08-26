import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, workspaceSource, marketDataSource, schemaSource, migrationSource, connectionSource, endpointSource, dbSource, netlifyDbSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/get-market-data.mts', import.meta.url), 'utf8'),
  readFile(new URL('../db/schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/database/migrations/20260826012414_add_bunker_prices_log/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../db/connection-string.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/bunker-market-latest.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/netlify.ts', import.meta.url), 'utf8'),
]);

test('frontend uses only get-market-data for bunker synchronization', () => {
  assert.match(indexSource, /BUNKER_MARKET_DATA_ENDPOINT = '\/api\/get-market-data'/);
  assert.match(indexSource, /onclick="syncBunkerIndexMarket\(\)"/);
  assert.match(indexSource, /const vlsfo = Number\(record\?\.vlsfo\)/);
  assert.match(indexSource, /const ifo380 = Number\(record\?\.hsfo\)/);
  assert.match(indexSource, /const mgo = Number\(record\?\.mgo\)/);
  assert.match(indexSource, /forceMarket: true/);
  assert.match(indexSource, /input\.dataset\.userOverride = 'false'/);
  assert.match(workspaceSource, /fetch\('\/api\/get-market-data'/);
  assert.match(workspaceSource, /ifo380: Number\(record\?\.hsfo\)/);
  assert.doesNotMatch(indexSource, /\/api\/market\/bunkers-latest/);
  assert.doesNotMatch(workspaceSource, /\/api\/market\/bunkers-latest/);
});

test('get-market-data proxies and validates the Data Bridge Oil Price contract', () => {
  assert.match(marketDataSource, /new URL\("\/api\/get-market-data"/);
  assert.match(marketDataSource, /record\?\.vlsfo/);
  assert.match(marketDataSource, /record\?\.hsfo/);
  assert.match(marketDataSource, /record\?\.mgo/);
  assert.match(marketDataSource, /path: "\/api\/get-market-data"/);
});

test('Drizzle schema declares normalized bunker prices', () => {
  assert.match(schemaSource, /export const bunkerPricesLog = pgTable/);
  assert.match(schemaSource, /"bunker_prices_log"/);
  assert.match(schemaSource, /fuelGrade: varchar\("fuel_grade"/);
  assert.match(schemaSource, /IN \('VLSFO', 'IFO380', 'MGO'\)/);
  assert.match(schemaSource, /price: numeric\("price", \{ mode: "number" \}\)\.notNull\(\)/);
  assert.match(schemaSource, /source: varchar\("source"/);
  assert.match(schemaSource, /createdAt: timestamp\("created_at"/);
});

test('migration supports both fresh and pre-existing bunker tables', () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS "bunker_prices_log"/);
  assert.match(migrationSource, /ALTER COLUMN "hub_name" SET NOT NULL/);
  assert.match(migrationSource, /bunker_prices_log_fuel_grade_check/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "bunker_prices_log_market_latest_idx"/);
});

test('database functions share the Netlify connection resolver', () => {
  assert.match(connectionSource, /"DATABASE_URL"/);
  assert.match(connectionSource, /"NETLIFY_DATABASE_URL"/);
  assert.match(endpointSource, /getDatabaseConnectionString/);
  assert.match(dbSource, /requireDatabaseConnectionString/);
  assert.match(netlifyDbSource, /requireDatabaseConnectionString/);
  assert.doesNotMatch(endpointSource, /process\.env\.DATABASE_URL/);
});
