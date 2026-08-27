import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const engine = require('../voyage-cost-engine.js');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Friday operations use 24 overtime hours in Friday-weekend countries', () => {
  const result = engine.calculateOperationalRisk(10000, '2026-08-28T00:00:00Z', 1, 'Algeria', 7.5, 9, {
    cargoQuantity: 1000,
    portDailyRate: 1000,
    standardHourlyRate: 100,
    overtimeMultiplier: 1.5,
  });

  assert.equal(result.hasWeekendPenalty, true);
  assert.equal(result.shiftSimulation.totalPortHours, 24);
  assert.equal(result.shiftSimulation.standardHours, 0);
  assert.equal(result.shiftSimulation.overtimeHours, 24);
  assert.equal(result.adjustedPDA, 11200);
  assert.equal(result.penaltyAmount, 1200);
  assert.equal(result.riskLevel, 'MODERADO');
  assert.deepEqual(result.weekendDates, ['2026-08-28']);
});

test('standard calendars distribute operations across daytime, night and weekend hours', () => {
  const result = engine.calculateOperationalRisk(20000, '2026-08-28T00:00:00Z', 2, 'ES', 7.5, 9, {
    cargoQuantity: 2000,
    portDailyRate: 1000,
    standardHourlyRate: 50,
    overtimeMultiplier: 1.5,
  });

  assert.equal(result.hasWeekendPenalty, true);
  assert.equal(result.shiftSimulation.totalPortHours, 48);
  assert.equal(result.shiftSimulation.standardHours, 12);
  assert.equal(result.shiftSimulation.overtimeHours, 36);
  assert.equal(result.penaltyAmount, 900);
  assert.equal(result.adjustedPDA, 20900);
  assert.equal(result.riskLevel, 'MODERADO');
});

test('minority berth availability escalates congestion risk to high', () => {
  const result = engine.calculateOperationalRisk(10000, '2026-08-31T06:00:00Z', 0.5, 'Spain', 8, 9.5, {
    berths: [
      { name: 'Pier 7', max_draft: 8.2 },
      { name: 'Berth 01', max_draft: 7.6 },
      { name: 'Berth 02', max_draft: 7.6 },
      { name: 'Berth 03', max_draft: 7.7 },
      { name: 'Berth 04', max_draft: 7.5 },
      { name: 'Berth 05', max_draft: 7.4 },
      { name: 'Berth 06', max_draft: 7.8 },
    ],
  });

  assert.equal(result.hasWeekendPenalty, false);
  assert.equal(result.isDraftExceeded, false);
  assert.equal(result.hasMinorityBerthAvailability, true);
  assert.equal(result.berthAvailability.compatibleCount, 1);
  assert.equal(result.berthAvailability.totalBerths, 7);
  assert.equal(result.adjustedPDA, 10000);
  assert.equal(result.riskLevel, 'ALTO');
});

test('draft excess across every berth escalates operational risk to high', () => {
  const result = engine.calculateOperationalRisk(10000, '2026-08-31T06:00:00Z', 0.5, 'Spain', 10.2, 9.5, {
    berths: [{ name: 'Pier 7', max_draft: 9.5 }, { name: 'Pier 8', max_draft: 9.2 }],
  });

  assert.equal(result.isDraftExceeded, true);
  assert.equal(result.berthAvailability.compatibleCount, 0);
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
    ['exec-operation-status', { style: {} }],
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
    cargoType: 'Big Bags',
    loadRate: 2000,
    dischargeRate: 1600,
    loadMethod: 'Big Bags - Grúa Barco',
    dischargeMethod: 'Big Bags - Grúa Barco',
  }, {
    riskLevel: 'ALTO',
    hasWeekendPenalty: true,
    hasMinorityBerthAvailability: true,
    compatibleBerths: 1,
    totalBerths: 7,
    standardHours: 12,
    overtimeHours: 36,
    penaltyAmount: 0,
    overtimeSurcharge: 1250,
    penaltyCountries: ['Argelia'],
  }, documentRef);

  assert.equal(updated, true);
  assert.equal(elements.get('exec-pol').textContent, 'Bejaia');
  assert.equal(elements.get('exec-pod').textContent, 'Valencia');
  assert.equal(elements.get('exec-operation-status').textContent, 'OPERACIÓN RENTABLE');
  assert.equal(elements.get('exec-risk-level').textContent, 'ALTO');
  assert.equal(elements.get('exec-risk-level').style.color, '#b91c1c');
  assert.match(elements.get('exec-insight-text').textContent, /5,0 días \(120 horas\) de carga en Bejaia/i);
  assert.match(elements.get('exec-insight-text').textContent, /6,3 días \(150 horas\) de descarga en Valencia/i);
  assert.match(elements.get('exec-insight-text').textContent, /naturaleza de la carga \(Big Bags\).*grúas del buque \(Geared\).*supervisión especial de estiba/i);
  assert.match(elements.get('exec-insight-text').textContent, /12\.0 h a turnos ordinarios y 36\.0 h a Overtime/i);
  assert.match(elements.get('exec-insight-text').textContent, /1 de 7 muelles/i);
  assert.match(elements.get('exec-insight-text').textContent, /coste incremental de \$1,250\.00 en la PDA por recargos operativos \(FHEX\/SHEX\)\.$/i);
});

