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
    balticSpot: 0,
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
    async handleFetchBalticSpotTce(options) {
      assert.equal(options?.managedByMaster, true);
      calls.balticSpot += 1;
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

test('secondary bunker failures warn and allow PDA synchronization to continue', async () => {
  const start = indexSource.indexOf('async function consultCurrentCostsAndPdasForMaster');
  const end = indexSource.indexOf('function resolveMasterVesselCalculationBranch', start);
  const source = indexSource.slice(start, end);
  const pdaCalls = [];
  const warnings = [];
  const context = {
    async ensureRegionalBunkersForCalculation() {
      throw new Error('HTTP 500');
    },
    async autoFillPDA(side) {
      pdaCalls.push(side);
      return true;
    },
    showToast(message, tone) {
      warnings.push({ message, tone });
    },
    console: { warn() {} }
  };

  vm.runInNewContext(`${source}\nglobalThis.consultCurrentCostsAndPdasForMaster = consultCurrentCostsAndPdasForMaster;`, context);
  const result = await context.consultCurrentCostsAndPdasForMaster();

  assert.deepEqual(pdaCalls, ['pol', 'pod']);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /usando último precio guardado/);
  assert.equal(warnings[0].tone, 'warning');
});

test('bunker synchronization applies fallback values without throwing in managed mode', () => {
  const start = indexSource.indexOf('async function performRegionalBunkerFetch');
  const end = indexSource.indexOf('function fetchRegionalBunkers', start);
  const source = indexSource.slice(start, end);
  const catchIndex = source.indexOf('} catch (error) {');
  const fallbackIndex = source.indexOf("readBunkerIndexCache({ allowStale: true })", catchIndex);
  const applyIndex = source.indexOf('applyBunkerIndexData(staleCache)', fallbackIndex);
  const safeFallbackIndex = source.indexOf('ensureSafeBunkerPrices()', applyIndex);

  assert.ok(catchIndex >= 0 && catchIndex < fallbackIndex);
  assert.ok(fallbackIndex < applyIndex && applyIndex < safeFallbackIndex);
  assert.doesNotMatch(source, /if \(managedByMaster\) throw error/);
  assert.match(source, /Bunkerindex no disponible/);
  assert.match(source, /'warning'/);
});

