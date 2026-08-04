import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('account preferences initialization is non-blocking and promise-deduplicated', () => {
  assert.match(indexSource, /let accountUserPreferencesPromise = null/);
  assert.match(indexSource, /if \(accountUserPreferencesPromise\) return accountUserPreferencesPromise/);
  assert.match(indexSource, /accountUserPreferencesPromise = \(async \(\) => \{/);
  assert.match(indexSource, /void loadAccountUserPreferences\(\)/);
});

test('COA profiles initialize once and saves update the local snapshot', () => {
  assert.match(indexSource, /let coaClientProfilesPromise = null/);
  assert.match(indexSource, /if \(coaClientProfilesPromise\) return coaClientProfilesPromise/);
  assert.match(indexSource, /void loadCoaClientProfiles\(\)/);
  assert.match(indexSource, /const savedProfile = normalizeCoaProfile\(result\.profile \|\| payload\)/);
  assert.doesNotMatch(indexSource, /await loadCoaClientProfiles\(\)/);
});
