import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const engine = require('../voyage-cost-engine.js');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Friday operations trigger overtime in Islamic-weekend countries', () => {
  const result = engine.calculateOperationalRisk(10000, '2026-08-27', 1, 'Algeria', 7.5, 9);

  assert.equal(result.hasWeekendPenalty, true);
  assert.equal(result.adjustedPDA, 11500);
  assert.equal(result.penaltyAmount, 1500);
  assert.equal(result.riskLevel, 'MODERADO');
  assert.deepEqual(result.weekendDates, ['2026-08-28']);
});

test('Saturday and Sunday trigger overtime for standard calendars', () => {
  const result = engine.calculateOperationalRisk(20000, '2026-08-28', 1, 'ES', 7.5, 9);

  assert.equal(result.hasWeekendPenalty, true);
  assert.equal(result.adjustedPDA, 23000);
  assert.equal(result.riskLevel, 'MODERADO');
});

test('draft excess escalates operational risk to high', () => {
  const result = engine.calculateOperationalRisk(10000, '2026-08-31', 1, 'Spain', 10.2, 9.5);

  assert.equal(result.hasWeekendPenalty, false);
  assert.equal(result.isDraftExceeded, true);
  assert.equal(result.adjustedPDA, 10000);
  assert.equal(result.riskLevel, 'ALTO');
});

test('adjusted cargo rates produce moderate risk without changing PDA', () => {
  const result = engine.calculateOperationalRisk(10000, '2026-08-31', 1, 'Spain', 8, 9, {
    hasAdjustedRates: true,
  });

  assert.equal(result.hasAdjustedRates, true);
  assert.equal(result.adjustedPDA, 10000);
  assert.equal(result.riskLevel, 'MODERADO');
});

test('executive dashboard sync tolerates hidden DOM and formats risk state', () => {
  assert.equal(engine.updateExecutiveDashboard({}, {}, null), false);

  const elements = new Map([
    ['exec-pol', { style: {} }],
    ['exec-pod', { style: {} }],
    ['exec-total-profit', { style: {} }],
    ['exec-cargo-qty', { style: {} }],
    ['exec-risk-level', { style: {} }],
    ['exec-insight-text', { style: {} }],
  ]);
  const documentRef = { getElementById: (id) => elements.get(id) || null };
  const updated = engine.updateExecutiveDashboard({
    pol: 'Bejaia',
    pod: 'Valencia',
    totalProfit: 45000,
    cargoQty: 10000,
  }, {
    riskLevel: 'ALTO',
    hasWeekendPenalty: true,
    isDraftExceeded: true,
    penaltyCountries: ['Argelia'],
  }, documentRef);

  assert.equal(updated, true);
  assert.equal(elements.get('exec-pol').textContent, 'Bejaia');
  assert.equal(elements.get('exec-pod').textContent, 'Valencia');
  assert.equal(elements.get('exec-total-profit').textContent, '+$45,000');
  assert.equal(elements.get('exec-risk-level').textContent, 'ALTO');
  assert.equal(elements.get('exec-risk-level').style.color, '#b91c1c');
  assert.match(elements.get('exec-insight-text').textContent, /recargo automático de 15%/i);
  assert.match(elements.get('exec-insight-text').textContent, /supera el límite operativo/i);
});

test('Core PRO main engine persists penalty and syncs the executive dashboard', () => {
  assert.match(indexSource, /resolveOperationalPortContext\('pol'\)/);
  assert.match(indexSource, /calculateRisk\(basePdaPol/);
  assert.match(indexSource, /operationalPenaltyAmount/);
  assert.match(indexSource, /State\.operationalRisk = operationalRisk/);
  assert.match(indexSource, /operationalRisk: State\.operationalRisk/);
  assert.match(indexSource, /syncExecutiveDashboard\(\{/);
  assert.match(indexSource, /id="exec-total-profit"/);
  assert.match(indexSource, /id="exec-charterer-profit"/);
});
