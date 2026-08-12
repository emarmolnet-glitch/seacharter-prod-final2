import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  fetchLatestMarketSpeed,
  normalizeMarketSpeedVesselClass,
} from '../netlify/functions/lib/market-speed.mjs';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const functionSource = await readFile(new URL('../netlify/functions/market-speed.ts', import.meta.url), 'utf8');
const querySource = await readFile(new URL('../netlify/functions/lib/market-speed.mjs', import.meta.url), 'utf8');

test('normalizes pricing router categories to market vessel classes', () => {
  assert.equal(normalizeMarketSpeedVesselClass('Handysize / Small Tanker'), 'Handysize');
  assert.equal(normalizeMarketSpeedVesselClass('Supramax / MR'), 'Supramax');
  assert.equal(normalizeMarketSpeedVesselClass('Ultramax'), 'Supramax');
  assert.equal(normalizeMarketSpeedVesselClass('Panamax / Kamsarmax / LR1'), 'Panamax');
  assert.equal(normalizeMarketSpeedVesselClass('Capesize / Suezmax'), 'Capesize');
  assert.equal(normalizeMarketSpeedVesselClass('Coaster'), null);
});

test('market speed endpoint reads the latest positive average safely', () => {
  assert.match(functionSource, /path: '\/api\/market-speed'/);
  assert.match(querySource, /FROM market_average_speeds AS market_speed/);
  assert.match(querySource, /average_speed_knots > 0/);
  assert.match(querySource, /ORDER BY observed_at DESC NULLS LAST/);
  assert.match(querySource, /LIKE \$1/);
  assert.match(querySource, /`%\$\{vesselClass\.toUpperCase\(\)\}%`/);
});

test('market speed query is parameterized and normalizes the database result', async () => {
  const calls = [];
  const pool = {
    async query(statement, parameters) {
      calls.push({ statement, parameters });
      return {
        rows: [{
          vessel_class: 'Handysize',
          average_speed_knots: '11.56',
          observed_at: '2026-08-12',
        }],
      };
    },
  };

  const result = await fetchLatestMarketSpeed(pool, 'Handysize / Small Tanker');

  assert.deepEqual(calls[0].parameters, ['%HANDYSIZE%']);
  assert.match(calls[0].statement, /FROM market_average_speeds/);
  assert.deepEqual(result, {
    vesselClass: 'Handysize',
    averageSpeedKnots: 11.56,
    observedAt: '2026-08-12',
  });
});

test('calculator applies a live smart default while preserving manual override', () => {
  assert.match(indexSource, /id="spd-ballast-smart-default"/);
  assert.match(indexSource, /Smart Default: Mercado en Vivo/);
  assert.match(indexSource, /fetch\(`\/api\/market-speed\?\$\{query\.toString\(\)\}`\)/);
  assert.match(indexSource, /input\.dataset\.manualOverride === 'true'/);
  assert.match(indexSource, /input\.value = averageSpeedKnots\.toFixed\(2\)/);
  assert.match(indexSource, /input\.readOnly = false/);
  assert.match(indexSource, /input\.dataset\.marketDefault = 'false'/);
});
