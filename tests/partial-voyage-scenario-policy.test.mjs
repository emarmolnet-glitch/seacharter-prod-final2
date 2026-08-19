import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyVoyageScenarioDefaults,
  getDefaultCancelling,
  getDefaultLaycan,
  hasMinimumVoyageRoute,
} from '../shared/voyage-scenario-policy.mjs';

const referenceDate = new Date('2026-08-18T00:00:00Z');

test('a voyage becomes injectable with POL and POD only', () => {
  assert.equal(hasMinimumVoyageRoute({ pol: 'Bejaia', pod: 'Aveiro' }), true);
  assert.equal(hasMinimumVoyageRoute({ pol: 'Bejaia', pod: '' }), false);
});

test('partial voyage defaults keep calculators safe', () => {
  const scenario = applyVoyageScenarioDefaults({ pol: 'Bejaia', pod: 'Aveiro' }, referenceDate);

  assert.equal(getDefaultLaycan(referenceDate), '2026-08-22');
  assert.equal(getDefaultCancelling('2026-08-22'), '2026-08-27');
  assert.deepEqual(scenario, {
    pol: 'Bejaia',
    pod: 'Aveiro',
    laydays: '2026-08-22',
    cancelling: '2026-08-27',
    cargo_qty: 0,
    cargo_type: 'TBA',
    loading_rate: 0,
    discharge_rate: 0,
    loading_terms: 'CQD',
    discharge_terms: 'CQD',
    laytimePOL: 'CQD',
    laytimePOD: 'CQD',
    defaults_applied: [
      'laydays',
      'cancelling',
      'cargo_qty',
      'cargo_type',
      'loading_rate',
      'discharge_rate',
    ],
    is_partial: true,
  });
});

test('a single operational date expands into a valid five-day laycan window', () => {
  const scenario = applyVoyageScenarioDefaults({
    pol: 'Bilbao',
    pod: 'Rotterdam',
    laydays: '2026-09-10',
    cancelling: '2026-09-10',
  }, referenceDate);

  assert.equal(scenario.laydays, '2026-09-10');
  assert.equal(scenario.cancelling, '2026-09-15');
  assert.ok(scenario.defaults_applied.includes('cancelling'));
});

test('a lone cancelling date is treated as the start of the default window', () => {
  const scenario = applyVoyageScenarioDefaults({
    pol: 'Bilbao',
    pod: 'Rotterdam',
    cancelling: '2026-09-10',
  }, referenceDate);

  assert.equal(scenario.laydays, '2026-09-10');
  assert.equal(scenario.cancelling, '2026-09-15');
});

test('provided operational data is preserved without partial mode', () => {
  const scenario = applyVoyageScenarioDefaults({
    pol: 'Bilbao',
    pod: 'Rotterdam',
    laydays: '2026-09-10',
    cancelling: '2026-09-12',
    cargo_qty: 18000,
    cargo_type: 'Clinker',
    loading_rate: 4500,
    discharge_rate: 5000,
    loading_terms: 'SHEX',
    discharge_terms: 'SHINC',
  }, referenceDate);

  assert.equal(scenario.is_partial, false);
  assert.deepEqual(scenario.defaults_applied, []);
  assert.equal(scenario.cargo_qty, 18000);
  assert.equal(scenario.loading_terms, 'SHEX');
});
