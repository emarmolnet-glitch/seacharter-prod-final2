import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, assistantSource, evaluatorSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/basic-risk-evaluator.js', import.meta.url), 'utf8'),
]);
const universalEvaluatorSource = await readFile(new URL('../src/universal-module-suggestions.js', import.meta.url), 'utf8');
const evaluatorModuleUrl = `data:text/javascript;base64,${Buffer.from(evaluatorSource).toString('base64')}`;
const { evaluateBasicRisks } = await import(evaluatorModuleUrl);
const universalEvaluatorModuleUrl = `data:text/javascript;base64,${Buffer.from(universalEvaluatorSource).toString('base64')}`;
const { evaluateModuleSuggestions } = await import(universalEvaluatorModuleUrl);

test('basic risk evaluator counts each business risk category once', () => {
  const result = evaluateBasicRisks({
    pol: 'Arzew, Algeria (DZ)',
    pod: 'Alexandria, Egypt (EG)',
    loadRate: 1_500,
    dischargeRate: 1_200,
    role: 'charterer',
    loadTerms: 'SHINC',
    dischargeTerms: 'SHEX',
  });

  assert.equal(result.alerts, 3);
  assert.deepEqual(result.risks, {
    geopolitical: true,
    operational: true,
    financial: true,
  });
});

test('basic risk evaluator ignores empty rates and safe contexts', () => {
  const result = evaluateBasicRisks({
    pol: 'Rotterdam, Netherlands (NL)',
    pod: 'Houston, United States (US)',
    loadRate: null,
    dischargeRate: '',
    role: 'owner',
    loadTerms: 'SHEX',
    dischargeTerms: 'SHEX UU',
  });

  assert.equal(result.alerts, 0);
});

test('assistant alert integration stays local and uses the required triggers', () => {
  assert.match(indexSource, /class="sea-assistant-alert-badge" hidden/);
  assert.match(indexSource, /window\.SeaAssistantAlerts\?\.evaluateCurrentContext\?\.\(\)/);
  assert.match(indexSource, /if \(tabId === 'estimator'\)/);
  assert.match(assistantSource, /let aiAlerts = 0/);
  assert.match(assistantSource, /function createProactiveGreeting\(moduleName\)/);
  assert.match(assistantSource, /¡Hola! Veo que estás trabajando en la sección de \$\{moduleName\}/);
  assert.match(assistantSource, /aiAlertsStore\.resetAlerts\(\)/);
  assert.match(assistantSource, /evaluateBasicRisks\(context\)/);
  assert.match(assistantSource, /function monitorActiveModule\(aiAlertsStore, statusElement\)/);
  assert.match(assistantSource, /new MutationObserver/);
  assert.match(assistantSource, /document\.addEventListener\("tracking-live:open"/);
});

test('universal suggestions cover every primary SeaCharter module', () => {
  const modules = ['map', 'estimator', 'decisiones', 'tracking', 'ais', 'matching', 'gencon', 'auditor'];
  modules.forEach((moduleId) => {
    const result = evaluateModuleSuggestions(moduleId, {});
    assert.ok(result.alerts > 0, `${moduleId} should identify incomplete data`);
    assert.ok(result.issues.length > 0, `${moduleId} should return actionable issues`);
  });
});

test('completed module contexts clear proactive alerts', () => {
  assert.equal(evaluateModuleSuggestions('map', {
    pol: 'Algeciras',
    pod: 'Genoa',
    distanceNm: 900,
    laycanStart: '2026-08-20',
    laycanEnd: '2026-08-25',
  }).alerts, 0);

  assert.equal(evaluateModuleSuggestions('tracking', {
    pol: 'Algeciras',
    pod: 'Genoa',
    distanceNm: 900,
    hasVessel: true,
    positionUpdatedAt: '2026-08-18T12:00:00Z',
  }).alerts, 0);
});
