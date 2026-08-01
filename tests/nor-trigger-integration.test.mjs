import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const functionSource = await readFile(new URL('../netlify/functions/tender-nor.ts', import.meta.url), 'utf8');
const migrationSource = await readFile(
  new URL('../netlify/database/migrations/20260801120000_create_voyage_nor_tracking/migration.sql', import.meta.url),
  'utf8',
);

test('Data Bridge NOR_TRIGGER listener posts the automatic arrival payload', () => {
  assert.match(indexSource, /NOR_TRIGGER/);
  assert.match(indexSource, /\/api\/v1\/voyage\/tender-nor/);
  assert.match(indexSource, /vessel_mmsi/);
  assert.match(indexSource, /port_id/);
  assert.match(indexSource, /distance_nm/);
  assert.match(indexSource, /timestamp/);
  assert.match(indexSource, /NOR Disparado Automáticamente a \$\{formatNorDistance\(payload\.distance_nm\)\} NM/);
});

test('tender NOR endpoint updates active voyage and Charter Party atomically', () => {
  assert.match(functionSource, /path: "\/api\/v1\/voyage\/tender-nor"/);
  assert.match(functionSource, /WHERE vessel_mmsi = \$1/);
  assert.match(functionSource, /AND destination_port_id = \$2/);
  assert.match(functionSource, /AND is_active = true/);
  assert.match(functionSource, /SET status = 'ARRIVED'/);
  assert.match(functionSource, /INSERT INTO charter_parties/);
  assert.match(functionSource, /ON CONFLICT \(voyage_id\) DO UPDATE/);
  assert.match(functionSource, /client\.query\("BEGIN"\)/);
  assert.match(functionSource, /client\.query\("COMMIT"\)/);
});

test('NOR tracking migration creates indexed voyage and Charter Party records', () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS "voyages"/);
  assert.match(migrationSource, /"vessel_mmsi" varchar\(9\) NOT NULL/);
  assert.match(migrationSource, /"destination_port_id" text NOT NULL/);
  assert.match(migrationSource, /CREATE INDEX IF NOT EXISTS "voyages_active_destination_lookup_idx"/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS "charter_parties"/);
  assert.match(migrationSource, /"arrival_timestamp" timestamp with time zone/);
});
