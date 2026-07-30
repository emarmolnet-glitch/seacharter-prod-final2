import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isJWCRiskZone,
  evaluateJWCRisk,
  calculateAutoExportDeficitBallast,
  calculateAllInFreightGross,
  isExportDeficitPOD
} from '../dss-risk-module.mjs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const decisionesHtml = readFileSync(new URL('../decisiones.html', import.meta.url), 'utf8');

test('JWC Risk Automation: identifies high-risk war risk zones and ports correctly', () => {
  assert.equal(isJWCRiskZone('Red Sea'), true, 'Red Sea must trigger JWC risk');
  assert.equal(isJWCRiskZone('Odesa, Ukraine'), true, 'Odesa Ukraine must trigger JWC risk');
  assert.equal(isJWCRiskZone('Novorossiysk'), true, 'Novorossiysk must trigger JWC risk');
  assert.equal(isJWCRiskZone('Persian Gulf'), true, 'Persian Gulf must trigger JWC risk');
  assert.equal(isJWCRiskZone('Haifa, Israel'), true, 'Israel must trigger JWC risk');
  assert.equal(isJWCRiskZone('Hodeidah, Yemen'), true, 'Hodeidah Yemen must trigger JWC risk');

  assert.equal(isJWCRiskZone('Rotterdam'), false, 'Rotterdam should not trigger JWC risk');
  assert.equal(isJWCRiskZone('Houston'), false, 'Houston should not trigger JWC risk');

  const evalRisk = evaluateJWCRisk('Rotterdam', 'Hodeidah, Yemen');
  assert.equal(evalRisk.isRisk, true, 'evaluateJWCRisk detects risk when POD is in JWC zone');
  assert.equal(evalRisk.podRisk, true, 'POD risk flagged correctly');
});

test('Export Deficit Auto-Ballast: calculates internal ballast days and cost via DB distance matrix and vessel speed', () => {
  const resAuto = calculateAutoExportDeficitBallast('Banjul, Gambia', 0, { vesselSpeed: 12.0 });
  assert.equal(resAuto.isDeficitPOD, true, 'Banjul is recognized as deficit POD');
  assert.equal(resAuto.autoCalculated, true, 'Auto calculation applied when manual ballast is 0');
  assert.equal(resAuto.fallbackPort, 'Las Palmas', 'Identifies nearest habitual safe port Las Palmas');
  assert.equal(resAuto.distanceNM, 950, 'Extracts exact nautical miles 950 NM from DB matrix');
  assert.equal(resAuto.ballastDays, 3.30, 'Calculates ballast days = 950 / (12 * 24) = 3.30 days');

  const resManual = calculateAutoExportDeficitBallast('Banjul, Gambia', 2.5);
  assert.equal(resManual.autoCalculated, false, 'Auto calculation not applied when manual ballast provided');
  assert.equal(resManual.ballastDays, 2.5, 'Manual ballast days respected');
});

test('ALL-IN Gross Engine: binds to dynamic Base Net Freight ($68.00) and applies strict Gross-Up math', () => {
  const dssStateCostPlus = {
    pol: 'Rotterdam',
    pod: 'Houston',
    cargoQty: 50000,
    actualCargoIntake: 50000,
    baseNetFreight: 68.00, // Dynamic rate from active calculator ($68.00)
    opex: 6000,
    totalCommission: 5.0,
    jwlaRiskActive: false
  };

  const resCostPlus = calculateAllInFreightGross(dssStateCostPlus);

  // Verification:
  // Base Net Freight = 68.00 USD/MT
  // Total Surcharges = 0 USD
  // Total Net Rate = 68.00 USD/MT
  // Gross-Up (5% comms) = 68.00 / 0.95 = 71.5789 -> 71.58 USD/MT
  assert.equal(resCostPlus.netFreightRate, 68.00, 'Net freight rate bound to active calculator output ($68.00)');
  assert.equal(resCostPlus.totalNetRate, 68.00, 'Total Net Rate equals base freight when surcharges are 0');
  assert.equal(resCostPlus.allInRateGross, 71.58, 'Gross-Up freight rate calculated correctly ($71.58/MT)');
});

test('ALL-IN Gross Engine with JWC Risk and Deficit Ballast: calculates DB distance matrix ballast cost ($45,000) and applies Gross-Up', () => {
  const dssStateWithRisks = {
    pol: 'Rotterdam',
    pod: 'Sao Tome', // Deficit POD (Sao Tome -> Las Palmas = 2160 NM; 2160 / (12*24) = 7.5d; @ $6,000/d OPEX = $45,000)
    cargoQty: 50000,
    actualCargoIntake: 50000,
    vesselSpeed: 12.0,
    baseNetFreight: 68.00, // Dynamic rate from active calculator ($68.00)
    opex: 6000,
    totalCommission: 5.0,
    jwlaRiskActive: true,
    jwlaPremiumUSD: 15000
  };

  const res = calculateAllInFreightGross(dssStateWithRisks);

  assert.equal(res.isExportDeficit, true, 'Export deficit identified');
  assert.equal(res.autoBallastApplied, true, 'Auto ballast applied');
  assert.equal(res.fallbackPort, 'Las Palmas', 'Identified safe fallback port Las Palmas');
  assert.equal(res.distanceNM, 2160, 'DB Nautical miles distance 2160 NM');
  assert.equal(res.effectiveBallastDays, 7.5, 'Effective ballast days is 2160 / (12*24) = 7.5d');
  assert.equal(res.jwcRiskActive, true, 'JWC risk active');
  assert.equal(res.jwcPremiumUSD, 15000, 'JWC premium included');
  assert.equal(res.ballastCostUSD, 45000, 'Ballast OPEX cost USD calculated via DB matrix (7.5 * $6,000 = $45,000)');

  // Mathematical Verification:
  // Total Surcharges = 15,000 (JWC) + 45,000 (Ballast OPEX) = 60,000 USD
  // Surcharges per ton = 60,000 / 50,000 = 1.20 USD/MT
  // Total Net Rate = 68.00 + 1.20 = 69.20 USD/MT
  // Gross-Up (5% comms) = 69.20 / 0.95 = 72.84 USD/MT
  assert.equal(res.totalSurchargesUSD, 60000, 'Total Surcharges USD calculated correctly ($60,000)');
  assert.equal(res.surchargesPerTon, 1.20, 'Surcharges per ton calculated correctly ($1.20/MT)');
  assert.equal(res.totalNetRate, 69.20, 'Total Net Rate calculated correctly ($69.20/MT)');
  assert.equal(res.allInRateGross, 72.84, 'Gross-Up Freight Rate calculated correctly ($72.84/MT)');
});

