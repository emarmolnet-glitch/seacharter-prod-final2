import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexSource, progressSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/header-workflow-progress.js', import.meta.url), 'utf8'),
]);

test('header workflow progress validates the DraftVoyage without mutating it', () => {
  assert.match(progressSource, /import \{ voyageStore \}/);
  assert.match(progressSource, /draft\?\.pol\?\.name/);
  assert.match(progressSource, /draft\?\.pod\?\.name/);
  assert.match(progressSource, /draft\?\.laycan\?\.laydays/);
  assert.match(progressSource, /draft\?\.cargo\?\.quantityMt/);
  assert.match(progressSource, /draft\?\.ballastDistanceNm/);
  assert.match(progressSource, /draft\?\.vessel\?\.name \|\| draft\?\.vessel\?\.imo/);
  assert.match(progressSource, /voyageStore\.subscribe/);
  assert.doesNotMatch(progressSource, /updateFromCalculator|applyTrackingAudit|clearDraft|\.setState\s*\(/);
});

test('header workflow progress decorates desktop and mobile module buttons', () => {
  assert.match(indexSource, /src\/header-workflow-progress\.js/);
  assert.match(indexSource, /\.tab-btn\.is-workflow-complete/);
  assert.match(indexSource, /\.tools-dropdown-action\.is-workflow-complete/);
  assert.match(progressSource, /header \[data-module-id=/);
  assert.match(progressSource, /workflow-complete-indicator/);
  assert.match(progressSource, /aria-label', complete \? `\$\{baseLabel\} · completado`/);
});
