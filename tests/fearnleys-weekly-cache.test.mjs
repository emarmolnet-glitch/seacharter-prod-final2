import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  fetchLatestFearnleysRate,
  getFearnleysCacheKey,
  getIsoWeek,
  isCurrentWeekCacheEntry,
} from '../netlify/functions/lib/fearnleys-cache.mjs';

test('builds ISO week identifiers across year boundaries', () => {
  assert.deepEqual(getIsoWeek(new Date('2026-07-21T12:00:00Z')), {
    year: 2026,
    weekNumber: 30,
    weekId: 'week-30-2026',
  });
  assert.deepEqual(getIsoWeek(new Date('2021-01-01T12:00:00Z')), {
    year: 2020,
    weekNumber: 53,
    weekId: 'week-53-2020',
  });
});

test('validates cache entries by week and vessel category key', () => {
  const currentWeek = getIsoWeek(new Date('2026-07-21T12:00:00Z'));
  assert.equal(
    getFearnleysCacheKey('Panamax / Kamsarmax / LR1'),
    'weekly/panamax-kamsarmax-lr1.json',
  );
  assert.equal(isCurrentWeekCacheEntry({ weekId: 'week-30-2026', value: 17750 }, currentWeek), true);
  assert.equal(isCurrentWeekCacheEntry({ weekId: 'week-29-2026', value: 17750 }, currentWeek), false);
  assert.equal(isCurrentWeekCacheEntry({ weekId: 'week-30-2026', value: 'invalid' }, currentWeek), false);
});

test('extracts the latest valid route rate from the Fearnleys response', async () => {
  let requestBody;
  const fakeFetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          data: {
            rate_meta: [{ rates: [{ date: '2026-07-15', rate: 17750 }] }],
          },
        };
      },
    };
  };

  const result = await fetchLatestFearnleysRate(
    'Panamax / Kamsarmax / LR1',
    fakeFetch,
    new Date('2026-07-21T12:00:00Z'),
  );

  assert.equal(requestBody.variables.route[0], 'Panamax (75 000 dwt)');
  assert.deepEqual(result, {
    value: 17750,
    sourceDate: '2026-07-15',
    sourceRoute: 'Panamax (75 000 dwt)',
  });
});

test('keeps the instant cache-hit message and backend endpoint wired in both interfaces', async () => {
  const [indexSource, workspaceSource, functionSource] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../netlify/functions/fearnleys-tce.js', import.meta.url), 'utf8'),
  ]);

  for (const source of [indexSource, workspaceSource]) {
    assert.match(source, /Datos extraídos de Caché: Week/);
    assert.match(source, /\/api\/fearnleys-tce\?vesselCategory=/);
  }
  assert.match(functionSource, /consistency: 'strong'/);
  assert.match(functionSource, /isCurrentWeekCacheEntry/);
  assert.match(functionSource, /store\.setJSON/);
});
