import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const inputIds = [
  'port-ballast', 'port-pol', 'port-pod',
  'map-port-ballast', 'map-port-pol', 'map-port-pod'
];

const autocompleteStart = source.indexOf('const UNIVERSAL_PORT_INPUT_IDS = [');
const autocompleteEnd = source.indexOf('let toastDismissTimer = null;', autocompleteStart);
const autocompleteSource = source.slice(autocompleteStart, autocompleteEnd);
const geocoderStart = source.indexOf('async function getCoordinates(query)');
const geocoderEnd = source.indexOf('function haversine(', geocoderStart);
const geocoderSource = source.slice(geocoderStart, geocoderEnd);

test('geographic inputs allow natural text and spaces without per-keystroke route calculations', () => {
  inputIds.forEach((id) => {
    const inputMatch = source.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
    assert.ok(inputMatch, `missing ${id}`);
    assert.doesNotMatch(inputMatch[0], /\slist=/);
    assert.doesNotMatch(inputMatch[0], /\spattern=/);
    assert.doesNotMatch(inputMatch[0], /oninput=/);
    assert.match(inputMatch[0], /autocomplete="off"/);
    assert.match(inputMatch[0], /inputmode="text"/);
  });
  assert.doesNotMatch(autocompleteSource, /event\.key === ['"] ['"]/);
  assert.match(autocompleteSource, /input\.addEventListener\('input', handlePortAutocomplete\)/);
  assert.match(autocompleteSource, /event\.type === 'input'[\s\S]*clearUniversalPortCoordinates\(input\)/);
});

test('universal autocomplete searches WPI before Nominatim', () => {
  const cascadeStart = autocompleteSource.indexOf('async function runUniversalPortSearch(input)');
  const cascadeEnd = autocompleteSource.indexOf('function handlePortAutocomplete(event)', cascadeStart);
  const cascadeSource = autocompleteSource.slice(cascadeStart, cascadeEnd);
  assert.match(autocompleteSource, /function searchLocalWpiPorts\(query, limit = 12\)/);
  assert.match(cascadeSource, /const localResults = searchLocalWpiPorts\(query\);[\s\S]*if \(localResults\.length > 0\) \{[\s\S]*renderPortAutocomplete\(input, localResults\);[\s\S]*return;/);
  assert.ok(cascadeSource.indexOf('const localResults = searchLocalWpiPorts(query);') < cascadeSource.indexOf('searchNominatimPortSuggestions(query'));
});

test('Nominatim request includes address details and renders uppercase two-letter country codes', () => {
  assert.match(autocompleteSource, /NOMINATIM_SEARCH_ENDPOINT = 'https:\/\/nominatim\.openstreetmap\.org\/search'/);
  assert.match(autocompleteSource, /format: 'json',[\s\S]*addressdetails: '1',[\s\S]*limit: String\(limit\)/);
  assert.match(autocompleteSource, /item\?\.address\?\.country_code \|\| ''\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(autocompleteSource, /!\/\^\[A-Z\]\{2\}\$\/\.test\(countryCode\)/);
  assert.match(autocompleteSource, /label: `\$\{placeName\} \(\$\{countryCode\}\)`/);
});

test('Nominatim searches are debounced and cancel stale work', () => {
  const handlerStart = autocompleteSource.indexOf('function handlePortAutocomplete(event)');
  const handlerEnd = autocompleteSource.indexOf('function bindUniversalPortAutocomplete(input)', handlerStart);
  const handlerSource = autocompleteSource.slice(handlerStart, handlerEnd);
  assert.match(autocompleteSource, /const NOMINATIM_DEBOUNCE_MS = 700;/);
  assert.match(handlerSource, /clearTimeout\(portAutocompleteTimers\.get\(input\)\)/);
  assert.match(handlerSource, /portAutocompleteControllers\.get\(input\)\?\.abort\(\)/);
  assert.match(handlerSource, /setPortSearchState\(input, true\);[\s\S]*setTimeout\(\(\) => runUniversalPortSearch\(input\), NOMINATIM_DEBOUNCE_MS\)/);
  assert.doesNotMatch(handlerSource, /setTimeout\([^,]+,\s*450\)/);
});

test('geographic autocomplete exposes reactive loading state and visual feedback', () => {
  assert.match(autocompleteSource, /const portSearchStates = new WeakMap\(\)/);
  assert.match(autocompleteSource, /window\.geographicSearchState = window\.geographicSearchState \|\| \{\}/);
  assert.match(autocompleteSource, /function setPortSearchState\(input, isSearching, message = 'Buscando ubicación\.\.\.'\)/);
  assert.match(autocompleteSource, /window\.dispatchEvent\(new CustomEvent\('port:search-state-changed'/);
  assert.match(autocompleteSource, /loadingStatus\.className = 'port-search-loading'/);
  assert.match(autocompleteSource, /spinner\.className = 'port-search-spinner'/);
  assert.match(autocompleteSource, /loadingText\.textContent = 'Buscando ubicación\.\.\.'/);
  assert.match(source, /\.port-search-loading\[hidden\] \{ display: none; \}/);
  assert.match(source, /@keyframes port-search-spin/);
});

test('AIS matching declares cargoType before rendering estimator actions', () => {
  const matchingStart = source.indexOf('async function executeMatchingEngine(');
  const matchingEnd = source.indexOf('function getMatchingExecutionRouteOverride(', matchingStart);
  const matchingSource = source.slice(matchingStart, matchingEnd);
  const declarationIndex = matchingSource.indexOf('const cargoType = cargoTypeId || String(');
  const usageIndex = matchingSource.indexOf("'${cargoType}'");
  assert.ok(declarationIndex >= 0, 'cargoType declaration is missing');
  assert.ok(usageIndex > declarationIndex, 'cargoType must be declared before rendering matching actions');
  assert.match(matchingSource, /matchingRequest\?\.cargo\?\.cargoCode[\s\S]*window\.SeaCharterStore\?\.getState\?\.\(\)\?\.cargoTypeCode[\s\S]*\|\| '100'/);
});

test('selected suggestions inject parsed coordinates into route and global state', () => {
  assert.match(autocompleteSource, /const lat = parseFloat\(result\?\.lat\)/);
  assert.match(autocompleteSource, /const lon = parseFloat\(result\?\.lon\)/);
  assert.match(autocompleteSource, /portBallastCoordinates: coordinates/);
  assert.match(autocompleteSource, /window\.GlobalStore\.portBallastCoordinates = coordinates/);
  assert.match(autocompleteSource, /window\.syncSelectedRoutePort\?\.\(role, label\)/);
  assert.match(autocompleteSource, /window\.GlobalStore\[coordinateKey\] = null/);
  assert.match(autocompleteSource, /lat: parseFloat\(input\.dataset\.selectedLatitude\)/);
  assert.match(autocompleteSource, /lon: parseFloat\(input\.dataset\.selectedLongitude\)/);
  assert.match(geocoderSource, /searchNominatimPortSuggestions\(query, \{ limit: 1 \}\)/);
  assert.match(geocoderSource, /return \{ lat, lon, name: result\.label, countryCode: result\.countryCode \}/);
});
