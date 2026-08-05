import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const branchStart = indexSource.indexOf('function resolveMasterVesselCalculationBranch');
const branchEnd = indexSource.indexOf('function calculateMasterFreightAndDemurrage', branchStart);
const branchSource = indexSource.slice(branchStart, branchEnd);

function createBranchHarness({ vesselDwt, centralizedClass, pricingClass }) {
  const calls = {
    fearnleys: 0,
    inverseSync: 0,
    inverseCalculation: 0,
    normalRouteSync: 0
  };
  const context = {
    document: {
      getElementById(id) {
        return id === 'vessel-dwt' ? { value: String(vesselDwt) } : null;
      }
    },
    State: { dwt: vesselDwt, cargo: 12000, daysSea: 4, daysPort: 2 },
    getVesselClass: () => pricingClass,
    getCentralizedVesselClass: () => centralizedClass,
    recalcularDiasPuerto() {},
    calculateAdjustedEtaAndDays() {},
    runEngine() {},
    syncInverseTceFromVoyage() {
      calls.inverseSync += 1;
    },
    async handleFetchFearnleysTce(options) {
      assert.equal(options?.managedByMaster, true);
      calls.fearnleys += 1;
    },
    calculateInverseTce() {
      calls.inverseCalculation += 1;
    },
    syncCostPlusFromRoute(showFeedback) {
      assert.equal(showFeedback, false);
      calls.normalRouteSync += 1;
      return true;
    }
  };

  vm.runInNewContext(`${branchSource}\nglobalThis.masterBranch = { resolveMasterVesselCalculationBranch, synchronizeMasterRouteCalculations };`, context);
  return { calls, masterBranch: context.masterBranch };
}

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

test('step 4 triggers the inverse TCE button handler for Handysize and larger vessels', async () => {
  for (const vessel of [
    { vesselDwt: 25000, centralizedClass: 'HANDYSIZE', categoryName: 'Handysize / Small Tanker' },
    { vesselDwt: 55000, centralizedClass: 'SUPRAMAX', categoryName: 'Supramax / MR' }
  ]) {
    const harness = createBranchHarness({
      ...vessel,
      pricingClass: { categoryName: vessel.categoryName, type: 'TCE Inverso' }
    });

    const branch = await harness.masterBranch.synchronizeMasterRouteCalculations();

    assert.equal(branch.mode, 'FEARNLEYS_TCE');
    assert.equal(harness.calls.fearnleys, 1);
    assert.equal(harness.calls.inverseSync, 1);
    assert.equal(harness.calls.inverseCalculation, 1);
    assert.equal(harness.calls.normalRouteSync, 0);
  }
});

test('step 4 triggers the normal route synchronization handler for smaller vessels', async () => {
  for (const vessel of [
    { vesselDwt: 3500, centralizedClass: 'COASTER', categoryName: 'Coaster' },
    { vesselDwt: 10000, centralizedClass: 'MINI-BULKER', categoryName: 'Mini-Bulker' }
  ]) {
    const harness = createBranchHarness({
      ...vessel,
      pricingClass: { categoryName: vessel.categoryName, type: 'Cost-Plus' }
    });

    const branch = await harness.masterBranch.synchronizeMasterRouteCalculations();

    assert.equal(branch.mode, 'COST_PLUS_ROUTE');
    assert.equal(harness.calls.normalRouteSync, 1);
    assert.equal(harness.calls.fearnleys, 0);
    assert.equal(harness.calls.inverseSync, 0);
    assert.equal(harness.calls.inverseCalculation, 0);
  }
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
