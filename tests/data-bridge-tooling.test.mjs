import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATA_BRIDGE_DICTIONARY,
  DATA_BRIDGE_SYSTEM_PROMPT,
  DATA_BRIDGE_TOOLS,
  buildDataBridgeQuery,
  executeDataBridgeTool,
} from '../netlify/functions/_shared/data-bridge-tooling.mjs';

test('dynamic dictionary is compressed into the system prompt', () => {
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, /Data Bridge \(Neon PostgreSQL\)/);
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, new RegExp(JSON.stringify(DATA_BRIDGE_DICTIONARY).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, /prepara el payload de búsqueda/);
  assert.deepEqual(DATA_BRIDGE_DICTIONARY.Eficiencia_Mercado.market_average_speeds, [
    'vessel_class',
    'average_speed_knots',
    'record_date',
  ]);
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, /Nunca uses vessels_master para calcular o responder promedios de mercado/);
  assert.match(DATA_BRIDGE_SYSTEM_PROMPT, /target="market_average_speeds" y vessel_class/);
});

test('Data Bridge tool descriptions separate individual vessels from market averages', () => {
  const declaration = DATA_BRIDGE_TOOLS[0].functionDeclarations[0];

  assert.match(declaration.description, /vessels_master solo para un buque individual/);
  assert.match(declaration.parameters.properties.target.description, /vessels_master SOLAMENTE/);
  assert.match(declaration.parameters.properties.target.description, /market_average_speeds SOLAMENTE/);
  assert.match(declaration.parameters.properties.vessel_class.description, /Capesize/);
  assert.deepEqual(declaration.parameters.required, ['target']);
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

test('market average speed intent targets the requested vessel class', () => {
  const query = buildDataBridgeQuery({
    target: 'market_average_speeds',
    vessel_class: 'Capesize',
  });

  assert.match(query.text, /^SELECT average_speed_knots::double precision AS average_speed_knots FROM market_average_speeds/);
  assert.match(query.text, /WHERE vessel_class ILIKE \$1/);
  assert.match(query.text, /ORDER BY record_date DESC NULLS LAST LIMIT \$2$/);
  assert.deepEqual(query.params, ['%Capesize%', 1]);
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

test('Data Bridge tool returns a numeric market average metric', async () => {
  const calls = [];
  const database = {
    pool: {
      async query(text, params) {
        calls.push({ text, params });
        return { rows: [{ average_speed_knots: 12.4 }] };
      },
    },
  };

  const result = await executeDataBridgeTool({
    name: 'consultar_data_bridge',
    args: { target: 'market_average_speeds', vessel_class: 'Capesize' },
  }, database);

  assert.equal(result.success, true);
  assert.equal(result.table, 'market_average_speeds');
  assert.equal(result.value, 12.4);
  assert.deepEqual(calls[0].params, ['%Capesize%', 1]);
});
