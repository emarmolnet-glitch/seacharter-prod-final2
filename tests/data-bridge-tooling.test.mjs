import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATA_BRIDGE_DICTIONARY,
  DATA_BRIDGE_SYSTEM_PROMPT,
  buildDataBridgeQuery,
  executeDataBridgeTool,
} from '../netlify/functions/_shared/data-bridge-tooling.mjs';

test('dynamic dictionary is compressed into the system prompt', () => {
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, /Data Bridge \(Neon PostgreSQL\)/);
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, new RegExp(JSON.stringify(DATA_BRIDGE_DICTIONARY).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, /prepara el payload de búsqueda/);
});

test('Data Bridge query builder only accepts allowlisted tables and parameters', () => {
  const query = buildDataBridgeQuery({ table: 'ais_vessels', query: 'IMO 1234567', limit: 100 });

  assert.match(query.text, /^SELECT imo_number, vessel_name, latitude, longitude,/);
  assert.match(query.text, /FROM ais_vessels WHERE/);
  assert.match(query.text, /LIMIT \$2$/);
  assert.deepEqual(query.params, ['%IMO 1234567%', 20]);
  assert.throws(
    () => buildDataBridgeQuery({ table: 'users; DROP TABLE users' }),
    /no permitida/,
  );
});

test('Data Bridge tool executes parameterized queries through the database pool', async () => {
  const calls = [];
  const database = {
    pool: {
      async query(text, params) {
        calls.push({ text, params });
        return { rows: [{ hub_name: 'Rotterdam', fuel_grade: 'VLSFO', price: 620 }] };
      },
    },
  };

  const result = await executeDataBridgeTool({
    name: 'consultar_data_bridge',
    args: { table: 'bunker_prices_log', query: 'Rotterdam', limit: 5 },
  }, database);

  assert.equal(result.success, true);
  assert.equal(result.table, 'bunker_prices_log');
  assert.equal(result.count, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['%Rotterdam%', 5]);
});
