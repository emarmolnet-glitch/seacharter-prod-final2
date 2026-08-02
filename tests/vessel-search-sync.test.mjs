import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [endpointSource, indexSource] = await Promise.all([
  readFile(new URL('../netlify/functions/databridge-vessel-search.ts', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

test('targeted vessel lookup includes fresh Due Diligence rows and MMSI matches', () => {
  const targetedLookupStart = endpointSource.indexOf('// Local-first lookup:');
  const targetedLookupEnd = endpointSource.indexOf('if (!queryResult.rows', targetedLookupStart);
  const targetedLookup = endpointSource.slice(targetedLookupStart, targetedLookupEnd);

  assert.ok(targetedLookupStart >= 0);
  assert.match(targetedLookup, /FROM vessels_master/);
  assert.match(targetedLookup, /OR mmsi = \$1/);
  assert.match(targetedLookup, /audit_status IS NOT NULL/);
  assert.doesNotMatch(targetedLookup, /status = 'EN_CARTERA'/);
  assert.doesNotMatch(targetedLookup, /validation_status = 'VALIDADO'/);
  assert.match(endpointSource, /auditStatus: row\.audit_status/);
  assert.match(endpointSource, /local_first: true/);
});

test('calculator lookup prefers the fresh Neon response and uses GlobalStore only as fallback', () => {
  const lookupStart = indexSource.indexOf('async function searchLocalVesselDataBridge()');
  const lookupEnd = indexSource.indexOf('const BUNKER_INDEX_DATA_KEY', lookupStart);
  const lookupSource = indexSource.slice(lookupStart, lookupEnd);

  assert.ok(lookupStart >= 0);
  assert.match(indexSource, /function findCompleteVesselInGlobalStore\(searchTerm\)/);
  assert.match(indexSource, /Array\.isArray\(store\.dueDiligenceVessels\)/);
  assert.match(indexSource, /if \(!vessel \|\| !vessel\.dwt \|\| !vessel\.year_built\) continue/);
  assert.match(lookupSource, /const storeVessel = findCompleteVesselInGlobalStore\(vesselName\)/);
  assert.ok(lookupSource.indexOf("fetch('/api/databridge-vessel-search'") < lookupSource.indexOf("source: 'global-store-fallback'"));
  assert.match(lookupSource, /if \(\(!data \|\| data\.success === false \|\| !data\.vessel\) && storeVessel\)/);
  assert.match(lookupSource, /data = \{ success: true, vessel: storeVessel, source: 'global-store-fallback' \}/);
});

test('fresh vessel response overwrites DOM, State and local section state with backend keys', () => {
  const applyStart = indexSource.indexOf('function applyResolvedVesselToCalculator(');
  const applyEnd = indexSource.indexOf('async function searchLocalVesselDataBridge()', applyStart);
  const applySource = indexSource.slice(applyStart, applyEnd);

  assert.ok(applyStart >= 0);
  assert.match(applySource, /dwt: backendVessel\.dwt/);
  assert.match(applySource, /imo_number: backendVessel\.imo_number/);
  assert.match(applySource, /vessel_name: backendVessel\.vessel_name/);
  assert.match(applySource, /year_built: backendVessel\.year_built/);
  assert.match(applySource, /dwtInput\.value = visualDwt/);
  assert.match(applySource, /State\.dwt = resolvedDwt/);
  assert.match(applySource, /State\.imo = resolvedImo/);
  assert.match(applySource, /State\.yearBuilt = resolvedYear/);
  assert.match(applySource, /updateSection2LocalState\('vessel-dwt', visualDwt\)/);
  assert.match(applySource, /dwtInput\?\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(applySource, /handleDWTChange\(true, false\)/);
  assert.match(applySource, /refreshVesselCompatibilityWarning\(\)/);
});

test('compatibility warning is recalculated from the current DWT input immediately', () => {
  const warningStart = indexSource.indexOf('function refreshVesselCompatibilityWarning()');
  const warningEnd = indexSource.indexOf('function autoClassifySpecialtyFromInputs()', warningStart);
  const warningSource = indexSource.slice(warningStart, warningEnd);
  assert.match(warningSource, /document\.getElementById\('vessel-dwt'\)\?\.value/);
  assert.match(warningSource, /document\.getElementById\('cargo-qty'\)\?\.value/);
  assert.match(warningSource, /vesselDwtVal < cargo/);
  assert.match(warningSource, /warningEl\.classList\.add\('hidden'\)/);
  assert.match(indexSource, /refreshVesselCompatibilityWarning\(\);/);
});

test('Apply to Estimator consolidates IMO and exposes the active calculator vessel', () => {
  const applyStart = indexSource.indexOf('function applyMatchingVesselToCalculator(');
  const applyEnd = indexSource.indexOf('// --- LECTURA DE WPI.CSV', applyStart);
  const applySource = indexSource.slice(applyStart, applyEnd);

  assert.match(applySource, /vessel\.imo \|\| vessel\.imo_number \|\| vessel\.numero_imo/);
  assert.match(applySource, /imo: sourceVessel\.imo \|\| sourceVessel\.imo_number/);
  assert.match(applySource, /flag: sourceVessel\.flag \|\| 'Unknown'/);
  assert.match(applySource, /void saveVesselToIndexedDB\(\{/);
  assert.match(applySource, /imo: vessel\.imo \|\| vessel\.imo_number/);
  assert.match(applySource, /flag: vessel\.flag \|\| 'Unknown'/);
  assert.match(applySource, /State\.imo = resolvedImo\.length === 7 \? resolvedImo : 'Unknown'/);
  assert.match(applySource, /window\.GlobalStore\.activeVessel = vessel/);
  assert.match(applySource, /window\.GlobalStore\.calculatorVessel = vessel/);
});

test('calculator renders five editable technical badges in one responsive row', () => {
  const badgesStart = indexSource.indexOf('id="vessel-identity-meta"');
  const badgesEnd = indexSource.indexOf('<div class="input-group">', badgesStart);
  const badgesSource = indexSource.slice(badgesStart, badgesEnd);
  assert.match(indexSource, /id="vessel-identity-imo"/);
  assert.match(indexSource, /id="vessel-identity-flag"/);
  assert.match(indexSource, /id="vessel-identity-dwt"/);
  assert.match(indexSource, /id="vessel-identity-gt"/);
  assert.match(indexSource, /id="vessel-identity-year"/);
  assert.match(badgesSource, /class="flex flex-row flex-nowrap items-center gap-2 mt-2 w-full overflow-hidden"/);
  const unifiedBadgeClass = 'flex flex-row items-center bg-slate-50 border border-slate-200 rounded px-2 py-1 focus-within:ring-1 focus-within:ring-blue-500 focus-within:bg-white focus-within:border-blue-500 transition-colors shrink-0';
  assert.equal(badgesSource.split(unifiedBadgeClass).length - 1, 5);
  assert.equal(badgesSource.split('text-slate-500 text-xs font-semibold mr-1').length - 1, 5);
  assert.equal(badgesSource.split('placeholder="N/A"').length - 1, 5);
  assert.match(badgesSource, />IMO:<\/span>[\s\S]*w-16 placeholder-slate-400/);
  assert.match(badgesSource, />Bandera:<\/span>[\s\S]*w-24 placeholder-slate-400/);
  assert.match(badgesSource, />DWT:<\/span>[\s\S]*w-14 placeholder-slate-400/);
  assert.match(badgesSource, />GT:<\/span>[\s\S]*w-14 placeholder-slate-400/);
  assert.match(badgesSource, />Año:<\/span>[\s\S]*w-10 placeholder-slate-400/);
  assert.match(badgesSource, /handleManualVesselUpdate\('imo', this\.value\)/);
  assert.match(badgesSource, /handleManualVesselUpdate\('dwt', this\.value\)/);
  assert.match(badgesSource, /handleManualVesselUpdate\('flag', this\.value\)/);
  assert.match(badgesSource, /handleManualVesselUpdate\('gt', this\.value\)/);
  assert.match(badgesSource, /handleManualVesselUpdate\('year_built', this\.value\)/);
  assert.doesNotMatch(badgesSource, /bg-slate-900|bg-blue-900|bg-sky-50|text-sky-700|text-blue-500|border-slate-700/);
  assert.match(indexSource, /function updateCalculatorVesselIdentityDisplay\(vessel, fallbackName = ''\)/);
  assert.match(indexSource, /function updateCalculatorDwtBadge\(value\)/);
  assert.match(indexSource, /function handleManualVesselUpdate\(field, value\)/);
  assert.match(indexSource, /if \(nameInput && vesselName\) nameInput\.value = vesselName/);
  assert.match(indexSource, /flagInput\.value = flag/);
  assert.match(indexSource, /imoInput\.value = imo/);
  assert.match(indexSource, /flagBadgeInput\.value = flag/);
  assert.match(indexSource, /gtInput\.value = Number\.isFinite\(gt\)/);
  assert.match(indexSource, /yearInput\.value = Number\.isFinite\(yearBuilt\)/);
  assert.match(indexSource, /dwt: updateCalculatorDwtBadge\(dwt\)/);
  assert.match(indexSource, /const dwt = parseFloat\(document\.getElementById\('vessel-dwt'\)\.value\) \|\| 0;[\s\S]*updateCalculatorDwtBadge\(dwt\)/);
  assert.match(indexSource.slice(
    indexSource.indexOf('function applyMatchingVesselToCalculator('),
    indexSource.indexOf('// --- LECTURA DE WPI.CSV'),
  ), /updateCalculatorVesselIdentityDisplay\(vessel\)/);
  assert.match(indexSource.slice(
    indexSource.indexOf('async function loadVesselParamsFromIndexedDB'),
    indexSource.indexOf('async function saveEditedVesselParams'),
  ), /updateCalculatorVesselIdentityDisplay\(\{ \.\.\.vessel, imo: vessel\.imo \|\| imo \}, vessel\.name \|\| ''\)/);
  assert.doesNotMatch(indexSource.slice(
    indexSource.indexOf('async function searchLocalVesselDataBridge()'),
    indexSource.indexOf('const BUNKER_INDEX_DATA_KEY'),
  ), /const formattedName = `\$\{officialName\}/);
});

test('manual DWT edits update calculator state and force compatibility recalculation', () => {
  const handlerStart = indexSource.indexOf('function handleManualVesselUpdate(field, value)');
  const handlerEnd = indexSource.indexOf('window.handleManualVesselUpdate', handlerStart);
  const handlerSource = indexSource.slice(handlerStart, handlerEnd);
  assert.match(handlerSource, /State\.dwt = dwt/);
  assert.match(handlerSource, /dwtInput\.value = dwt/);
  assert.match(handlerSource, /updateSection2LocalState\('vessel-dwt'/);
  assert.match(handlerSource, /handleDWTChange\(true, false\)/);
  assert.match(handlerSource, /refreshVesselCompatibilityWarning\(\)/);
  assert.match(handlerSource, /window\.GlobalStore\.activeVessel = updatedVessel/);
  assert.match(handlerSource, /window\.GlobalStore\.calculatorVessel = updatedVessel/);
  assert.match(handlerSource, /scheduleReactiveEngine\(\)/);
});

test('calculator save persists editable master fields and keeps GT locally', () => {
  const saveStart = indexSource.indexOf('async function saveCurrentVesselToDB()');
  const saveEnd = indexSource.indexOf('let allAuditedVessels', saveStart);
  const saveSource = indexSource.slice(saveStart, saveEnd);
  assert.match(saveSource, /document\.getElementById\('vessel-identity-imo'\)/);
  assert.match(saveSource, /document\.getElementById\('vessel-identity-dwt'\)/);
  assert.match(saveSource, /document\.getElementById\('vessel-identity-flag'\)/);
  assert.match(saveSource, /document\.getElementById\('vessel-identity-gt'\)/);
  assert.match(saveSource, /document\.getElementById\('vessel-identity-year'\)/);
  assert.match(saveSource, /fetch\('\/api\/vessel-due-diligence-save'/);
  assert.match(saveSource, /method: 'PUT'/);
  assert.match(saveSource, /body: JSON\.stringify\(\{ vessel: payload \}\)/);
  assert.match(saveSource, /saveVesselToIndexedDB\(\{ \.\.\.savedVessel, imo, name: vesselName, gt \}\)/);
  assert.doesNotMatch(saveSource, /const formattedName/);
});

test('IndexedDB preserves canonical vessel identity and technical fields', () => {
  const saveStart = indexSource.indexOf('async function saveVesselToIndexedDB(vessel)');
  const saveEnd = indexSource.indexOf('async function loadVesselParamsFromIndexedDB', saveStart);
  const saveSource = indexSource.slice(saveStart, saveEnd);
  assert.match(saveSource, /imo: String\(vessel\.imo\)/);
  assert.match(saveSource, /flag: vessel\.flag \|\| vessel\.bandera/);
  assert.match(saveSource, /gt: vessel\.gt \|\| vessel\.gross_tonnage/);
  assert.match(saveSource, /year_built: vessel\.year_built \|\| vessel\.built_year \|\| vessel\.yearBuilt/);
  assert.match(saveSource, /spd_ballast:/);
  assert.match(saveSource, /cons_port:/);
});
