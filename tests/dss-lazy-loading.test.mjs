import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, decisionSupportModuleSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/DecisionSupportModule.js', import.meta.url), 'utf8'),
]);

test('Decisiones is downloaded only when its tab is activated', () => {
  assert.match(indexSource, /window\.loadDecisionSupportModule = \(\) => import\('\.\/src\/DecisionSupportModule\.js'\)/);
  assert.match(indexSource, /if \(tabId === 'decisiones'\) \{\s*ensureDecisionSupportModule\(targetView\);/);
  assert.doesNotMatch(indexSource, /<script[^>]+src="\.\/src\/DecisionSupportModule\.js"/);
  assert.doesNotMatch(indexSource, /id="card-laycan"/);
  assert.match(decisionSupportModuleSource, /id="card-laycan"/);
  assert.match(decisionSupportModuleSource, /id="val-portdays-total"/);
  assert.match(decisionSupportModuleSource, /id="badge-financial-status"/);
});

test('Decisiones keeps the existing state synchronization entry point', () => {
  assert.match(decisionSupportModuleSource, /typeof window\.syncDecisionesFromCalculator === "function"/);
  assert.match(decisionSupportModuleSource, /window\.syncDecisionesFromCalculator\(\)/);
  assert.doesNotMatch(decisionSupportModuleSource, /VoyageDraftStore\.(setState|subscribe)/);
});
