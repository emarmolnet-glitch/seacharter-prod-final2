import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const storeSource = await readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8');
const draftEntrySource = await readFile(new URL('../src/voyage-draft-entry.js', import.meta.url), 'utf8');

test('runEngine implements re-entrancy lock to prevent recursive calculation loops', () => {
  assert.match(indexSource, /let isRunningEngine = false;/);
  assert.match(indexSource, /function runEngine\(\) \{[\s\S]*if \(isRunningEngine\) return;[\s\S]*isRunningEngine = true;[\s\S]*try \{/);
  assert.match(indexSource, /\} finally \{[\s\S]*isRunningEngine = false;[\s\S]*\}/);
});

test('voyageStore updateFromCalculator and actions guard with JSON equality check to prevent recursive draft mutations', () => {
  assert.match(storeSource, /updateFromCalculator:\s*\(state = \{\}\) => set\(\(current\) => \{/);
  assert.match(storeSource, /if \(JSON\.stringify\(currentComparable\) === JSON\.stringify\(nextComparable\)\) \{\s*return current;\s*\}/);
  assert.match(storeSource, /applyNlpScenario:\s*\(scenario = \{\}\) => set\(\(current\) => \{/);
  assert.match(storeSource, /if \(JSON\.stringify\(currentComparable\) === JSON\.stringify\(nextComparable\)\) \{\s*return current;\s*\}/);
});

test('setAisMatchingState guards with equality check before mutating state and notifying listeners', () => {
  assert.match(indexSource, /setAisMatchingState\(nearbyVessels, compatibleVessels, proximityDebug = null, metadata = \{\}\) \{/);
  assert.match(indexSource, /JSON\.stringify\(this\.nearbyVessels \|\| \[\]\) === JSON\.stringify\(nextNearby\)/);
  assert.match(indexSource, /JSON\.stringify\(this\.compatibleVessels \|\| \[\]\) === JSON\.stringify\(nextCompatible\)/);
  assert.match(indexSource, /JSON\.stringify\(this\.aisMatchingProximityDebug\) === JSON\.stringify\(proximityDebug\)/);
});

test('calculateAndDisplayAisFreight prevents redundant AIS_MARKET_RATES_UPDATED dispatch', () => {
  assert.match(indexSource, /if \(window\.aisMarketFreightRates && JSON\.stringify\(window\.aisMarketFreightRates\) === JSON\.stringify\(aisMarketFreightRates\)\) \{\s*return;\s*\}/);
});

test('voyage-draft-entry decouples visual input hydration from event dispatching', () => {
  assert.match(draftEntrySource, /function setValue\(id, value, dispatchEvents = false\)/);
  assert.match(draftEntrySource, /function setSelectValue\(id, value, dispatchEvents = false\)/);
  assert.match(draftEntrySource, /if \(String\(input\.value\) === nextVal\) return;/);
  assert.match(draftEntrySource, /if \(dispatchEvents\) \{/);
});

test('hydrateCalculatorFromDraft validates store state before writing to SeaCharterStore', () => {
  assert.match(draftEntrySource, /const stateMatches = \(/);
  assert.match(draftEntrySource, /JSON\.stringify\(currentState\.projectCargo\) === JSON\.stringify\(pc\)/);
  assert.match(draftEntrySource, /if \(!stateMatches\) \{/);
  assert.match(draftEntrySource, /JSON\.stringify\(state\.draft\) !== JSON\.stringify\(previousState\?\.draft\)/);
});

test('form inputs check current state before invoking store mutation and runEngine', () => {
  assert.match(indexSource, /id="project-unit-weight"[^>]*if \(\(State\.pesoUnitario \?\? State\.unitWeightMT\) !== v\)/);
  assert.match(indexSource, /id="project-length"[^>]*if \(\(State\.largo \?\? State\.length\) !== v\)/);
  assert.match(indexSource, /id="project-width"[^>]*if \(\(State\.ancho \?\? State\.width\) !== v\)/);
  assert.match(indexSource, /id="project-height"[^>]*if \(\(State\.alto \?\? State\.height\) !== v\)/);
  assert.match(indexSource, /id="project-handling-mode"[^>]*if \(\(State\.handlingMode \?\? State\.projectHandlingMode\) !== this\.value\)/);
});
