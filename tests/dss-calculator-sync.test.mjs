import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('1. Calculator unifies active voyage state on calculation and populates window.activeVoyage', async () => {
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify State unification in runEngine
  assert.match(indexSource, /State\.cargoQty\s*=\s*cargo;/);
  assert.match(indexSource, /State\.distLaden\s*=\s*distLaden;/);
  assert.match(indexSource, /State\.seaDays\s*=\s*T_sea;/);
  assert.match(indexSource, /State\.portDays\s*=\s*T_port;/);

  // Verify window.activeVoyage populated
  assert.match(indexSource, /window\.activeVoyage\s*=\s*activeVoyagePayload;/);
  assert.match(indexSource, /window\.State\.activeVoyage\s*=\s*activeVoyagePayload;/);

  // Verify dispatch of voyageCalculated event
  assert.match(indexSource, /window\.dispatchEvent\(new CustomEvent\('voyageCalculated', \{ detail: activeVoyagePayload \}\)\)/);
});

test('2. Decisiones tab switches and synchronizes state automatically avoiding empty state if calculation exists', async () => {
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify switchTab('decisiones') invokes syncDecisionesFromCalculator()
  assert.match(indexSource, /if \(tabId === 'decisiones'\) \{[\s\S]*ensureDecisionSupportModule\(targetView\);[\s\S]*window\.syncDecisionesFromCalculator\(\);/);

  // Verify syncDecisionesFromCalculator reads from window.activeVoyage or State or SeaCharterStore
  assert.match(indexSource, /const activeVoyageSource = \(typeof window !== 'undefined' && window\.activeVoyage\) \? window\.activeVoyage : \{\};/);
  assert.match(indexSource, /const voyageData = \{ \.\.\.globalState, \.\.\.storeData, \.\.\.activeVoyageSource \};/);
});

test('3. DecisionSupportModule registers voyageCalculated event listener for real-time reactivity', async () => {
  const dssSource = await readFile(new URL('../src/DecisionSupportModule.js', import.meta.url), 'utf8');

  assert.match(dssSource, /window\.addEventListener\(["']voyageCalculated["']/);
  assert.match(dssSource, /window\.syncDecisionesFromCalculator/);
});
