import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('matching taxonomy state accepts the Cargo compatibility selection', () => {
  assert.match(source, /MATCHING_TAXONOMY_SELECTION_STORAGE_KEY = 'taxonomy_selection'/);
  assert.match(source, /if \(selection === true\) selection = 'category:cargo'/);
  assert.match(source, /cargo: 'category:cargo'/);
  assert.match(source, /window\.sessionStorage\?\.getItem\(MATCHING_TAXONOMY_SELECTION_STORAGE_KEY\)/);
  assert.match(source, /window\.localStorage\?\.getItem\(MATCHING_TAXONOMY_SELECTION_STORAGE_KEY\)/);
});

test('matching validation refreshes committed taxonomy state before checking fields', () => {
  const validationStart = source.indexOf('function getMatchingExecutionValidation');
  const validationEnd = source.indexOf('window.getMatchingExecutionValidation = getMatchingExecutionValidation;', validationStart);
  const validationSource = source.slice(validationStart, validationEnd);

  assert.match(validationSource, /window\.refreshMatchingTaxonomySelectionState\(\{ force: true \}\)/);
  assert.ok(
    validationSource.indexOf('window.refreshMatchingTaxonomySelectionState({ force: true })')
      < validationSource.indexOf("missingFields.push({ key: 'taxonomy'"),
  );
});

test('saving density-map taxonomy notifies and unlocks the matching engine immediately', () => {
  assert.match(source, /window\.GlobalTaxonomyProvider\?\.set\(values, \{/);
  assert.match(source, /persistMatchingTaxonomySelection\(values\)/);
  assert.match(source, /new CustomEvent\('TAXONOMY_SELECTION_SAVED'/);
  assert.match(source, /taxonomy_selection: true/);
  assert.match(source, /window\.addEventListener\('TAXONOMY_SELECTION_SAVED', handleMatchingTaxonomySelectionSaved\)/);
  assert.match(source, /handleMatchingTaxonomySelectionSaved[\s\S]*syncMatchingButtonWithCachedResults\(currentResultCount\)/);
  assert.match(source, /handleMatchingTaxonomySelectionSaved[\s\S]*window\.renderMatchingExecutionValidation\(\)/);
});

test('matching button reads refreshed taxonomy state instead of requiring another sweep', () => {
  const syncStart = source.indexOf('function syncMatchingButtonWithCachedResults');
  const syncEnd = source.indexOf('function handleReadyForMatching', syncStart);
  const syncSource = source.slice(syncStart, syncEnd);

  assert.match(syncSource, /refreshMatchingTaxonomySelectionState\(\{ syncControl: false \}\)/);
  assert.match(syncSource, /button\.disabled = matchingSelectionPending \|\| \(!hasMatchingRequest && count === 0 && !hasLocalTaxonomyQuery\)/);
});