test('executive insight requests technical rates when the voyage lacks effective rhythms', () => {
  const elements = new Map([
    ['exec-insight-text', { style: {} }],
    ['exec-risk-level', { style: {} }],
  ]);
  const documentRef = { getElementById: (id) => elements.get(id) || null };

  engine.updateExecutiveDashboard({
    pol: 'Bilbao',
    pod: 'Rotterdam',
    cargoQty: 12000,
    cargoType: 'Cemento, yeso, cal y clínker',
  }, {}, documentRef);

  assert.match(elements.get('exec-insight-text').textContent, /Define ritmos efectivos de carga y descarga en Modo Técnico/i);
  assert.doesNotMatch(elements.get('exec-insight-text').textContent, /Tiempo operativo estimado/i);
});

test('executive view exposes the existing full report action', () => {
  assert.match(indexSource, /id="btn-executive-report-summary"[^>]*onclick="generateExecutiveReport\(\)"/);
  assert.match(indexSource, /Ver Reporte Ejecutivo del Viaje/);
  assert.match(indexSource, /querySelectorAll\('\[data-executive-report-action\]'\)/);
});

test('executive dashboard stays neutral until POL, POD and cargo are defined', () => {
  const elements = new Map([
    ['exec-pol', { style: {} }],
    ['exec-pod', { style: {} }],
    ['exec-operation-status', { style: {} }],
    ['exec-cargo-qty', { style: {} }],
    ['exec-cargo-type', { style: {} }],
    ['exec-load-rate', { style: {} }],
    ['exec-disch-rate', { style: {} }],
    ['exec-total-days', { style: {} }],
    ['exec-buy-freight', { style: {} }],
    ['exec-tce', { style: {} }],
    ['exec-sell-freight', { style: {} }],
    ['exec-charterer-profit', { style: {} }],
    ['exec-spread-mt', { style: {} }],
    ['exec-risk-level', { style: {} }],
    ['exec-insight-text', { style: {} }],
  ]);
  const documentRef = { getElementById: (id) => elements.get(id) || null };

  assert.equal(engine.updateExecutiveDashboard({
    pol: 'Bejaia',
    pod: '',
    cargoQty: 10000,
    totalProfit: 45000,
  }, { riskLevel: 'ALTO' }, documentRef), true);

  assert.equal(elements.get('exec-pol').textContent, 'N/D');
  assert.equal(elements.get('exec-pod').textContent, 'N/D');
  assert.equal(elements.get('exec-operation-status').textContent, 'OPERACIÓN PENDIENTE');
  assert.equal(elements.get('exec-cargo-qty').textContent, '0 MT');
  assert.equal(elements.get('exec-total-days').textContent, '0.0 días');
  assert.equal(elements.get('exec-charterer-profit').textContent, '$0');
  assert.equal(elements.get('exec-risk-level').textContent, 'N/D');
  assert.match(elements.get('exec-insight-text').textContent, /Introduce POL, POD y volumen de carga/i);
});

test('Core PRO main engine persists penalty and syncs the executive dashboard', () => {
  assert.match(indexSource, /resolveOperationalPortContext\('pol'\)/);
  assert.match(indexSource, /calculateRisk\(basePdaPol/);
  assert.match(indexSource, /operationalPenaltyAmount/);
  assert.doesNotMatch(indexSource, /Recargo Overtime por fin de semana \(15%\)/);
  assert.match(indexSource, /standardHourlyRate: stevedoringHourlyRate/);
  assert.match(indexSource, /berths: portContext\.berths/);
  assert.match(indexSource, /etaBaseDate.*etaBaseTime/s);
  assert.match(indexSource, /operationalOvertimeHours: operationalRisk\.overtimeHours/);
  assert.match(indexSource, /renderStevedoringCostBreakdown\(stevedoringAllocation, operationalRisk\)/);
  assert.match(indexSource, /State\.operationalRisk = operationalRisk/);
  assert.match(indexSource, /operationalRisk: State\.operationalRisk/);
  assert.match(indexSource, /syncExecutiveDashboard\(\{/);
  assert.doesNotMatch(indexSource, /id="exec-total-profit"/);
  assert.doesNotMatch(indexSource, /Margen Total \(Spread\)/i);
  assert.match(indexSource, /id="exec-charterer-profit"/);
});
