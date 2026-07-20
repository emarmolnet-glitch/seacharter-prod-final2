import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schemaSource = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');
const receiverSource = readFileSync(new URL('../netlify/functions/receive-vessels.ts', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const netlifyConfigSource = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const migrationSource = readFileSync(
  new URL('../netlify/database/migrations/20260719120000_add_vessels_master_latitude_longitude_constraints/migration.sql', import.meta.url),
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

test('receiver flattens nested Core PRO vessel, AIS, and routing records', () => {
  assert.match(receiverSource, /const nestedVessel = rawSource\.vessel/);
  assert.match(receiverSource, /const nestedAis = rawSource\.ais/);
  assert.match(receiverSource, /const nestedRouting = rawSource\.routing/);
  assert.match(receiverSource, /const source = \{ \.\.\.rawSource, \.\.\.nestedRouting, \.\.\.nestedAis, \.\.\.nestedVessel \}/);
  assert.match(receiverSource, /sourcePayload: rawSource/);
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

test('local flat report preserves valid coordinates without sending them to Data Bridge', () => {
  assert.match(indexSource, /latitude: ais\.latitude \?\? ais\.lat \?\? source\.latitude \?\? source\.lat/);
  assert.match(indexSource, /longitude: ais\.longitude \?\? ais\.lon \?\? ais\.lng \?\? source\.longitude/);
  assert.match(indexSource, /latitude: getStrictVesselNumber\(source, \['latitude', 'lat', 'Latitude', 'AIS_Live_Lat'\], null\)/);
  const readSyncStart = indexSource.indexOf('async function requestDataBridgeReadSync');
  const readSyncEnd = indexSource.indexOf('window.requestDataBridgeReadSync', readSyncStart);
  assert.doesNotMatch(indexSource.slice(readSyncStart, readSyncEnd), /body:|JSON\.stringify|vessels/);
  assert.match(netlifyConfigSource, /from = "\/api\/databridge-core-pro-sync"/);
});

test('matching success event remains bound to the local result array', () => {
  const matchingStateIndex = indexSource.indexOf('window.matchingResultsState =');
  const successEventIndex = indexSource.indexOf("new CustomEvent('MATCHING_EXECUTION_SUCCESS'", matchingStateIndex);
  assert.ok(matchingStateIndex >= 0 && successEventIndex > matchingStateIndex);
  assert.match(indexSource, /matches: window\.matchingResultsState\?\.vessels \|\| matches/);
  assert.match(indexSource, /window\.lastLocalMatchingAuditVessels = arrayDeBuquesEncontrados/);
  assert.match(indexSource, /updateSequentialTelemetryBlock\([\s\S]*'matching-execution-success-stick',[\s\S]*vessels\.length > 0 \? 'success' : 'pending'/);
});
