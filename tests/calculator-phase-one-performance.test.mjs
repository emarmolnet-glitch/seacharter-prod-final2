import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function sliceFunction(name, nextMarker) {
  const start = indexSource.indexOf(`function ${name}`);
  const end = indexSource.indexOf(nextMarker, start);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${name} must have an end marker`);
  return indexSource.slice(start, end);
}

test('calculator batch runs the main engine once and commits the store once', () => {
  const source = sliceFunction('executeBatchedCalculationsCore', 'window.scheduleDebouncedCalculation');
  assert.equal((source.match(/runEngine\(/g) || []).length, 1);
  assert.equal((source.match(/SeaCharterStore\.set\(/g) || []).length, 1);
  assert.match(source, /recalcularDiasPuerto\(null, \{ deferEngine: true \}\)/);
  assert.match(source, /runEngine\(\{ deferStoreCommit: true \}\)/);
  assert.match(source, /syncCalculatorAndMatching\('calculator', \{ force: true, deferStoreCommit: true \}\)/);

  const readInputs = source.indexOf('readValidatedCargoOperationState');
  const portDays = source.indexOf('recalcularDiasPuerto');
  const engine = source.indexOf("runEngine({ deferStoreCommit: true })");
  const costs = source.indexOf('calculateCostPlusFreight');
  const tce = source.indexOf('calculateInverseTce');
  const cbam = source.indexOf('updateCBAMModuleView');
  const storeCommit = source.indexOf('SeaCharterStore.set(calculatorCommit');
  const domCommit = source.indexOf("syncCalculatorAndMatching('calculator'");
  assert.ok(readInputs < portDays && portDays < engine && engine < costs && costs < tce && tce < cbam && cbam < storeCommit && storeCommit < domCommit);
});

test('calculator batch exposes performance marks and a duration measure', () => {
  const source = sliceFunction('executeBatchedCalculationsCore', 'window.scheduleDebouncedCalculation');
  assert.match(source, /mark\?\.\('calculator-batch-start'\)/);
  assert.match(source, /mark\?\.\('calculator-batch-end'\)/);
  assert.match(source, /measure\?\.\('calculator-batch-duration'/);
  assert.match(source, /clearMeasures\?\.\('calculator-batch-duration'\)/);
});

test('port-day recalculation supports deferred engine execution', () => {
  const source = sliceFunction('recalcularDiasPuerto', "if (typeof window !== 'undefined') {");
  assert.match(source, /const deferEngine = options\.deferEngine === true/);
  assert.match(source, /actualizarModuloCamionTolva\(\{ rerun: !deferEngine \}\)/);
  assert.match(source, /if \(!deferEngine && typeof runEngine === 'function'\)/);
  assert.match(source, /return result/);
});

test('global store avoids deep serialization and suppresses redundant canonical events', () => {
  const storeStart = indexSource.indexOf('const SeaCharterStore = {');
  const storeEnd = indexSource.indexOf('window.SeaCharterStore = SeaCharterStore;', storeStart);
  const storeSource = indexSource.slice(storeStart, storeEnd);
  const globalParamsSource = sliceFunction('updateGlobalVoyageParams', 'window.updateGlobalVoyageParams');

  assert.doesNotMatch(storeSource, /JSON\.stringify/);
  assert.match(storeSource, /hasShallowStoreChanges\(partial, this\.committedState\)/);
  assert.match(storeSource, /changedEntries/);
  assert.match(storeSource, /if \(!changed\) return false/);
  assert.match(storeSource, /updateGlobalVoyageParams\(this\.pendingVoyageParamsPartial/);
  assert.match(globalParamsSource, /canonicalChanged && metadata\.dispatch !== false/);
  assert.match(indexSource, /window\.__coreProVoyageParams = buildCanonicalVoyageParams\(State, State\)/);
});
