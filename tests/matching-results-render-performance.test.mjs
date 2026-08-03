import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const chunkRendererStart = indexSource.indexOf('const MATCHING_RESULTS_INITIAL_VISIBLE_COUNT');
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

test('matching results render progressively in observer-driven batches of fifteen', () => {
  assert.match(chunkRendererSource, /MATCHING_RESULTS_INITIAL_VISIBLE_COUNT = 15/);
  assert.match(chunkRendererSource, /MATCHING_RESULTS_BATCH_SIZE = 15/);
  assert.match(chunkRendererSource, /matchingResultsVisibleCount = MATCHING_RESULTS_INITIAL_VISIBLE_COUNT/);
  assert.match(chunkRendererSource, /requestAnimationFrame\(resolve\)/);
  assert.match(chunkRendererSource, /matches\.slice\(0, matchingResultsVisibleCount\)/);
  assert.match(chunkRendererSource, /sentinel\.dataset\.matchingResultsSentinel = 'true'/);
  assert.match(chunkRendererSource, /new IntersectionObserver/);
  assert.match(chunkRendererSource, /matchingResultsVisibleCount \+ MATCHING_RESULTS_BATCH_SIZE/);
  assert.match(chunkRendererSource, /matchingResultsObserver\?\.disconnect\(\)/);
  assert.match(chunkRendererSource, /container\.insertBefore\(template\.content, sentinel\)/);
  assert.match(executionSource, /await renderMatchingResultsInChunks\(resultsList, displayMatches/);
  assert.match(cachedRendererSource, /renderMatchingResultsInChunks\(resultsList, matches/);
});

test('read-only matching result arrays are shallow-frozen', () => {
  assert.match(executionSource, /const matches = deduplicatedMatches;[\s\S]*Object\.freeze\(matches\);/);
  assert.match(executionSource, /const strictTechnicalFilter = false;[\s\S]*const viableMatches = matches\.slice\(\);[\s\S]*Object\.freeze\(viableMatches\);/);
  assert.match(cachedRendererSource, /Object\.freeze\(Array\.isArray\(cachedMatches\) \? cachedMatches\.slice\(\) : \[\]\)/);
});

test('optimized rendering visually penalizes technically unsuitable vessel cards', () => {
  assert.match(executionSource, /class="matching-vessel-card border \$\{isComp \? 'border-slate-200 hover:border-indigo-300 bg-white shadow-sm cursor-pointer' : 'border-red-200 bg-red-50\/40 opacity-80 cursor-pointer'\} rounded-xl p-5 transition relative overflow-hidden"/);
});
