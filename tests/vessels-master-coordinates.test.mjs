import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schemaSource = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');
const receiverSource = readFileSync(new URL('../netlify/functions/receive-vessels.ts', import.meta.url), 'utf8');
const proxySource = readFileSync(new URL('../netlify/functions/databridge-core-pro-sync.ts', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migrationSource = readFileSync(
  new URL('../netlify/database/migrations/20260719120000_add_vessels_master_coordinates/migration.sql', import.meta.url),
  'utf8',
);

test('new additive migration adds vessels_master coordinates without changing applied migrations', () => {
  assert.match(migrationSource, /ALTER TABLE "vessels_master"[\s\S]*ADD COLUMN IF NOT EXISTS "latitude" double precision/);
  assert.match(migrationSource, /ALTER TABLE "vessels_master"[\s\S]*ADD COLUMN IF NOT EXISTS "longitude" double precision/);
  assert.match(migrationSource, /vessels_master_latitude_range_check/);
  assert.match(migrationSource, /vessels_master_longitude_range_check/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "vessels_master_coordinates_idx"/);
});

test('Drizzle schema maps latitude and longitude to vessels_master', () => {
  const tableStart = schemaSource.indexOf('export const vesselsMaster = pgTable("vessels_master"');
  const tableEnd = schemaSource.indexOf('export const aisVessels', tableStart);
  const tableSource = schemaSource.slice(tableStart, tableEnd);
  assert.match(tableSource, /latitude: doublePrecision\("latitude"\)/);
  assert.match(tableSource, /longitude: doublePrecision\("longitude"\)/);
});

test('receiver validates coordinate aliases and ranges before persistence', () => {
  assert.match(receiverSource, /const rawLatitude = readFirst\(source, \["latitude", "lat", "Latitude", "AIS_Live_Lat", "LAT"\]\)/);
  assert.match(receiverSource, /const rawLongitude = readFirst\(source, \["longitude", "lon", "lng", "long", "Longitude", "AIS_Live_Lon", "LON", "LONG"\]\)/);
  assert.match(receiverSource, /latitude debe ser un número entre -90 y 90/);
  assert.match(receiverSource, /longitude debe ser un número entre -180 y 180/);
  assert.match(receiverSource, /function validateVesselsBeforePersistence\(vessels: VesselRow\[\]\)/);

  const preflightIndex = receiverSource.indexOf('const persistencePreflightErrors = validateVesselsBeforePersistence(vessels)');
  const insertIndex = receiverSource.indexOf('const persistenceResult = await upsertVesselBatch(vessels)');
  assert.ok(preflightIndex >= 0 && insertIndex > preflightIndex);
  assert.match(receiverSource, /status: 422/);
});

test('receiver verifies database columns before executing vessel inserts', () => {
  assert.match(receiverSource, /REQUIRED_VESSELS_MASTER_COLUMNS = \[[\s\S]*"latitude",[\s\S]*"longitude"/);
  assert.match(receiverSource, /FROM information_schema\.columns[\s\S]*table_name = 'vessels_master'/);
  assert.match(receiverSource, /vessels_master schema is missing required columns/);
  assert.match(receiverSource, /INSERT INTO vessels_master \([\s\S]*latitude, longitude/);
  assert.match(receiverSource, /latitude = EXCLUDED\.latitude,[\s\S]*longitude = EXCLUDED\.longitude/);
  assert.match(receiverSource, /vessel\.imoNumber, vessel\.vesselName, vessel\.dwt, vessel\.mmsi, vessel\.latitude, vessel\.longitude,[\s\S]*vessel\.vesselType/);
});

test('flat Data Bridge payload preserves valid coordinates end to end', () => {
  assert.match(indexSource, /latitude: ais\.latitude \?\? ais\.lat \?\? source\.latitude \?\? source\.lat/);
  assert.match(indexSource, /longitude: ais\.longitude \?\? ais\.lon \?\? ais\.lng \?\? source\.longitude/);
  assert.match(indexSource, /latitude: getStrictVesselNumber\(source, \['latitude', 'lat', 'Latitude', 'AIS_Live_Lat'\], null\)/);
  assert.match(proxySource, /const latitude = readNumber\(source, "latitude", Number\.NaN\)/);
  assert.match(proxySource, /const longitude = readNumber\(source, "longitude", Number\.NaN\)/);
  assert.match(proxySource, /if \(!Number\.isFinite\(latitude\) \|\| latitude < -90 \|\| latitude > 90\) return null/);
  assert.match(proxySource, /vessel_name:[\s\S]*dwt:[\s\S]*latitude,[\s\S]*longitude,/);
});

test('matching success event remains bound to the result array after persistence', () => {
  const persistenceIndex = indexSource.indexOf('persistedMatchingReport = await syncCoreProMatchingReport(persistencePayload)');
  const successEventIndex = indexSource.indexOf("new CustomEvent('MATCHING_EXECUTION_SUCCESS'", persistenceIndex);
  assert.ok(persistenceIndex >= 0 && successEventIndex > persistenceIndex);
  assert.match(indexSource, /matches: window\.matchingResultsState\?\.vessels \|\| matches/);
  assert.match(indexSource, /stick\.classList\.toggle\('hidden', vessels\.length === 0\)/);
});
