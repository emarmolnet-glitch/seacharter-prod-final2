import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, assistantSource, evaluatorSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/basic-risk-evaluator.js', import.meta.url), 'utf8'),
]);
const evaluatorModuleUrl = `data:text/javascript;base64,${Buffer.from(evaluatorSource).toString('base64')}`;
const { evaluateBasicRisks } = await import(evaluatorModuleUrl);

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
  assert.match(assistantSource, /PROACTIVE_RISK_MESSAGE/);
  assert.match(assistantSource, /aiAlertsStore\.resetAlerts\(\)/);
  assert.match(assistantSource, /evaluateBasicRisks\(context\)/);
});
