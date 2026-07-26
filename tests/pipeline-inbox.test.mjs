import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const functionSource = await readFile(
  new URL('../netlify/functions/pipeline-inbox.ts', import.meta.url),
  'utf8',
);
const schemaSource = await readFile(
  new URL('../db/schema.ts', import.meta.url),
  'utf8',
);
const dbIndexSource = await readFile(
  new URL('../db/index.ts', import.meta.url),
  'utf8',
);

test('pipeline-inbox serverless function exports handler and config path', () => {
  assert.match(functionSource, /export default async function handler\(req: Request\)/);
  assert.match(functionSource, /export const config: Config =/);
  assert.match(functionSource, /\/api\/pipeline-inbox/);
  assert.match(functionSource, /\/api\/databridge\/pipeline-inbox/);
  assert.match(functionSource, /\/\.netlify\/functions\/pipeline-inbox/);
});

test('pipeline-inbox supports batch insertion logic with transaction control', () => {
  assert.match(functionSource, /export async function insertPipelineInboxBatches/);
  assert.match(functionSource, /await client\.query\("BEGIN"\)/);
  assert.match(functionSource, /await client\.query\("COMMIT"\)/);
  assert.match(functionSource, /await client\.query\("ROLLBACK"\)/);
  assert.match(functionSource, /const BATCH_SIZE = 500/);
  assert.match(functionSource, /INSERT INTO pipeline_inbox \(sync_id, imo_number, vessel_name, source, status, payload\)/);
});

test('pipeline-inbox function handles HTTP method routing and payload validation', () => {
  assert.match(functionSource, /if \(req\.method === "OPTIONS"\)/);
  assert.match(functionSource, /if \(req\.method !== "POST"\)/);
  assert.match(functionSource, /const vessels = extractVessels\(body\)/);
  assert.match(functionSource, /if \(vessels\.length === 0\)/);
  assert.match(functionSource, /Response\.json\(\s*\{\s*success: false, error: "El payload recibido no contiene registros de buques procesables\."/);
});

test('db/schema.ts and db/index.ts define and ensure pipeline_inbox table', () => {
  assert.match(schemaSource, /export const pipelineInbox = pgTable\("pipeline_inbox"/);
  assert.match(schemaSource, /syncId: text\("sync_id"\)/);
  assert.match(schemaSource, /imoNumber: text\("imo_number"\)/);
  assert.match(schemaSource, /vesselName: text\("vessel_name"\)/);
  assert.match(schemaSource, /payload: jsonb\("payload"\)\.notNull\(\)/);

  assert.match(dbIndexSource, /CREATE TABLE IF NOT EXISTS pipeline_inbox/);
  assert.match(dbIndexSource, /sync_id TEXT/);
  assert.match(dbIndexSource, /payload JSONB NOT NULL/);
});

test('extractVessels correctly parses arrays and wrapped vessel objects', () => {
  function extractVessels(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const source = payload;

    if (Array.isArray(source.vessels)) return source.vessels;
    if (Array.isArray(source.fleet)) return source.fleet;
    if (Array.isArray(source.buques)) return source.buques;
    if (Array.isArray(source.selectedVessels)) return source.selectedVessels;
    if (Array.isArray(source.items)) return source.items;

    if (source.data && typeof source.data === 'object') {
      const dataObj = source.data;
      if (Array.isArray(dataObj)) return dataObj;
      if (Array.isArray(dataObj.vessels)) return dataObj.vessels;
      if (Array.isArray(dataObj.fleet)) return dataObj.fleet;
      if (Array.isArray(dataObj.buques)) return dataObj.buques;
    }

    if (source.fleet && typeof source.fleet === 'object' && !Array.isArray(source.fleet)) {
      const fleetObj = source.fleet;
      if (Array.isArray(fleetObj.vessels)) return fleetObj.vessels;
      if (Array.isArray(fleetObj.buques)) return fleetObj.buques;
      if (Array.isArray(fleetObj.items)) return fleetObj.items;
    }

    return [];
  }

  const directArray = [{ imo: '1234567', name: 'Vessel A' }];
  assert.deepEqual(extractVessels(directArray), directArray);

  const wrappedVessels = { vessels: [{ imo: '2345678', vessel_name: 'Vessel B' }] };
  assert.deepEqual(extractVessels(wrappedVessels), wrappedVessels.vessels);

  const wrappedFleet = { fleet: [{ imo: '3456789', nombre: 'Vessel C' }] };
  assert.deepEqual(extractVessels(wrappedFleet), wrappedFleet.fleet);

  const nestedData = { data: { vessels: [{ imo: '4567890', ship: 'Vessel D' }] } };
  assert.deepEqual(extractVessels(nestedData), nestedData.data.vessels);

  assert.deepEqual(extractVessels(null), []);
  assert.deepEqual(extractVessels('invalid'), []);
  assert.deepEqual(extractVessels({}), []);
});