test('ALL-IN Gross Engine Tonnage Data Binding: calculates exact unit surcharge for real cargo quantity (5,000 MT)', () => {
  const dssStateRealCargo = {
    pol: 'Rotterdam',
    pod: 'Sao Tome', // Deficit POD (2160 NM / (12*24) = 7.5d; @ $6,000/d OPEX = $45,000)
    cargoQty: 5000, // Real calculator state marking 5,000 MT
    actualCargoIntake: 5000,
    vesselSpeed: 12.0,
    baseNetFreight: 68.00,
    opex: 6000,
    totalCommission: 5.0,
    jwlaRiskActive: false
  };

  const res = calculateAllInFreightGross(dssStateRealCargo);

  assert.equal(res.safeIntake, 5000, 'Reads real cargo quantity 5,000 MT');
  assert.equal(res.ballastCostUSD, 45000, 'Ballast OPEX cost $45,000');
  assert.equal(res.surchargesPerTon, 9.00, 'Unit surcharge strictly equals Total Surcharges ($45,000) / 5,000 MT = $9.00/MT');
  assert.equal(res.totalNetRate, 77.00, 'Total Net Rate = 68.00 + 9.00 = $77.00/MT');
  assert.equal(res.allInRateGross, 81.05, 'Gross-Up ALL-IN Freight = 77.00 / 0.95 = $81.05/MT');
});

test('Fixture Recap Generator: injects dynamic Vessel, Freight Gross, Demurrage, and JWC clause', () => {
  const startIdx = indexHtml.indexOf('function buildFixtureRecapHTMLTemplate(state)');
  const endIdx = indexHtml.indexOf('window.buildFixtureRecapHTMLTemplate = buildFixtureRecapHTMLTemplate;', startIdx);
  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('state', `${fnSource}; return buildFixtureRecapHTMLTemplate(state);`);

  const mockState = {
    pol: 'Rotterdam',
    pod: 'Odesa, Ukraine', // JWC Risk
    cargoQty: 25000,
    commodity: 'General Cargo',
    vesselName: 'MV Sea Leader',
    dwt: 32000,
    vesselType: 'GEARED',
    allInRateGross: 72.40,
    demurrageRate: 18500,
    jwlaRiskActive: true
  };

  const recapText = evalFn(mockState);

  // 1. Vessel Clause
  assert.match(recapText, /VESSEL\s*:\s*MV SEA LEADER - ABT 32,000 MT DWT/, 'Dynamic Vessel Name and formatted DWT with thousands separator');
  assert.match(recapText, /GEARED/, 'Dynamic Vessel Type');

  // 2. Freight Clause
  assert.match(recapText, /FREIGHT: USD 72\.40 PER METRIC TON FIOST BSS 1\/1/, 'Gross ALL-IN Freight injected by DSS');

  // 3. Demurrage Clause
  assert.match(recapText, /DEMURRAGE\s*:\s*USD 18,500 PER DAY PRO RATA/, 'Recommended Demurrage synchronized dynamically');

  // 4. Legal JWC Clause
  assert.match(recapText, /ANY ADDITIONAL PREMIUMS \(AWRP \/ K&R \/ ETC\) C\/O CHARTERERS AS PER JWC/, 'JWC Legal Clause injected conditionally');
});

test('UI Structure: index.html and decisiones.html contain DSS ALL-IN Rate panel and automatic JWC status badge', () => {
  assert.match(indexHtml, /id="section-flete-all-in-gross"/, 'index.html contains ALL-IN Gross section');
  assert.match(indexHtml, /id="btn-aplicar-condiciones-recap"/, 'index.html contains Aplicar Condiciones al Recap button');
  assert.match(indexHtml, /id="badge-jwc-auto-status"/, 'index.html contains automatic JWC status badge');

  assert.match(decisionesHtml, /id="section-flete-all-in-gross"/, 'decisiones.html contains ALL-IN Gross section');
  assert.match(decisionesHtml, /id="btn-aplicar-condiciones-recap"/, 'decisiones.html contains Aplicar Condiciones al Recap button');
  assert.match(decisionesHtml, /id="badge-jwc-auto-status"/, 'decisiones.html contains automatic JWC status badge');
});
