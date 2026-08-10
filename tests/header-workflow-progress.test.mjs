import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, progressSource, workflowStoreSource, trackingBridgeSource, trackingStoreSource, routeConfiguratorSource, dueDiligenceSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/header-workflow-progress.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/stores/workflow-progress-store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/TrackingAisStreamBridge.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/stores/tracking-store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/RouteConfigurator.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8'),
]);

test('header workflow progress keeps map completion and uses only operational milestones elsewhere', () => {
  assert.match(progressSource, /import \{ voyageStore \}/);
  assert.match(progressSource, /import \{ trackingStore \}/);
  assert.match(progressSource, /import \{ workflowProgressStore \}/);
  assert.match(progressSource, /draft\?\.pol\?\.name/);
  assert.match(progressSource, /draft\?\.pod\?\.name/);
  assert.match(progressSource, /draft\?\.laycan\?\.laydays/);
  assert.match(progressSource, /progress\?\.charterPartyGenerated === true/);
  assert.match(progressSource, /progress\?\.finalConditionsSet === true/);
  assert.match(progressSource, /tracking\?\.referenceValidated === true/);
  assert.match(progressSource, /progress\?\.dueDiligenceCompleted === true/);
  assert.match(progressSource, /progress\?\.radarSweepExecuted === true/);
  assert.match(progressSource, /progress\?\.contractAccepted === true/);
  assert.match(progressSource, /progress\?\.auditReportGenerated === true/);
  assert.doesNotMatch(progressSource, /riskScore|matchingVessels|contractDraft|resultsContent|contenedor-recomendaciones/);
  assert.doesNotMatch(progressSource, /updateFromCalculator|applyTrackingAudit|clearDraft|\.setState\s*\(/);
});

test('header workflow progress subscribes to stable slices without generic UI listeners', () => {
  assert.match(progressSource, /voyageStore\.subscribe\(selectDraftMapState, queueRender, shallowObjectEqual\)/);
  assert.match(progressSource, /trackingStore\.subscribe\(\(state\) => state\.referenceValidated, queueRender\)/);
  assert.match(progressSource, /workflowProgressStore\.subscribe\(selectWorkflowProgress, queueRender, shallowObjectEqual\)/);
  assert.match(progressSource, /SeaCharterStore\?\.subscribe\?\.\(selectCalculatorMapState, queueRender, shallowObjectEqual\)/);
  assert.doesNotMatch(progressSource, /document\.addEventListener\(['"](?:input|change)/);
  assert.doesNotMatch(progressSource, /MutationObserver/);
  assert.match(trackingBridgeSource, /useStore\(trackingStore/);
  assert.doesNotMatch(trackingBridgeSource, /document\.addEventListener\("tracking-live:(?:open|close)"/);
  assert.match(trackingStoreSource, /overlayOpen/);
  assert.match(trackingStoreSource, /referenceValidated: true/);
});

test('operational actions mark each wizard milestone only at its success point', () => {
  for (const action of [
    'markCharterPartyGenerated',
    'markFinalConditionsSet',
    'markDueDiligenceCompleted',
    'markRadarSweepExecuted',
    'markContractAccepted',
    'markAuditReportGenerated',
  ]) {
    assert.match(workflowStoreSource, new RegExp(`${action}:`));
  }
  assert.match(routeConfiguratorSource, /markCharterPartyGenerated\(savedReference\)/);
  assert.match(dueDiligenceSource, /HeaderWorkflowActions\?\.markDueDiligenceCompleted/);
  assert.match(indexSource, /markFinalConditionsSet/);
  assert.match(indexSource, /executeMatchingRadarSweep\?\.\(\{ trigger: 'user' \}\)/);
  assert.match(indexSource, /if \(userTriggered\) window\.HeaderWorkflowActions\?\.markRadarSweepExecuted/);
  assert.match(indexSource, /markContractAccepted/);
  assert.match(indexSource, /markAuditReportGenerated/);
  assert.match(indexSource, /if \(!silent\) \{[\s\S]*HeaderWorkflowActions\?\.resetProgress[\s\S]*TrackingStore\?\.getState\?\.\(\)\.reset/s);
  assert.match(trackingStoreSource, /window\.TrackingStore = trackingStore/);
});

test('header workflow progress covers every primary navigation module', () => {
  for (const moduleId of ['map', 'estimator', 'decisiones', 'tracking', 'ais', 'matching', 'gencon', 'auditor']) {
    assert.match(progressSource, new RegExp(`\\b${moduleId}:`));
  }
});

test('header workflow progress decorates desktop and mobile module buttons', () => {
  assert.match(indexSource, /src\/header-workflow-progress\.js/);
  assert.match(indexSource, /\.tab-btn\.is-workflow-complete/);
  assert.match(indexSource, /\.tools-dropdown-action\.is-workflow-complete/);
  assert.match(progressSource, /header \[data-module-id=/);
  assert.match(progressSource, /workflow-complete-indicator/);
  assert.match(progressSource, /aria-label', complete \? `\$\{baseLabel\} · completado`/);
});
