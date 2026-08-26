import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../netlify/functions/bunker-market-latest.ts', import.meta.url), 'utf8');

test('bunker market endpoint returns the latest normalized row per hub and fuel grade', () => {
  assert.match(source, /path: "\/api\/market\/bunkers-latest"/);
  assert.match(source, /FROM bunker_prices_log/);
  assert.match(source, /SELECT DISTINCT ON/);
  assert.match(source, /UPPER\(REPLACE\(BTRIM\(fuel_grade\), ' ', ''\)\)/);
  assert.match(source, /vlsfo: findMarketPrice\(bunkers, "VLSFO"\)/);
  assert.match(source, /ifo380: findMarketPrice\(bunkers, "IFO380"\)/);
  assert.match(source, /mgo: findMarketPrice\(bunkers, "MGO"\)/);
  assert.match(source, /data: \{ \.\.\.market, bunkers \}/);
  assert.match(source, /price: Number\(row\.price\)/);
});
