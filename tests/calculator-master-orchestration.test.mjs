import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('section 2 button runs the complete calculation orchestrator', () => {
  assert.match(indexSource, /id="btn-validate-section2"[^>]*onclick="handleMasterValidationAndCalculate\(event\)"/);
  assert.match(indexSource, /let isCalculatingMaster = false/);
  assert.match(indexSource, /Calculando operación completa\.\.\./);
  assert.match(indexSource, /finally \{[\s\S]*isCalculatingMaster = false;[\s\S]*setMasterCalculationLoading\(false\)/);
});

test('master calculation preserves the required sequential workflow', () => {
  const start = indexSource.indexOf('async function handleMasterValidationAndCalculate');
  const end = indexSource.indexOf('window.handleMasterValidationAndCalculate = handleMasterValidationAndCalculate;', start);
  const source = indexSource.slice(start, end);

  const validation = source.indexOf('await validarYCalcularSeccion2');
  const costsAndPdas = source.indexOf('await consultCurrentCostsAndPdasForMaster');
  const adjustments = source.indexOf('await recalculateAdjustedAndSave');
  const route = source.indexOf('await synchronizeMasterRouteCalculations();');
  const freightAndDemurrage = source.indexOf('calculateMasterFreightAndDemurrage();');

  assert.ok(validation >= 0);
  assert.ok(validation < costsAndPdas);
  assert.ok(costsAndPdas < adjustments);
  assert.ok(adjustments < route);
  assert.ok(route < freightAndDemurrage);
  assert.doesNotMatch(source, /useEffect\s*\(/);
});

test('master calculation branches by vessel class without chained effects', () => {
  assert.match(indexSource, /function resolveMasterVesselCalculationBranch\(\)/);
  assert.match(indexSource, /normalizedClass\.includes\('HANDYSIZE'\)/);
  assert.match(indexSource, /normalizedClass\.includes\('COASTER'\)/);
  assert.match(indexSource, /normalizedClass\.includes\('MINI-BULKER'\)/);
  assert.match(indexSource, /branch\.mode === 'FEARNLEYS_TCE'[\s\S]*await handleFetchFearnleysTce\(\{ managedByMaster: true \}\)/);
  assert.match(indexSource, /syncCostPlusFromRoute\(false\)/);
});

test('Fearnleys failures propagate to the master orchestrator', () => {
  assert.match(indexSource, /async function handleFetchFearnleysTce\(options = \{\}\)/);
  assert.match(indexSource, /const managedByMaster = options\.managedByMaster === true/);
  assert.match(indexSource, /catch \(error\) \{[\s\S]*if \(managedByMaster\) throw error/);
});

test('master calculation batches store notifications across awaited work', () => {
  assert.match(indexSource, /async batchAsync\(fn\)[\s\S]*this\.isBatching = true;[\s\S]*return await fn\(\);[\s\S]*this\.notify\(\)/);
  assert.match(indexSource, /await SeaCharterStore\.batchAsync\(async \(\) => \{/);
  assert.match(indexSource, /await autoFillBunkers\(\{ managedByMaster: true \}\)/);
  assert.match(indexSource, /await autoFillPDA\('pol', false, \{ deferEngine: true \}\)/);
  assert.match(indexSource, /await autoFillPDA\('pod', false, \{ deferEngine: true \}\)/);
});
