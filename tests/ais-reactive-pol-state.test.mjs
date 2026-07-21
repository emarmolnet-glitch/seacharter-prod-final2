import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const routeSyncStart = source.indexOf('function syncSelectedRoutePort(role, portName)');
const routeSyncEnd = source.indexOf('window.normalizeRoutePortCoordinates', routeSyncStart);
const routeSyncSource = source.slice(routeSyncStart, routeSyncEnd);
const matchingStart = source.indexOf('function calculateAndDisplayAisFreight()');
const matchingEnd = source.indexOf('// Search the list of detected vessels', matchingStart);
const matchingSource = source.slice(matchingStart, matchingEnd);
const operationalPortStart = source.indexOf("function getAisOperationalPort(role = 'POL')");
const operationalPortEnd = source.indexOf('window.getAuditAisEndpoint', operationalPortStart);
const operationalPortSource = source.slice(operationalPortStart, operationalPortEnd);

test('nearby badge is initialized and rendered from reactive matching count', () => {
  assert.match(source, /id="ais-nearby-vessels-badge"[^>]*>0 buques<\/span>/);
  assert.match(source, /nearbyCount: 0,[\s\S]*nearbyVessels: \[\],[\s\S]*compatibleVessels: \[\]/);
  assert.match(matchingSource, /window\.GlobalStore\.setAisMatchingState\(nearbyVessels, compatibleVessels, proximityDebug\)/);
  assert.match(matchingSource, /Number\.isFinite\(Number\(window\.GlobalStore\?\.nearbyCount\)\)/);
  assert.match(matchingSource, /badgeEl\.innerText = `\$\{reactiveNearbyCount\} buque/);
});

test('POL selection mutates route coordinates and clears stale nearby state', () => {
  assert.ok(routeSyncStart >= 0 && routeSyncEnd > routeSyncStart);
  assert.match(routeSyncSource, /SeaCharterStore\.set\(nextState\)/);
  assert.match(routeSyncSource, /window\.GlobalStore\[coordinateKey\] = coordinates/);
  assert.match(routeSyncSource, /window\.coreProMatchingRouteContext = \{/);
  assert.match(routeSyncSource, /window\.GlobalStore\.setAisMatchingState\(\[\], \[\], \{ nearbyCount: 0, polCoordinates: coordinates \}\)/);
  assert.match(source, /syncSelectedRoutePort\?\.\(portInputId === 'port-pod' \? 'POD' : 'POL', portInputEl\.value\)/);
});

test('density map and AIS sweep endpoint consume reactive POL coordinates', () => {
  assert.match(operationalPortSource, /window\.GlobalStore\?\.\[coordinateKey\]/);
  assert.match(operationalPortSource, /const routeState = SeaCharterStore\.getState\(\)/);
  assert.match(operationalPortSource, /routeState\?\.\[coordinateKey\]/);
  assert.match(source, /const pol = getAisOperationalPort\('POL'\);[\s\S]*polLat: String\(pol\.lat\),[\s\S]*polLon: String\(pol\.lon\),[\s\S]*boxes: JSON\.stringify\(\[box\]\)/);
  assert.match(source, /window\.renderAisProspectionRadii\(\{ fit: false \}\)/);
  assert.match(source, /window\.startAisClientEngine\(window\.mapaAIS \|\| window\.mapAIS \|\| window\.aisMap \|\| window\.map\)/);
});
