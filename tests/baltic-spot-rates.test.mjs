import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  fetchLatestBalticSpotRates,
  fetchLatestFfaRate,
  getCurrentFfaPeriod,
  normalizeBalticSpotIndex,
  normalizeFfaVesselClass,
  resolvePricingMarketMapping,
} from '../netlify/functions/lib/spot-rates.mjs';

test('normalizes the supported Baltic spot indices', () => {
  assert.equal(normalizeBalticSpotIndex(' bhsi '), 'BHSI');
  assert.equal(normalizeBalticSpotIndex('BSI'), 'BSI');
  assert.equal(normalizeBalticSpotIndex('unknown'), null);
});

test('normalizes FFA vessel classes and formats the current monthly period', () => {
  assert.equal(normalizeFfaVesselClass('Handysize / Small Tanker'), 'Handysize');
  assert.equal(normalizeFfaVesselClass('Capesize / Suezmax'), 'Capesize');
  assert.equal(normalizeFfaVesselClass('Coaster'), null);
  assert.equal(getCurrentFfaPeriod(new Date('2026-08-12T12:00:00Z')), 'Aug-26');
});

test('maps each detected vessel category to its spot and FFA references', () => {
  assert.deepEqual(resolvePricingMarketMapping('Handysize / Small Tanker'), {
    spotIndex: 'BHSI',
    ffaVesselClass: 'Handysize',
  });
  assert.deepEqual(resolvePricingMarketMapping('Supramax / MR'), {
    spotIndex: 'BSI',
    ffaVesselClass: 'Supramax',
  });
  assert.deepEqual(resolvePricingMarketMapping('Panamax / Kamsarmax / LR1'), {
    spotIndex: 'BPI',
    ffaVesselClass: 'Panamax',
  });
  assert.deepEqual(resolvePricingMarketMapping('Capesize / Suezmax'), {
    spotIndex: 'BCI',
    ffaVesselClass: 'Capesize',
  });
  assert.equal(resolvePricingMarketMapping('Coaster'), null);
});

test('queries the latest Neon spot row for the requested index', async () => {
  let capturedQuery = '';
  let capturedValues = [];
  const pool = {
    async query(query, values) {
      capturedQuery = query;
      capturedValues = values;
      return {
        rows: [{
          index_name: 'BHSI',
          record_date: '2026-08-12',
          spot_rate: '867',
          daily_change_value: '-3',
          daily_change_pct: '-0.34',
          monthly_change_pct: '-5.14',
          created_at: '2026-08-12T12:37:55.060Z',
        }],
      };
    },
  };

  const rows = await fetchLatestBalticSpotRates(pool, 'BHSI');

  assert.match(capturedQuery, /WHERE index_name = \$1/);
  assert.match(capturedQuery, /FROM market_spot_rates/);
  assert.match(capturedQuery, /ORDER BY record_date DESC, created_at DESC, id DESC/);
  assert.match(capturedQuery, /LIMIT 1/);
  assert.deepEqual(capturedValues, ['BHSI']);
  assert.equal(rows[0].spot_rate, 867);
  assert.equal(rows[0].daily_change_pct, -0.34);
});

test('queries the current-month Handysize TCA from market_ffa_rates', async () => {
  let capturedQuery = '';
  let capturedValues = [];
  const pool = {
    async query(query, values) {
      capturedQuery = query;
      capturedValues = values;
      return {
        rows: [{
          vessel_class: 'Handysize 7TC',
          period: 'Aug-26',
          record_date: '2026-08-11',
          rate_usd: '16065',
          created_at: '2026-08-12T11:29:05.926Z',
        }],
      };
    },
  };

  const entry = await fetchLatestFfaRate(pool, 'Handysize', new Date('2026-08-12T12:00:00Z'));

  assert.match(capturedQuery, /FROM market_ffa_rates/);
  assert.match(capturedQuery, /WHERE vessel_class ILIKE \$1/);
  assert.match(capturedQuery, /CASE WHEN period = \$2 THEN 0 ELSE 1 END/);
  assert.deepEqual(capturedValues, ['%Handysize%', 'Aug-26']);
  assert.equal(entry.rate_usd, 16065);
  assert.equal(entry.period, 'Aug-26');
});

test('exposes the Neon query through the spot-rates Netlify endpoint', async () => {
  const source = await readFile(new URL('../netlify/functions/spot-rates.ts', import.meta.url), 'utf8');
  assert.match(source, /path: '\/api\/spot-rates'/);
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /fetchLatestBalticSpotRates\(pool, requestedIndex\)/);
  assert.match(source, /fetchLatestFfaRate\(pool, requestedVesselClass\)/);
  assert.match(source, /spotReference: requestedIndex \? data\[0\] \|\| null : null/);
  assert.match(source, /tceTarget,/);
  assert.match(source, /resolvePricingMarketMapping\(requestedCategory\)/);
  assert.match(source, /mapping: \{/);
  assert.match(source, /'Cache-Control': 'no-store'/);
});
