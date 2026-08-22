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

test('universal autocomplete searches Datalastic through the secure Netlify proxy', () => {
  const cascadeStart = autocompleteSource.indexOf('async function runUniversalPortSearch(input)');
  const cascadeEnd = autocompleteSource.indexOf('function handlePortAutocomplete(event)', cascadeStart);
  const cascadeSource = autocompleteSource.slice(cascadeStart, cascadeEnd);
  assert.match(cascadeSource, /fetch\(`\/api\/v1\/ports\/search\?q=/);
  assert.match(cascadeSource, /source: 'Datalastic'/);
  assert.match(autocompleteSource, /function prioritizeDatalasticPortResults\(ports = \[\]\)/);
  assert.match(autocompleteSource, /commercialPorts\.length \? commercialPorts : validPorts/);
  assert.match(cascadeSource, /prioritizeDatalasticPortResults\(payload\?\.ports\)/);
  assert.match(cascadeSource, /ensureWpiEngineeringCatalog\(\)/);
  assert.match(cascadeSource, /resolveWpiEngineeringRecord\(port\)/);
  assert.match(cascadeSource, /maxOperationalDraftMeters: engineering\?\.maxOperationalDraftMeters \|\| 0/);
  assert.doesNotMatch(cascadeSource, /port\.maxOperationalDraftMeters/);
  assert.match(cascadeSource, /Sin coincidencias en Datalastic/);
  assert.doesNotMatch(cascadeSource, /Nominatim|openstreetmap\.org/i);
});


test('WPI engineering metadata loads once and missing values resolve to static N/A', () => {
  assert.match(autocompleteSource, /let wpiEngineeringCatalogPromise = null/);
  assert.match(autocompleteSource, /fetch\('\/WPI\.csv', \{ cache: 'force-cache' \}\)/);
  assert.match(autocompleteSource, /maxVesselLengthLabel: engineering\?\.maxVesselLengthLabel \|\| 'N\/A'/);
  assert.match(autocompleteSource, /engineeringSource: engineering \? 'WPI' : 'N\/A'/);
  assert.match(autocompleteSource, /input\.dataset\.selectedPortEngineeringSource = engineeringSource/);
  assert.match(autocompleteSource, /function toPortTitleCase\(value\)/);
});

test('programmatic WPI injection types, searches, and clicks the first rendered option', () => {
  const selectorStart = autocompleteSource.indexOf('async function selectFirstWpiAutocompleteMatch(inputOrId, value)');
  const selectorEnd = autocompleteSource.indexOf('function handlePortAutocomplete(event)', selectorStart);
  const selectorSource = autocompleteSource.slice(selectorStart, selectorEnd);
  assert.ok(selectorStart >= 0, 'missing programmatic WPI selector');
  assert.match(selectorSource, /input\.value = query/);
  assert.match(selectorSource, /input\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(selectorSource, /await runUniversalPortSearch\(input\)/);
  assert.match(selectorSource, /querySelector\('\.port-autocomplete-option'\)/);
  assert.match(selectorSource, /firstOption\.click\(\)/);
  assert.match(autocompleteSource, /window\.selectFirstWpiAutocompleteMatch = selectFirstWpiAutocompleteMatch/);
});

test('Datalastic searches are debounced without external request controllers', () => {
  const handlerStart = autocompleteSource.indexOf('function handlePortAutocomplete(event)');
  const handlerEnd = autocompleteSource.indexOf('function bindUniversalPortAutocomplete(input)', handlerStart);
  const handlerSource = autocompleteSource.slice(handlerStart, handlerEnd);
  assert.match(autocompleteSource, /const DATALASTIC_SEARCH_DEBOUNCE_MS = 300;/);
  assert.match(handlerSource, /clearTimeout\(portAutocompleteTimers\.get\(input\)\)/);
  assert.doesNotMatch(autocompleteSource, /AbortController|NOMINATIM_/);
  assert.match(handlerSource, /setPortSearchState\(input, true\);[\s\S]*setTimeout\(\(\) => runUniversalPortSearch\(input\), DATALASTIC_SEARCH_DEBOUNCE_MS\)/);
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
  assert.match(autocompleteSource, /portAutocompleteTimers\.delete\(input\)/);
  assert.match(autocompleteSource, /commitUniversalPortCoordinates\(input, result\)[\s\S]*setPortSearchState\(input, false\)[\s\S]*return true/);
  assert.match(autocompleteSource, /input\.dataset\.selectedPortDraft = selectedPortDraft > 0 \? String\(selectedPortDraft\) : '0'/);
  assert.match(autocompleteSource, /input\.dataset\.selectedPortLabel === input\.value[\s\S]*setPortSearchState\(input, false\)/);
  assert.match(geocoderSource, /fetch\(`\/api\/v1\/ports\/search\?q=/);
  assert.match(geocoderSource, /commitUniversalPortCoordinates\(targetInput, result\)/);
  assert.match(geocoderSource, /return \{ lat: result\.lat, lon: result\.lon, name: result\.label, countryCode: result\.countryCode \}/);
});
