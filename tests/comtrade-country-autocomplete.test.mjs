import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [countriesSource, comboboxSource, radarSource, indexSource] = await Promise.all([
  readFile(new URL('../src/data/unCountries.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/CountryCombobox.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ComtradeCompetitivenessRadar.ts', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

test('UN country catalogue includes complete bilingual ISO and M49 coverage', () => {
  const countryEntries = countriesSource.match(/\{ name: '.+?', iso2: '[A-Z]{2}', iso3: '[A-Z]{3}', m49: \d+ \}/g) || [];
  assert.ok(countryEntries.length >= 200);
  assert.match(countriesSource, /name: 'Argelia \/ Algeria', iso2: 'DZ', iso3: 'DZA', m49: 12/);
  assert.match(countriesSource, /name: 'España \/ Spain', iso2: 'ES', iso3: 'ESP', m49: 724/);
  assert.match(countriesSource, /name: 'Portugal \/ Portugal', iso2: 'PT', iso3: 'PRT', m49: 620/);
});

test('country combobox provides live filtering and keyboard selection', () => {
  assert.match(comboboxSource, /findCountries\(query/);
  assert.match(comboboxSource, /event\.key === 'ArrowDown'/);
  assert.match(comboboxSource, /event\.key === 'ArrowUp'/);
  assert.match(comboboxSource, /event\.key === 'Enter'/);
  assert.match(comboboxSource, /role', 'option'/);
  assert.match(radarSource, /role="combobox"/);
  assert.match(radarSource, /focus:ring-2 focus:ring-cyan-500/);
});

test('Comtrade countries synchronize from route state without changing freight calculation', () => {
  assert.match(radarSource, /originCountry/);
  assert.match(radarSource, /destinationCountry/);
  assert.match(radarSource, /findUnCountry/);
  assert.match(radarSource, /polIso/);
  assert.match(radarSource, /podIso/);
  assert.match(radarSource, /SEA_ROUTE_DEFINED/);
  assert.match(indexSource, /polIso: result\.coordinates\?\.pol\?\.countryCode/);
  assert.match(indexSource, /podIso: result\.coordinates\?\.pod\?\.countryCode/);
  assert.doesNotMatch(comboboxSource, /freight-sell|runEngine\s*\(/);
});