test('the master pipeline still returns the local financial result when optional stages fail', async () => {
  const helperStart = indexSource.indexOf('async function runMasterOptionalStage');
  const helperEnd = indexSource.indexOf('function resolveMasterVesselCalculationBranch', helperStart);
  const handlerStart = indexSource.indexOf('async function handleMasterValidationAndCalculate');
  const handlerEnd = indexSource.indexOf('window.handleMasterValidationAndCalculate = handleMasterValidationAndCalculate;', handlerStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const handlerSource = indexSource.slice(handlerStart, handlerEnd);
  const warnings = [];
  let localBatchCalls = 0;
  const context = {
    State: { breakEven: 321.5 },
    SeaCharterStore: { async batchAsync(task) { return task(); } },
    async validarYCalcularSeccion2() { return true; },
    ensureSafeBunkerPrices() { return { vlsfo: 600, ifo380: 600, mgo: 600 }; },
    async consultCurrentCostsAndPdasForMaster() { return { warnings: [] }; },
    async recalculateAdjustedAndSave() { throw new Error('adjustments offline'); },
    async synchronizeMasterRouteCalculations() { throw new Error('market offline'); },
    calculateMasterFreightAndDemurrage() { throw new Error('suggestions unavailable'); },
    executeBatchedCalculationsCore() {
      localBatchCalls += 1;
      return { breakEven: 321.5, totalCosts: 1000 };
    },
    evaluateReactiveSyncStatus() {},
    setMasterCalculationLoading() {},
    showToast(message, tone) { warnings.push({ message, tone }); },
    console: { warn() {}, error() {} }
  };

  vm.runInNewContext(`let isCalculatingMaster = false;\n${helperSource}\n${handlerSource}\nglobalThis.runMaster = handleMasterValidationAndCalculate;`, context);
  const result = await context.runMaster({ preventDefault() {} });

  assert.equal(localBatchCalls, 1);
  assert.equal(result.breakEven, 321.5);
  assert.equal(result.totalCosts, 1000);
  assert.equal(warnings.filter((entry) => entry.tone === 'warning').length, 3);
  assert.equal(warnings.at(-1).tone, 'success');
});

test('master calculation preserves the required sequential workflow', () => {
  const start = indexSource.indexOf('async function handleMasterValidationAndCalculate');
  const end = indexSource.indexOf('window.handleMasterValidationAndCalculate = handleMasterValidationAndCalculate;', start);
  const source = indexSource.slice(start, end);

  const validation = source.indexOf('await validarYCalcularSeccion2');
  const costsAndPdas = source.indexOf('await consultCurrentCostsAndPdasForMaster');
  const firstBunkerSafety = source.indexOf('ensureSafeBunkerPrices({ deferEngine: true })');
  const secondBunkerSafety = source.indexOf('ensureSafeBunkerPrices({ deferEngine: true })', firstBunkerSafety + 1);
  const adjustments = source.indexOf('() => recalculateAdjustedAndSave');
  const route = source.indexOf('() => synchronizeMasterRouteCalculations()');
  const freightAndDemurrage = source.indexOf('() => Promise.resolve(calculateMasterFreightAndDemurrage())');
  const localBatch = source.indexOf('const localCalculation = executeBatchedCalculationsCore()');

  assert.ok(validation >= 0);
  assert.ok(validation < firstBunkerSafety && firstBunkerSafety < costsAndPdas);
  assert.ok(costsAndPdas < secondBunkerSafety && secondBunkerSafety < adjustments);
  assert.ok(costsAndPdas < adjustments);
  assert.ok(adjustments < route);
  assert.ok(route < freightAndDemurrage);
  assert.ok(freightAndDemurrage < localBatch);
  assert.match(source, /try \{[\s\S]*SeaCharterStore\.batchAsync[\s\S]*\} catch \(error\) \{[\s\S]*finally \{/);
  assert.doesNotMatch(source, /useEffect\s*\(/);
});

test('step 4 triggers the Baltic Spot TCE handler for Handysize and larger vessels', async () => {
  for (const vessel of [
    { vesselDwt: 25000, centralizedClass: 'HANDYSIZE', categoryName: 'Handysize / Small Tanker' },
    { vesselDwt: 55000, centralizedClass: 'SUPRAMAX', categoryName: 'Supramax / MR' }
  ]) {
    const harness = createBranchHarness({
      ...vessel,
      pricingClass: { categoryName: vessel.categoryName, type: 'TCE Inverso' }
    });

    const branch = await harness.masterBranch.synchronizeMasterRouteCalculations();

    assert.equal(branch.mode, 'BALTIC_SPOT_TCE');
    assert.equal(harness.calls.balticSpot, 1);
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
    assert.equal(harness.calls.balticSpot, 0);
    assert.equal(harness.calls.inverseSync, 0);
    assert.equal(harness.calls.inverseCalculation, 0);
  }
});

test('Baltic Spot failures propagate to the master orchestrator', () => {
  assert.match(indexSource, /async function handleFetchBalticSpotTce\(options = \{\}\)/);
  assert.match(indexSource, /const managedByMaster = options\.managedByMaster === true/);
  assert.match(indexSource, /catch \(error\) \{[\s\S]*if \(managedByMaster\) throw error/);
});

test('master calculation batches store notifications across awaited work', () => {
  assert.match(indexSource, /async batchAsync\(fn\)[\s\S]*this\.isBatching = true;[\s\S]*return await fn\(\);[\s\S]*this\.flushBatch\(\)/);
  assert.match(indexSource, /flushBatch\(\)[\s\S]*if \(shouldNotify\) this\.notify\(\)/);
  assert.match(indexSource, /await SeaCharterStore\.batchAsync\(async \(\) => \{/);
  assert.match(indexSource, /\(\) => ensureRegionalBunkersForCalculation\(\)/);
  assert.match(indexSource, /\(\) => autoFillPDA\('pol', false, \{ deferEngine: true \}\)/);
  assert.match(indexSource, /\(\) => autoFillPDA\('pod', false, \{ deferEngine: true \}\)/);
});
