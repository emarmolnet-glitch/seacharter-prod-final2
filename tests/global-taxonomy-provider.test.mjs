import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('global taxonomy provider owns persistence independently from the density map', () => {
  const providerStart = source.indexOf('window.GlobalTaxonomyProvider = {');
  const providerEnd = source.indexOf('function refreshMatchingTaxonomySelectionState', providerStart);
  const providerSource = source.slice(providerStart, providerEnd);

  assert.ok(providerStart >= 0);
  assert.match(providerSource, /GLOBAL_TAXONOMY_FALLBACK/);
  assert.match(providerSource, /readStoredMatchingTaxonomySelection\(\)/);
  assert.match(providerSource, /persistMatchingTaxonomySelection\(values\)/);
  assert.match(providerSource, /new CustomEvent\('GLOBAL_TAXONOMY_CHANGED'/);
  assert.match(providerSource, /new CustomEvent\('TAXONOMY_SELECTION_SAVED'/);
  assert.match(providerSource, /commitMatchingSelection\(persistedValues, filteredVessels\)/);
});

test('matching engine exposes and initializes its own taxonomy selector', () => {
  assert.match(source, /id="matching-global-taxonomy-select"/);
  assert.match(source, /id="matching-global-taxonomy-status"/);
  assert.match(source, /source: 'matching-engine-selector'/);
  assert.match(source, /window\.initializeMatchingGlobalTaxonomyControl\?\.\(\)/);
  assert.match(source, /window\.GlobalTaxonomyProvider\?\.ensure\(\{ notify: true, source: 'matching-tab-entry' \}\)/);
});

test('matching validation obtains taxonomy from the provider before blocking execution', () => {
  const refreshStart = source.indexOf('function refreshMatchingTaxonomySelectionState');
  const refreshEnd = source.indexOf('window.refreshMatchingTaxonomySelectionState = refreshMatchingTaxonomySelectionState;', refreshStart);
  const refreshSource = source.slice(refreshStart, refreshEnd);

  assert.match(refreshSource, /window\.GlobalTaxonomyProvider\.ensure\(/);
  assert.ok(refreshSource.indexOf('window.GlobalTaxonomyProvider.ensure(') < refreshSource.indexOf('if (values.length === 0) return []'));
});

test('density-map save delegates the canonical state update to the global provider', () => {
  assert.match(source, /window\.GlobalTaxonomyProvider\?\.set\(values, \{[\s\S]*?source: 'density-map-save'/);
  assert.doesNotMatch(source, /setSelectedFleetTaxonomies\(\[\], \{ dispatch: false, persist: false \}\)/);
});
