import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  defaultDSSState,
  calculateMarketFreightWithRisk,
  dssCommitSchema,
  handleCommitConditions
} from '../dss-risk-module.mjs';

test('DSS Risk Module: defaultDSSState contains strictly non-undefined risk and ballast defaults', () => {
  assert.equal(defaultDSSState.ballastDays, 0, 'default ballastDays should be 0');
  assert.equal(defaultDSSState.jwlaRiskActive, false, 'default jwlaRiskActive should be false');
  assert.equal(defaultDSSState.jwlaPremiumUSD, 0, 'default jwlaPremiumUSD should be 0');
  assert.equal(defaultDSSState.actualCargoIntake, 50000, 'default actualCargoIntake should inherit targetCargoMT/cargoQty');
});

test('DSS Risk Module: calculateMarketFreightWithRisk computes Oran - Banjul route ($44/MT armador quote scenario)', () => {
  // Scenario:
  // Base Laden Days = 10
  // Repositioning Ballast Days = 4
  // Global Market TCE = $18,000/day
  // Bunkers + Port Direct Costs = $300,000
  // JWLA Premium USD = $50,000 (active)
  // Short Lift Intake = 20,000 MT (instead of theoretical 25,000 MT)
  //
  // Total Days = 10 + 4 = 14
  // Total Voyage Cost = (14 * $18,000) + $300,000 + $50,000 = $252,000 + $300,000 + $50,000 = $602,000
  // Unit Freight Rate = $602,000 / 20,000 MT = $30.10/MT

  const testState = {
    ...defaultDSSState,
    ladenDays: 10,
    ballastDays: 4,
    totalBunkerCost: 200000,
    totalPortDisbursements: 100000,
    jwlaRiskActive: true,
    jwlaPremiumUSD: 50000,
    actualCargoIntake: 20000,
    targetCargoMT: 25000
  };

  const marketFreight = calculateMarketFreightWithRisk(testState, 18000);
  assert.equal(marketFreight, 30.1, 'Calculated freight rate with JWLA risk and ballast should be $30.10/MT');
});

test('DSS Risk Module: calculateMarketFreightWithRisk handles missing or undefined values gracefully without returning NaN', () => {
  const emptyState = {};
  const freight = calculateMarketFreightWithRisk(emptyState, 0);

  assert.equal(Number.isNaN(freight), false, 'Freight rate must not be NaN');
  assert.equal(Number.isFinite(freight), true, 'Freight rate must be a finite number');
  assert.equal(freight >= 0, true, 'Freight rate must be non-negative');
});

test('DSS Risk Module: dssCommitSchema validates required PDF / Neon persistence parameters', () => {
  const validState = {
    ballastDays: 2.5,
    jwlaRiskActive: true,
    jwlaPremiumUSD: 15000,
    actualCargoIntake: 45000,
    vesselName: 'MV SeaCharter Pioneer',
    freightRateUSD: 44.5
  };

  const parseResult = dssCommitSchema.safeParse(validState);
  assert.equal(parseResult.success, true, 'Valid DSS state must pass dssCommitSchema validation');
  if (parseResult.success) {
    assert.equal(parseResult.data.ballastDays, 2.5);
    assert.equal(parseResult.data.jwlaRiskActive, true);
    assert.equal(parseResult.data.jwlaPremiumUSD, 15000);
    assert.equal(parseResult.data.actualCargoIntake, 45000);
    assert.equal(parseResult.data.vesselName, 'MV SeaCharter Pioneer');
    assert.equal(parseResult.data.freightRateUSD, 44.5);
  }
});

test('DSS Risk Module: dssCommitSchema rejects invalid or negative values', () => {
  const invalidState = {
    ballastDays: -1,
    jwlaRiskActive: true,
    jwlaPremiumUSD: -500,
    actualCargoIntake: 0, // must be positive
    vesselName: '',
    freightRateUSD: -10
  };

  const parseResult = dssCommitSchema.safeParse(invalidState);
  assert.equal(parseResult.success, false, 'Invalid state with negative values must fail Zod validation');
});

test('DSS Risk Module: handleCommitConditions executes commit callback only when validation passes', () => {
  let commitExecuted = false;
  let committedData = null;

  const validFormState = {
    ...defaultDSSState,
    vesselName: 'MV Atlantic Leader',
    freightRateUSD: 42,
    ballastDays: 3,
    jwlaRiskActive: true,
    jwlaPremiumUSD: 12000,
    actualCargoIntake: 38000
  };

  const result = handleCommitConditions(validFormState, (data) => {
    commitExecuted = true;
    committedData = data;
  });

  assert.equal(result, true, 'handleCommitConditions should return true for valid state');
  assert.equal(commitExecuted, true, 'Commit callback must be invoked for valid state');
  assert.equal(committedData?.actualCargoIntake, 38000);
  assert.equal(committedData?.vesselName, 'MV Atlantic Leader');
});

test('UI Accordion & Scripts: index.html contains Primas de Riesgo & Reposicionamiento section and inputs', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

  assert.match(indexHtml, /Primas de Riesgo &amp; Reposicionamiento|Primas de Riesgo & Reposicionamiento/, 'index.html must include Primas de Riesgo section');
  assert.match(indexHtml, /id="input-jwlaRiskActive"/, 'index.html must include input-jwlaRiskActive');
  assert.match(indexHtml, /id="input-jwlaPremiumUSD"/, 'index.html must include input-jwlaPremiumUSD');
  assert.match(indexHtml, /id="input-ballastDays"/, 'index.html must include input-ballastDays');
  assert.match(indexHtml, /id="input-actualCargoIntake"/, 'index.html must include input-actualCargoIntake');
  assert.match(indexHtml, /calculateMarketFreightWithRisk/, 'index.html must expose calculateMarketFreightWithRisk');
  assert.match(indexHtml, /handleCommitConditions/, 'index.html must expose handleCommitConditions');
});

test('UI Accordion & Scripts: decisiones.html contains Primas de Riesgo & Reposicionamiento section and inputs', () => {
  const decisionesHtml = fs.readFileSync(path.join(process.cwd(), 'decisiones.html'), 'utf8');

  assert.match(decisionesHtml, /Primas de Riesgo &amp; Reposicionamiento|Primas de Riesgo & Reposicionamiento/, 'decisiones.html must include Primas de Riesgo section');
  assert.match(decisionesHtml, /id="input-jwlaRiskActive"/, 'decisiones.html must include input-jwlaRiskActive');
  assert.match(decisionesHtml, /id="input-jwlaPremiumUSD"/, 'decisiones.html must include input-jwlaPremiumUSD');
  assert.match(decisionesHtml, /id="input-ballastDays"/, 'decisiones.html must include input-ballastDays');
  assert.match(decisionesHtml, /id="input-actualCargoIntake"/, 'decisiones.html must include input-actualCargoIntake');
});
