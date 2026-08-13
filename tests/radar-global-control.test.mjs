import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('RadarGlobalControl mounts the reusable control in matching', () => {
  assert.equal((source.match(/data-radar-global-control/g) || []).length >= 1, true);
  assert.match(source, /data-radar-global-control data-radar-context="matching"/);
  assert.match(source, /document\.querySelectorAll\('\[data-radar-global-control\]'\)/);
  assert.doesNotMatch(source, /id="btn-freeze-radar"/);
});

test('RadarGlobalControl publishes one shared state through GlobalStore and session storage', () => {
  const componentStart = source.indexOf('window.RadarGlobalControl = (() => {');
  const componentEnd = source.indexOf('window.startRadarLive = async function', componentStart);
  const componentSource = source.slice(componentStart, componentEnd);
  assert.match(source, /radarState: null/);
  assert.match(componentSource, /window\.GlobalStore\.radarState = \{ \.\.\.state \}/);
  assert.match(componentSource, /window\.sessionStorage\.setItem\(RADAR_GLOBAL_STATE_STORAGE_KEY/);
  assert.match(componentSource, /new CustomEvent\('RADAR_GLOBAL_STATE_CHANGED'/);
  assert.match(componentSource, /button\.setAttribute\('aria-pressed', String\(state\.mode === 'live'\)\)/);
});

test('global radar preserves the requested LIVE, FROZEN, and LOADING visual language', () => {
  assert.match(source, /data-radar-state="live"[\s\S]*background: #10b981/);
  assert.match(source, /data-radar-state="loading"[\s\S]*background: #0284c7/);
  assert.match(source, /radar-global-control__button[\s\S]*background: #475569/);
  assert.match(source, /Radar: LIVE/);
  assert.match(source, /Radar: FROZEN/);
});

test('matching radar executes a POL-scoped sweep without requiring a full calculation', () => {
  const componentStart = source.indexOf('window.RadarGlobalControl = (() => {');
  const componentEnd = source.indexOf('window.startRadarLive = async function', componentStart);
  const componentSource = source.slice(componentStart, componentEnd);
  assert.match(componentSource, /EJECUTAR BARRIDO RADAR/);
  assert.match(componentSource, /Escaneando zona\.\.\./);
  assert.match(componentSource, /window\.getMatchingRadarPolContext\?\.\(\)\.valid === true/);
  assert.match(componentSource, /context === 'matching'[\s\S]*window\.executeMatchingRadarSweep\?\.\(\{ trigger: 'user' \}\)/);
  assert.match(componentSource, /fetchMatchingRequestFromGlobalStore/);
  assert.doesNotMatch(componentSource, /requiresMatchingRoute && !window\.requireActiveMatchingRoute/);
  assert.match(componentSource, /window\.startRadarLive\(\{ source: `\$\{source\}-global-control`, refresh: true, matchingRequest \}\)/);
});

test('matching radar runs predictive destination matching beside radial sources', () => {
  assert.match(source, /const \[openShipsVessels, predictiveResult\] = await Promise\.all/);
  assert.match(source, /const aisVessels = \[\]/);
  assert.match(source, /requestMatchingLocal\?\.\('execute', \[\], predictivePayload\)/);
  assert.match(source, /predictiveVessels/);
  assert.match(source, /\.\.\.polScopedAisVessels, \.\.\.openShipsVessels, \.\.\.predictiveVessels/);
});

test('matching radar binds the taxonomy selector to GlobalStore and every source payload', () => {
  assert.match(source, /window\.GlobalStore\.selectedTaxonomies = normalizedValues\.slice\(\)/);
  assert.match(source, /selectedTaxonomies: selectedTaxonomies\.slice\(\)/);
  assert.match(source, /taxonomyMode: 'strict'/);
  assert.match(source, /window\.startRadarLive\(\{ source: 'matching-radar-sweep', refresh: true, radarContext, selectedTaxonomies, polContext \}\)/);
  assert.match(source, /window\.updateOpenShipsRadar\(\{[\s\S]*selectedTaxonomies/);
  assert.match(source, /params\.set\('taxonomies', JSON\.stringify\(selectedTaxonomies\)\)/);
});

test('matching radar enforces the strict cargo interceptor before rendering or storing results', () => {
  const interceptorStart = source.indexOf('function applyStrictRadarTaxonomyFilter');
  const interceptorEnd = source.indexOf('function renderRadarTaxonomyFilterFeedback', interceptorStart);
  const interceptorSource = source.slice(interceptorStart, interceptorEnd);
  assert.match(source, /'tanker', 'chemical', 'oil', 'dredger', 'passenger', 'ferry'/);
  assert.match(source, /'vehicles carrier', 'vehicle carrier', 'ro ro', 'roro', 'container ship'/);
  assert.match(interceptorSource, /selectedTaxonomies\.length === 1 && selectedTaxonomies\[0\] === 'category:cargo'/);
  assert.match(source, /const taxonomyFilter = applyStrictRadarTaxonomyFilter\(enrichedCandidates, response\.selectedTaxonomies\)/);
  assert.match(source, /const taxonomyFilter = shouldApplyTaxonomyFilter && typeof window\.applyStrictRadarTaxonomyFilter === 'function'[\s\S]*window\.GlobalStore\?\.setMatchingFleet/);
  assert.match(source, /const strictTechnicalFilterActive = window\.matchingStrictTechnicalFilter === true/);
  assert.match(source, /metadata\.applyTaxonomyFilter !== false \|\| strictTechnicalFilterActive/);
  assert.match(source, /taxonomyCompatibleVessels\.filter\(vessel => vessel\?\.audit\?\.operationallyEligible !== false\)/);
  assert.match(source, /if \(match\?\.audit\?\.operationallyEligible === false\) return false/);
  assert.match(source, /function getDensityReactiveVessels\(\)[\s\S]*window\.matchingStrictTechnicalFilter !== true[\s\S]*applyStrictRadarTaxonomyFilter\(matchingVessels\)/);
  assert.match(source, /source: taxonomyRejectedAll \? 'taxonomy-filter' : 'matching-ui'/);
  assert.match(source, /source === 'taxonomy-filter'/);
});

test('strict technical empty state explains cargo and vessel-class rejection', () => {
  assert.match(source, /0 buques compatibles con el Filtro Técnico Estricto/);
  assert.match(source, /su clase o capacidad no coincide con la carga activa/);
  assert.match(source, /if \(renderedCount === 0\)/);
});

test('matching radar reports taxonomy exclusions in the shared integrity banner', () => {
  assert.match(source, /buques descartados por incompatibilidad de taxonomía \(Filtro Activo:/);
  assert.match(source, /console\.log\(`\[Radar Taxonomía\] \$\{message\}`\)/);
  assert.match(source, /window\.renderRadarTaxonomyFilterFeedback\?\.\(taxonomyFilter\)/);
});

test('leaving the radar map freezes LIVE mode and cleans up the on-demand transport', () => {
  const switchStart = source.indexOf('function switchTab(tabId)');
  const switchEnd = source.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = source.slice(switchStart, switchEnd);
  assert.doesNotMatch(switchSource, /RadarGlobalControl|freeze\?\.|deactivateDataBridgeLiveTracking|syncDataBridgeRadarTransport/);
  assert.match(switchSource, /classList\.toggle\('hidden', !isActiveView\)/);
});
