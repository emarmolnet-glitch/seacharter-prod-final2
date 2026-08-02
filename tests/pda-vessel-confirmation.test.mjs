import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../netlify/functions/pda-vessel-confirmation.ts', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');

test('vessel master lookup opens a staged confirmation before mutating the calculator', () => {
  const searchStart = html.indexOf('async function searchLocalVesselDataBridge()');
  const searchEnd = html.indexOf('const BUNKER_INDEX_DATA_KEY', searchStart);
  const searchFlow = html.slice(searchStart, searchEnd);
  assert.match(searchFlow, /openPdaVesselConfirmationModal\(vessel, data\.source \|\| 'databridge'\)/);
  assert.doesNotMatch(searchFlow, /applyResolvedVesselToCalculator\(data\.vessel/);
});

test('confirmation modal includes technical, operational and financial review sections', () => {
  assert.match(html, /id="pda-vessel-comparison-body"/);
  assert.match(html, /id="pda-port-compliance-body"/);
  assert.match(html, /id="pda-financial-breakdown-body"/);
  assert.match(html, /id="pda-freight-per-ton-cards"/);
  assert.match(html, /Aceptar y Actualizar/);
});

test('port impact uses recalculated minus previous values and reconciles through cents', () => {
  assert.match(html, /impactCents: recalculatedCents - previousCents/);
  assert.match(html, /const portDeltaCents = financialRows\.reduce\(\(sum, row\) => sum \+ row\.impactCents, 0\)/);
  assert.match(html, /const portDelta = portDeltaCents \/ 100/);
  assert.match(html, /style: 'currency'/);
});

test('modal header and fixed action area use the SeaCharter corporate palette', () => {
  assert.match(html, /from-\[#003746\] via-\[#004e64\] to-\[#0b6670\]/);
  assert.match(html, /max-h-\[85dvh\]/);
  assert.match(html, /min-h-0 flex-1 space-y-5 overflow-y-auto/);
  assert.match(html, /sticky bottom-0 z-10/);
  assert.match(html, /bg-white px-5/);
  assert.match(html, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(html, /min-h-11 w-full items-center justify-center whitespace-nowrap/);
});

test('freight per ton contrasts owner net and charterer gross using actual vessel capacity', () => {
  assert.match(html, /function getPdaVesselDwcc\(vesselData, cargoTons = 0\)/);
  assert.match(html, /source\.dwcc \?\? source\.dwcc_mt \?\? source\.cargo_capacity/);
  assert.match(html, /const freightPerTon = calculatePdaFreightPerTon\(previous, actual\)/);
  assert.match(html, /ownerNetTotal = billingTons \* ownerRate \* \(1 - \(commissionPct \/ 100\)\)/);
  assert.match(html, /chartererTotal = billingTons \* chartererRate/);
  assert.match(html, /Perspectiva Armador/);
  assert.match(html, /Perspectiva Fletador/);
  assert.match(html, /financialBreakdown = \{[\s\S]*freightPerTon,/);
});

test('acceptance persists through Netlify Database before applying live values', () => {
  const acceptStart = html.indexOf('async function acceptPdaVesselUpdate()');
  const acceptEnd = html.indexOf('window.acceptPdaVesselUpdate', acceptStart);
  const acceptFlow = html.slice(acceptStart, acceptEnd);
  assert.ok(acceptFlow.indexOf("fetch('/api/pda-vessel-confirmation'") < acceptFlow.indexOf('applyResolvedVesselToCalculator'));
  assert.match(acceptFlow, /await autoFillPDA\('pol', false\)/);
  assert.match(acceptFlow, /await autoFillPDA\('pod', false\)/);
  assert.match(acceptFlow, /persistCalculationEvent/);
});

test('confirmation endpoint writes structured audit data with Drizzle', () => {
  assert.match(schema, /export const pdaVesselConfirmations = pgTable\("pda_vessel_confirmations"/);
  assert.match(endpoint, /db\.insert\(pdaVesselConfirmations\)/);
  assert.match(endpoint, /operationalValidation/);
  assert.match(endpoint, /financialBreakdown/);
});
