import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const aiFilterSource = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');
const localMatchingSource = readFileSync(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8');
const vesselsMasterSource = readFileSync(new URL('../db/vessels-master.ts', import.meta.url), 'utf8');
const frozenReportSource = readFileSync(new URL('../netlify/functions/core-pro-frozen-report.ts', import.meta.url), 'utf8');

test('matching response arrays map directly into component state', () => {
  assert.match(indexSource, /payload\.data,[\s\S]*payload\.matches,[\s\S]*payload\.vessels,[\s\S]*payload\.results/);
  assert.match(indexSource, /const responseMatches = resultCandidates\.find\(Array\.isArray\) \|\| \[\]/);
  assert.match(indexSource, /window\.matchingResultsState = \{[\s\S]*vessels: matches,[\s\S]*count: matches\.length/);
  assert.match(indexSource, /resultsBadge\.innerText = `\$\{matches\.length\} Buque/);
});

test('classified fleet remains local after visual validation', () => {
  const stateIndex = indexSource.indexOf('window.matchingResultsState =');
  const badgeIndex = indexSource.indexOf('resultsBadge.innerText = `${matches.length}', stateIndex);
  const completionIndex = indexSource.indexOf("new CustomEvent('MATCHING_EXECUTION_SUCCESS'", stateIndex);
  assert.ok(stateIndex >= 0 && badgeIndex > stateIndex && completionIndex > badgeIndex);
  assert.match(indexSource, /Validación local completada para \$\{arrayDeBuquesEncontrados\.length\} buques desde vessels_master/);
  assert.doesNotMatch(indexSource.slice(stateIndex, completionIndex), /syncCoreProMatchingReport\(|fetch\('/);
  assert.doesNotMatch(indexSource, /const aisSearchInput = document\.getElementById\('ais-vessel-search'\)/);
});

test('matching server imports database and scoring modules without an HTTP scoring hop', () => {
  assert.match(indexSource, /requestMatchingLocal\('execute', \[\], payload\)/);
  assert.doesNotMatch(indexSource, /requestAiAisFilter|AI_AIS_FILTER_ENDPOINT|AI_AIS_FILTER_COMPATIBILITY_ENDPOINT/);
  assert.match(localMatchingSource, /from "\.\.\/\.\.\/db\/vessels-master\.js"/);
  assert.match(localMatchingSource, /import runAiAisFilter from "\.\/ai-ais-filter\.js"/);
  assert.match(vesselsMasterSource, /FROM vessels_master/);
  assert.match(aiFilterSource, /path: \["\/api\/ai-ais-filter", "\/\.netlify\/functions\/ai-ais-filter"\]/);
  assert.match(frozenReportSource, /path: \["\/api\/core-pro-frozen-report", "\/\.netlify\/functions\/core-pro-frozen-report"\]/);
});
