import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { fetchLatestCarbonPrice } from '../netlify/functions/lib/carbon-price.mjs';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const functionSource = await readFile(new URL('../netlify/functions/carbon-latest.ts', import.meta.url), 'utf8');
const querySource = await readFile(new URL('../netlify/functions/lib/carbon-price.mjs', import.meta.url), 'utf8');

test('carbon endpoint selects the newest Neon market price', async () => {
  const calls = [];
  const pool = {
    async query(statement) {
      calls.push(statement);
      return {
        rows: [{ record_date: '2026-08-13', price_usd: '72.50' }],
      };
    },
  };

  const result = await fetchLatestCarbonPrice(pool);

  assert.equal(calls.length, 1);
  assert.match(calls[0], /FROM market_carbon_prices/);
  assert.match(calls[0], /ORDER BY record_date DESC/);
  assert.match(calls[0], /LIMIT 1/);
  assert.deepEqual(result, {
    recordDate: '2026-08-13',
    priceUsd: 72.5,
  });
});

test('carbon endpoint exposes the requested API path', () => {
  assert.match(functionSource, /path: '\/api\/market\/carbon-latest'/);
  assert.match(functionSource, /fetchLatestCarbonPrice\(getPool\(\)\)/);
  assert.match(querySource, /price_usd::double precision AS price_usd/);
});

test('ETS calculator hydrates the live price and remains editable', () => {
  assert.match(indexSource, /id="eu-carbon-price"[^>]*value="80\.00"[^>]*data-manual-override="false"/);
  assert.match(indexSource, /fetch\('\/api\/market\/carbon-latest'/);
  assert.match(indexSource, /input\.dataset\.manualOverride === 'true'/);
  assert.match(indexSource, /input\.value = marketPrice\.toFixed\(2\)/);
  assert.match(indexSource, /handleCarbonPriceInput\(input\.value, \{ source: 'carbon-market' \}\)/);
  assert.match(indexSource, /void hydrateLatestEuCarbonPrice\(\)/);
  assert.doesNotMatch(indexSource, /euCarbonPrice \|\| 80/);
  assert.doesNotMatch(indexSource, /eu-carbon-price[^\n]*\|\| 80/);
});

test('carbon price normalization preserves a valid zero scenario', () => {
  assert.match(indexSource, /Number\.isFinite\(parsedPrice\) && parsedPrice >= 0 \? parsedPrice : null/);
  assert.match(indexSource, /if \(normalizedPrice !== null\) return normalizedPrice/);
});
