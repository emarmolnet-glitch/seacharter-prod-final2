import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mapLoaderSource = await readFile(new URL('../map_loader.js', import.meta.url), 'utf8');
const mapViewSource = await readFile(new URL('../map_view.js', import.meta.url), 'utf8');
const auditFunctionSource = await readFile(new URL('../netlify/functions/audit-vessels.ts', import.meta.url), 'utf8');
const filterFunctionSource = await readFile(new URL('../netlify/functions/vessels-filter.ts', import.meta.url), 'utf8');
const getVesselsFunctionSource = await readFile(new URL('../netlify/functions/get-vessels.ts', import.meta.url), 'utf8');

test('density map loads validated vessels through the read-only endpoint', () => {
  assert.match(indexSource, /getAuditAisEndpoint/);
  assert.match(indexSource, /fetch\(endpoint,[\s\S]*?method: 'GET'/);
  assert.match(indexSource, /loadValidatedAisDensityVessels/);
  assert.match(indexSource, /audit-database-readonly/);
});

test('density map restores globally filtered vessels without refetching', () => {
  const tabInitialization = indexSource.slice(indexSource.indexOf("if(tabId === 'ais')"), indexSource.indexOf("} else if (typeof destroyAisMap"));
  assert.doesNotMatch(tabInitialization, /resetAisDensityResults\(\)/);
  assert.match(tabInitialization, /getFilteredVessels\(\)/);
  assert.match(tabInitialization, /updateAisMarkers\(persistedFilteredVessels\)/);
  assert.doesNotMatch(tabInitialization, /loadValidatedAisDensityVessels\(\)/);
});

test('density map disables live capture and pending polling on open', () => {
  assert.match(indexSource, /window\.aisDensityReadOnly = openingReadOnlyDensityMap/);
  assert.match(indexSource, /window\.MapLoader\.stopAisProxyPolling\(\)/);
  assert.match(indexSource, /reason: 'density-map-read-only'/);
});

test('map loader defaults to the audit read endpoint', () => {
  assert.match(mapLoaderSource, /endpoint: '\/api\/audit-vessels'/);
  assert.doesNotMatch(mapLoaderSource, /endpoint: '\/\.netlify\/functions\/get-vessels\?force=1'/);
});

test('audit endpoint performs only a validated SELECT', () => {
  assert.match(auditFunctionSource, /FROM ais_vessels[\s\S]*audit_status = \$9/);
  assert.match(auditFunctionSource, /distance_nm <= \$8/);
  assert.doesNotMatch(auditFunctionSource, /\.insert\(|\.update\(|\.delete\(/);
});

test('audit endpoint returns the database error message for diagnostics', () => {
  assert.match(auditFunctionSource, /const errorMessage = getErrorMessage\(error\)/);
  assert.match(auditFunctionSource, /error: errorMessage/);
});

test('read-only refresh button performs a GET instead of blocking the click', () => {
  assert.match(indexSource, /if \(window\.aisDensityReadOnly \|\| window\.matchingAuditModeState\?\.enabled\) \{[\s\S]*?return window\.executeReadOnlyAisRefresh\(\)/);
  assert.match(indexSource, /loadValidatedAisDensityVessels\(\{[\s\S]*?throwOnError: true,[\s\S]*?selectedTaxonomy[\s\S]*?\}\)/);
  assert.doesNotMatch(indexSource, /Mapa de Densidad está bloqueado en modo de solo lectura/);
  assert.doesNotMatch(indexSource, /querySelectorAll\('#btn-refresh-ais, #btn-search-closest-vessels, #btn-freeze-radar'\)/);
});

test('read-only response feeds rendering, counters, and freight calculation', () => {
  assert.match(indexSource, /const validatedVessels = Array\.isArray\(payload\.vessels\) \? payload\.vessels : \[\]/);
  assert.match(indexSource, /dispatchEvent\(new CustomEvent\('ais:vessels-updated'/);
  assert.match(indexSource, /aisDensityCount\.innerText = primaryVisibleVessels\.length/);
  assert.match(indexSource, /calculateAndDisplayAisFreight\(\)/);
});

test('vessel filter decodes text and uses a parameterized ILIKE query', () => {
  assert.match(filterFunctionSource, /decodeURIComponent\(/);
  assert.match(filterFunctionSource, /vessel_type ILIKE '%' \|\| \$9 \|\| '%'/);
  assert.match(filterFunctionSource, /distance_nm <= \$8/);
  assert.match(filterFunctionSource, /path: "\/api\/vessels-filter"/);
  assert.doesNotMatch(filterFunctionSource, /INSERT|UPDATE|DELETE/);
});

test('selected taxonomy is only loaded after an explicit read action', () => {
  assert.match(indexSource, /getAuditAisEndpoint\(selectedTaxonomy\)/);
  assert.match(indexSource, /executeReadOnlyAisRefresh/);
});

test('All Cargo uses the general audit endpoint as an explicit reset', () => {
  assert.match(indexSource, /normalizedType !== 'All Cargo'/);
  assert.match(indexSource, /return `\/api\/audit-vessels\?\$\{params\.toString\(\)\}`/);
});

test('Core PRO sends POL coordinates and a bounded radius to AIS endpoints', () => {
  assert.match(indexSource, /polLat: String\(pol\.lat\)/);
  assert.match(indexSource, /polLon: String\(pol\.lon\)/);
  assert.match(indexSource, /radiusNm: String\(AIS_PROSPECTION_RADII_NM\.POL\)/);
  assert.match(indexSource, /POL: 1000/);
});

test('Core PRO renders no AIS fleet without a valid loading port', () => {
  assert.match(indexSource, /const hasLoadingPort =[\s\S]*?getAisOperationalPort\('POL'\)/);
  assert.match(indexSource, /const renderableVessels = \(hasLoadingPort[\s\S]*?: \[\]\)/);
});

test('filtered AIS state is global and drives WebGL redraws', () => {
  assert.match(indexSource, /filteredVessels: \[\]/);
  assert.match(indexSource, /setFilteredVessels\(newFilteredVessels/);
  assert.match(indexSource, /ais:filtered-vessels-updated/);
  assert.match(mapViewSource, /ais:filtered-vessels-updated/);
  assert.match(mapViewSource, /updateVessels\(vessels, 'density'\)/);
});

test('taxonomy changes reapply filters without clearing the global fleet', () => {
  const filterHandler = indexSource.slice(indexSource.indexOf("document.getElementById('fleet-intel-vessel-type')?.addEventListener('change'"), indexSource.indexOf("['cargo-type'", indexSource.indexOf("document.getElementById('fleet-intel-vessel-type')?.addEventListener('change'")));
  assert.match(filterHandler, /reapplyCentralFiltersAndRedraw\(\)/);
  assert.match(filterHandler, /getFilteredVessels\(\)/);
  assert.doesNotMatch(filterHandler, /resetAisDensityResults\(\)/);
});

test('matching consumes the exact global filtered array and reports exclusions', () => {
  assert.match(indexSource, /source: 'global_filtered_vessels'/);
  assert.match(indexSource, /vessels: JSON\.parse\(JSON\.stringify\(filteredStoreVessels\)\)/);
  assert.match(indexSource, /value: 'All'/);
  assert.match(indexSource, /matching-source-integrity/);
  assert.match(indexSource, /Integridad de flota verificada/);
});

test('live vessel endpoint rejects unbounded fleet requests and filters streamed positions', () => {
  assert.match(getVesselsFunctionSource, /source: "geofence-required"/);
  assert.match(getVesselsFunctionSource, /status: 400/);
  assert.match(getVesselsFunctionSource, /insidePolGeofence/);
  assert.match(getVesselsFunctionSource, /forceLive \? completedLiveVessels/);
});

test('filter endpoint reads the exact vesselType parameter and matches audit response shape', () => {
  assert.match(filterFunctionSource, /searchParams\.get\("vesselType"\)/);
  assert.doesNotMatch(filterFunctionSource, /searchParams\.get\("taxonomy"\)/);
  assert.match(filterFunctionSource, /auditStatus: "VALIDATED"/);
  assert.match(filterFunctionSource, /filterApplied: true/);
  assert.match(filterFunctionSource, /count: vessels\.length,[\s\S]*vessels/);
});
