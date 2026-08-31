import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Density Dashboard UI includes POD backhaul opportunities card and badge', () => {
  assert.match(indexHtml, /id="ais-pod-backhaul-badge"/, 'Density dashboard must contain ais-pod-backhaul-badge');
  assert.match(indexHtml, /id="ais-pod-backhaul-list"/, 'Density dashboard must contain ais-pod-backhaul-list');
  assert.match(indexHtml, /Oportunidades Backhaul \(POD 10 NM\)/, 'Density dashboard must have Backhaul section title');
});

test('fetchPortCongestionShield runs strict 10 NM sweep for POL and POD and feeds Density Dashboard', () => {
  assert.match(indexHtml, /async function fetchPortCongestionShield/, 'fetchPortCongestionShield exists');
  assert.match(indexHtml, /\/api\/radar\/live\?lat=\$\{pLat\}&lon=\$\{pLon\}&radius=10/, 'queries POL with 10 NM radius');
  assert.match(indexHtml, /\/api\/radar\/live\?lat=\$\{dLat\}&lon=\$\{dLon\}&radius=10/, 'queries POD with 10 NM radius');
  assert.match(indexHtml, /isBackhaul:\s*true/, 'tags POD vessels with isBackhaul true');
  assert.match(indexHtml, /window\.renderPodBackhaulOpportunities/, 'invokes renderPodBackhaulOpportunities');
  assert.match(indexHtml, /window\.calculateAndDisplayAisFreight/, 'invokes calculateAndDisplayAisFreight');
});

test('RadarPOL and RadarPOD perform 10 NM AIS radar sweeps and ejecutarRadarDualAIS combines both', () => {
  assert.match(indexHtml, /window\.RadarPOL\s*=\s*function\(radiusNm\s*=\s*10\)/, 'RadarPOL defaults to 10 NM');
  assert.match(indexHtml, /window\.RadarPOD\s*=\s*function\(radiusNm\s*=\s*10\)/, 'RadarPOD defaults to 10 NM');
  assert.match(indexHtml, /const \[polVessels, podVessels\] = await Promise\.all\(\[\s*window\.RadarPOL\(10\),\s*window\.RadarPOD\(10\)\s*\]\)/, 'ejecutarRadarDualAIS sweeps both POL and POD');
  assert.match(indexHtml, /const vessels = \[\.\.\.\(polVessels \|\| \[\]\), \.\.\.\(podVessels \|\| \[\]\)\]/, 'combines POL and POD vessels');
});

test('Density module is decoupled from restrictive cargo filters and displays all detected vessels', () => {
  assert.match(indexHtml, /let compatibleVessels = nearbyVessels\.slice\(\);/, 'market vessels includes all nearby vessels without restriction');
  assert.match(indexHtml, /const totalLocalSupply = nearbyVessels\.length \+ podBackhaulCandidates\.length;/, 'calculates global market supply from all detected vessels');
});

test('calculateAndDisplayAisFreight dynamically updates fair freight tiers based on total local market supply and POD backhaul', () => {
  assert.match(indexHtml, /let supplyFactor = 1\.0;/, 'uses dynamic supplyFactor');
  assert.match(indexHtml, /supplyFactor = 1\.15;/, 'tight market supply factor');
  assert.match(indexHtml, /supplyFactor = 0\.90;/, 'high supply market factor');
  assert.match(indexHtml, /document\.getElementById\('ais-rate-fair'\)/, 'updates fair freight rate');
  assert.match(indexHtml, /document\.getElementById\('ais-rate-standard'\)/, 'updates standard freight rate');
  assert.match(indexHtml, /document\.getElementById\('ais-rate-offmarket'\)/, 'updates off-market freight rate');
});

test('Supply coefficient and competition status are recalculated from real radar vessels without cargo filtering', () => {
  assert.match(indexHtml, /const baseline = 15;/, 'uses baseline for supply coefficient');
  assert.match(indexHtml, /coefficient = Math\.max\(0\.70, Math\.min\(1\.30, coefficient\)\);/, 'bounds coefficient between 0.70 and 1.30');
  assert.match(indexHtml, /supplyCoefficientEl\.innerText = coefficient\.toFixed\(2\);/, 'updates supply coefficient UI');
  assert.match(indexHtml, /statusEl\.innerText = "Mercado Tenso \(Poca Oferta\)";/, 'updates tight market competition status');
  assert.match(indexHtml, /statusEl\.innerText = "Mercado Balanceado";/, 'updates balanced market competition status');
  assert.match(indexHtml, /statusEl\.innerText = "Mercado Saturado \(Alta Oferta\)";/, 'updates saturated market competition status');
});

test('renderDensityVesselsTable renders distinct origin badges for POL and POD Backhaul', () => {
  assert.match(indexHtml, /data-density-origin="pod-backhaul"/, 'POD Backhaul badge exists');
  assert.match(indexHtml, /POD · Backhaul/, 'POD Backhaul text rendered');
  assert.match(indexHtml, /POL \(10 NM\)/, 'POL 10 NM origin badge rendered');
});

test('Density table position and distance badges have high contrast bold white text on solid backgrounds', () => {
  assert.match(indexHtml, /density-coords-badge/, 'Coordinates badge class exists');
  assert.match(indexHtml, /data-density-origin="pod-backhaul"[^>]*text-white/, 'POD Backhaul badge has text-white');
  assert.match(indexHtml, /data-density-origin="global-inbound"[^>]*text-white/, 'Inbound to POL badge has text-white');
  assert.match(indexHtml, /data-density-origin="local-radius"[^>]*text-white/, 'Local radius badge has text-white');
  assert.match(indexHtml, /#view-ais #ais-vessels-tbody \[data-density-origin\][\s\S]*color:\s*#ffffff !important;\s*font-weight:\s*700 !important;/, 'CSS guarantees #ffffff and font-weight 700 for density origin badges');
  assert.match(indexHtml, /#view-ais #ais-vessels-tbody \.density-coords-badge[\s\S]*color:\s*#ffffff !important;\s*font-weight:\s*700 !important;/, 'CSS guarantees #ffffff and font-weight 700 for coordinates badge');
});
