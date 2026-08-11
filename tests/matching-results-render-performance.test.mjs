import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const chunkRendererStart = indexSource.indexOf('const MATCHING_RESULTS_PAGE_SIZE');
const chunkRendererEnd = indexSource.indexOf('async function toggleMatchingAuditMode', chunkRendererStart);
const chunkRendererSource = indexSource.slice(chunkRendererStart, chunkRendererEnd);

const executionStart = indexSource.indexOf('async function executeMatchingEngine');
const executionEnd = indexSource.indexOf('function getMatchingExecutionRouteOverride', executionStart);
const executionSource = indexSource.slice(executionStart, executionEnd);

const cachedRendererStart = indexSource.indexOf('function renderCachedMatchingResults');
const cachedRendererEnd = indexSource.indexOf('function runDensityMapPreflightChecklist', cachedRendererStart);
const cachedRendererSource = indexSource.slice(cachedRendererStart, cachedRendererEnd);

test('matching feedback uses a vessel-shaped Tailwind skeleton immediately', () => {
  assert.match(indexSource, /id="matching-loading-state"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(indexSource, /matching-vessel-skeleton[^\n]*animate-pulse/);
  assert.match(executionSource, /resultsList\.classList\.add\('hidden'\);[\s\S]*loadingState\.classList\.remove\('hidden'\);/);
});

test('matching results render the complete filtered array without silent truncation', () => {
  assert.match(chunkRendererSource, /requestAnimationFrame\(resolve\)/);
  assert.match(chunkRendererSource, /matches\.forEach\(\(match, index\) =>/);
  assert.match(chunkRendererSource, /container\.appendChild\(template\.content\)/);
  assert.doesNotMatch(chunkRendererSource, /matches\.slice\(/);
  assert.doesNotMatch(chunkRendererSource, /IntersectionObserver/);
  assert.match(executionSource, /await renderMatchingResultsInChunks\(resultsList, displayMatches/);
  assert.match(executionSource, /applyTaxonomyFilter: false/);
  assert.match(executionSource, /viableMatches\.length - renderedCount/);
  assert.match(cachedRendererSource, /renderMatchingResultsInChunks\(resultsList, matches/);
  assert.match(indexSource, /id="matching-results-list"[^>]*max-h-\[70vh\][^>]*overflow-y-auto/);
});

test('read-only matching result arrays are shallow-frozen', () => {
  assert.match(executionSource, /const matches = deduplicatedMatches;[\s\S]*Object\.freeze\(matches\);/);
  assert.match(executionSource, /const strictTechnicalFilter = window\.matchingStrictTechnicalFilter === true;[\s\S]*const viableMatches = matches[\s\S]*Object\.freeze\(viableMatches\);/);
  assert.match(cachedRendererSource, /Object\.freeze\(Array\.isArray\(cachedMatches\) \? cachedMatches\.slice\(\) : \[\]\)/);
});

test('optimized rendering visually penalizes technically unsuitable vessel cards', () => {
  assert.match(executionSource, /isDwtUnknown \? 'opacity-65' : 'opacity-80'/);
});
