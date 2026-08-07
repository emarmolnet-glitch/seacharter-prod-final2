import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const preflightStart = source.indexOf('function getCachedMatchingResultsForPreflight()');
const preflightEnd = source.indexOf('// --- AISLAMIENTO STRICTO DE TABS ---', preflightStart);
const preflightSource = source.slice(preflightStart, preflightEnd);

test('density map preflight falls back to the persistent global fleet without HTTP', () => {
  assert.ok(preflightStart >= 0 && preflightEnd > preflightStart);
  assert.match(preflightSource, /const localMatches = Array\.isArray\(window\.matchingResultsState\?\.vessels\)/);
  assert.match(preflightSource, /const globalMatches = Array\.isArray\(window\.GlobalStore\?\.matchingVessels\)/);
  assert.match(preflightSource, /const validatedMatches = localMatches\.length > 0 \? localMatches : globalMatches/);
  assert.doesNotMatch(preflightSource, /executionCache\.compatibleVessels|executionCache\.nearbyVessels/);
  assert.doesNotMatch(preflightSource, /fetch\s*\(/);
  assert.match(preflightSource, /return \{ hydrated, count: cachedMatches\.length, requested: false \}/);
});

test('density map mount validates cached matches after local map initialization', () => {
  const switchStart = source.indexOf('function switchTab(tabId)');
  const switchEnd = source.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = source.slice(switchStart, switchEnd);
  assert.match(switchSource, /renderDensitySnapshotFromGlobalStore/);
  assert.doesNotMatch(switchSource, /runDensityMapPreflightChecklist|calculateAndDisplayAisFreight|fetch\s*\(/);
  assert.match(source, /function renderDensitySnapshotFromGlobalStore\(\)[\s\S]*renderDensityVesselsTable\?\.\(matchingVessels\)/);
});

test('preflight exits when the classified fleet already contains the cached cards', () => {
  assert.match(preflightSource, /querySelector\('\[data-matching-result-card="true"\], \[data-matching-cache-card="true"\]'\)/);
  assert.match(preflightSource, /const alreadyHydrated = cachedCount > 0[\s\S]*Boolean\(renderedResultCard\)/);
  assert.match(preflightSource, /syncMatchingButtonWithCachedResults\(cachedCount\);[\s\S]*if \(alreadyHydrated\) return true;[\s\S]*if \(cachedCount === 0\) return false;/);
});

test('cached matches hydrate the table, badge, button and shared state', () => {
  assert.match(preflightSource, /data-matching-cache-card="true"/);
  assert.match(preflightSource, /resultsList\.dataset\.matchingResultCount = String\(cachedCount\)/);
  assert.match(preflightSource, /resultsList\.dataset\.matchingHydrated = 'true'/);
  assert.match(preflightSource, /resultsBadge\.innerText = `\$\{cachedCount\} Buque/);
  assert.match(preflightSource, /button\.dataset\.matchingResultCount = String\(count\)/);
  assert.match(preflightSource, /window\.GlobalStore\.setMatchingFleet\?\.\(renderedMatches,[\s\S]*source: 'matching-ui'[\s\S]*origin: 'matching-cache'/);
  assert.match(preflightSource, /window\.GlobalStore\.compatibleVessels = renderedMatches\.filter/);
  assert.match(preflightSource, /window\.lastClassifiedVessels = renderedMatches\.map/);
});

test('live matching cache refreshes the active density map without a new request', () => {
  assert.match(source, /console\.info\('\[AIS Matching\] Buques Cercanos en POL', proximityDebug\);[\s\S]*densityMapView\?\.classList\.contains\('active-block'\)[\s\S]*runDensityMapPreflightChecklist\(\)/);
  assert.match(source, /class="matching-vessel-card[^\n]*data-matching-result-card="true"/);
  assert.match(source, /currentDistanceToLoadPort: ais\.currentDistanceToLoadPort \?\? source\.distanceToPol \?\? source\.distance_to_pol_nm \?\? source\.distance_to_pol \?\? source\.currentDistanceToLoadPort/);
});
