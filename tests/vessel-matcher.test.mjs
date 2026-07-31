import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matcherSource = readFileSync(new URL('../db/vessel-matcher.ts', import.meta.url), 'utf8');

test('vessel matcher applies strict DWT filtering with parameterized bounds', () => {
  assert.match(matcherSource, /FROM vessels_master/);
  assert.match(matcherSource, /WHERE dwt BETWEEN \$1 AND \$2/);
});

test('vessel matcher preserves master vessels through resilient fresh telemetry join', () => {
  assert.match(matcherSource, /LEFT JOIN ais_telemetry_buffer tb/);
  assert.match(matcherSource, /vm\.mmsi = tb\.mmsi OR vm\.imo::text = tb\.mmsi::text/);
  assert.match(
    matcherSource,
    /tb\.updated_at >= NOW\(\) - make_interval\(hours => \$5\)/,
  );
});

test('vessel matcher calculates optional proximity and releases PostgreSQL clients', () => {
  assert.match(matcherSource, /AS approximate_distance_nm/);
  assert.match(
    matcherSource,
    /ORDER BY approximate_distance_nm ASC NULLS LAST, tb\.updated_at DESC/,
  );
  assert.match(matcherSource, /telemetryTtlHours \?\? DEFAULT_TELEMETRY_TTL_HOURS/);
  assert.match(matcherSource, /finally \{[\s\S]*client\.release\(\)/);
});
