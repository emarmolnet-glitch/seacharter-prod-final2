import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bridgeUrl = new URL('../public/aisstream-draft.js', import.meta.url);
const bridgeSource = readFileSync(bridgeUrl, 'utf8');

const globalStoreStart = indexSource.indexOf('const GlobalStore = {');
const globalStoreEnd = indexSource.indexOf('window.GlobalStore = GlobalStore;', globalStoreStart);
const globalStoreSource = indexSource.slice(globalStoreStart, globalStoreEnd);
const matchingAuditStart = indexSource.indexOf('// Map all ranked Core PRO results to the audit structure for Data Bridge.');
const matchingAuditEnd = indexSource.indexOf("window.dispatchEvent(new CustomEvent('MATCHING_EXECUTION_SUCCESS'", matchingAuditStart);
const matchingAuditSource = indexSource.slice(matchingAuditStart, matchingAuditEnd);

test('aisstream draft loads from a real public JavaScript asset', () => {
  assert.equal(existsSync(bridgeUrl), true);
  assert.match(indexSource, /<script defer src="\/aisstream-draft\.js"><\/script>/);
  assert.doesNotMatch(indexSource, /src="\.\/aisstream-draft\.js"/);
  assert.doesNotMatch(bridgeSource.trimStart(), /^</);
  assert.match(bridgeSource, /global\.AisStreamDraft = bridge/);
  assert.match(bridgeSource, /loader\.startPersistentAisStream/);
});

test('nearby badge is updated directly by the matching store count', () => {
  assert.match(indexSource, /function renderAisNearbyCount\(nearbyCount = window\.GlobalStore\?\.nearbyCount \|\| 0\)/);
  assert.match(globalStoreSource, /this\.nearbyCount = this\.nearbyVessels\.length/);
  assert.match(globalStoreSource, /renderAisNearbyCount\(this\.nearbyCount\)/);
});

test('vessels rendered in AIS tables populate the global audit array', () => {
  assert.match(globalStoreSource, /renderedAisVessels: \[\],[\s\S]*auditVessels: \[\]/);
  assert.match(globalStoreSource, /setRenderedAisVessels\(vessels, metadata = \{\}\)/);
  assert.match(globalStoreSource, /this\.auditVessels = this\.renderedAisVessels[\s\S]*normalizeRenderedAisVesselForAudit/);
  assert.match(indexSource, /setRenderedAisVessels\(primaryVisibleVessels, \{ source: 'density-table' \}\)/);
  assert.match(indexSource, /setRenderedAisVessels\(aisVesselsData, \{ source: 'central-ais-table' \}\)/);
  assert.match(indexSource, /setRenderedAisVessels\(listaNormalizada, \{ source: 'radar-store' \}\)/);
});

test('Core PRO audit payload is derived from the exact vessels rendered in matching', () => {
  assert.match(indexSource, /function getDataBridgeTransmissionVessels\(\)[\s\S]*window\.renderedMatchingVessels/);
  assert.match(indexSource, /const displayMatches = setRenderedMatchingVessels\(viableMatches, \{ source: 'matching-execution' \}\)/);
  assert.match(matchingAuditSource, /const arrayDeBuquesEncontrados = displayMatches\.map/);
  assert.doesNotMatch(matchingAuditSource, /renderedAuditVessels|GlobalStore\?\.auditVessels/);
  assert.match(indexSource, /const renderedVessels = getDataBridgeTransmissionVessels\(\);[\s\S]*const vesselsToSend = JSON\.parse\(JSON\.stringify\(renderedVessels\)\)/);
});
