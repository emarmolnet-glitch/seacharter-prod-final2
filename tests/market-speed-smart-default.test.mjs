import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  enrichVesselsWithMarketSpeedDefaults,
  fetchLatestMarketSpeed,
  normalizeMarketSpeedVesselClass,
  resolveVesselMarketSpeedClass,
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

test('radar vessels resolve their market class from declared class or DWT', () => {
  assert.equal(resolveVesselMarketSpeedClass({ vesselClass: 'Handysize Bulk Carrier' }), 'Handysize');
  assert.equal(resolveVesselMarketSpeedClass({ dwt: 58_000 }), 'Supramax');
  assert.equal(resolveVesselMarketSpeedClass({ vessel: { dwt: 72_000 } }), 'Panamax');
  assert.equal(resolveVesselMarketSpeedClass({ MetaData: { DWT: 145_000 } }), 'Capesize');
  assert.equal(resolveVesselMarketSpeedClass({ dwt: 9_000 }), null);
});

test('radar vessels without live speed receive a database-backed smart default', async () => {
  const pool = {
    async query(_statement, parameters) {
      return {
        rows: [{
          vessel_class: String(parameters[0]).includes('HANDYSIZE') ? 'Handysize' : 'Supramax',
          average_speed_knots: String(parameters[0]).includes('HANDYSIZE') ? '11.4' : '12.1',
          observed_at: '2026-08-12',
        }],
      };
    },
  };
  const liveVessel = { vesselName: 'LIVE', vesselClass: 'Handysize', speed: 8.2 };
  const missingSpeedVessel = { vesselName: 'MARKET', dwt: 52_000 };

  const result = await enrichVesselsWithMarketSpeedDefaults(pool, [liveVessel, missingSpeedVessel]);

  assert.equal(result.vessels[0], liveVessel);
  assert.equal(result.vessels[1].speed, 12.1);
  assert.equal(result.vessels[1].speedInferenceSource, 'market_average_speeds');
  assert.equal(result.vessels[1].speedTelemetryAvailable, false);
  assert.equal(result.diagnostics.defaultedCount, 1);
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

test('matching radar uses market speed enrichment instead of a static twelve-knot fallback', async () => {
  const [matchingSource, filterSource] = await Promise.all([
    readFile(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8'),
    readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(matchingSource, /enrichVesselsWithMarketSpeedDefaults\(getPool\(\), unifiedVessels\)/);
  assert.match(matchingSource, /radarSnapshot: scoringVessels/);
  assert.match(filterSource, /speedInferenceSource/);
  assert.match(filterSource, /market_average_speeds/);
  assert.doesNotMatch(filterSource, /position\.SOG, 12\) \|\| 12/);
});
