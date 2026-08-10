import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, progressSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/header-workflow-progress.js', import.meta.url), 'utf8'),
]);

test('header workflow progress validates the DraftVoyage without mutating it', () => {
  assert.match(progressSource, /import \{ voyageStore \}/);
  assert.match(progressSource, /import \{ trackingStore \}/);
  assert.match(progressSource, /draft\?\.pol\?\.name/);
  assert.match(progressSource, /draft\?\.pod\?\.name/);
  assert.match(progressSource, /draft\?\.laycan\?\.laydays/);
  assert.match(progressSource, /calculator\?\.breakEven/);
  assert.match(progressSource, /calculator\?\.freightRate/);
  assert.match(progressSource, /decisions\?\.riskAuditGenerated/);
  assert.match(progressSource, /tracking\?\.contractPayload/);
  assert.match(progressSource, /draft\?\.ballastDistanceNm/);
  assert.match(progressSource, /draft\?\.vessel\?\.name \|\| draft\?\.vessel\?\.imo/);
  assert.match(progressSource, /calculator\?\.stowageFactor/);
  assert.match(progressSource, /calculator\?\.requiredVolumeCbm/);
  assert.match(progressSource, /globalStore\?\.matchingVessels/);
  assert.match(progressSource, /matchingResults\?\.vessels/);
  assert.match(progressSource, /calculator\?\.contractDraft/);
  assert.match(progressSource, /workflow\?\.legalReportGenerated/);
  assert.match(progressSource, /calculator\?\.riskScore/);
  assert.match(progressSource, /voyageStore\.subscribe/);
  assert.match(progressSource, /trackingStore\.subscribe/);
  assert.match(progressSource, /SeaCharterStore\?\.subscribe/);
  assert.doesNotMatch(progressSource, /updateFromCalculator|applyTrackingAudit|clearDraft|\.setState\s*\(/);
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
