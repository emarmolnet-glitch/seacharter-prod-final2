import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mapLoaderSource = await readFile(new URL('../map_loader.js', import.meta.url), 'utf8');
const auditFunctionSource = await readFile(new URL('../netlify/functions/audit-vessels.ts', import.meta.url), 'utf8');
const filterFunctionSource = await readFile(new URL('../netlify/functions/vessels-filter.ts', import.meta.url), 'utf8');

test('density map loads validated vessels through the read-only endpoint', () => {
  assert.match(indexSource, /fetch\('\/api\/audit-vessels',[\s\S]*?method: 'GET'/);
  assert.match(indexSource, /loadValidatedAisDensityVessels/);
  assert.match(indexSource, /audit-database-readonly/);
});

test('density map opens empty without automatically loading audit vessels', () => {
  const tabInitialization = indexSource.slice(indexSource.indexOf("if(tabId === 'ais')"), indexSource.indexOf("} else if (typeof destroyAisMap"));
  assert.match(tabInitialization, /resetAisDensityResults\(\)/);
  assert.match(tabInitialization, /updateAisMarkers\(\[\]\)/);
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
  assert.match(auditFunctionSource, /SELECT \*[\s\S]*FROM ais_vessels[\s\S]*WHERE audit_status = \$1/);
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
  assert.match(filterFunctionSource, /vessel_type ILIKE '%' \|\| \$1 \|\| '%'/);
  assert.match(filterFunctionSource, /path: "\/api\/vessels-filter"/);
  assert.doesNotMatch(filterFunctionSource, /INSERT|UPDATE|DELETE/);
});

test('selected taxonomy is only loaded after an explicit read action', () => {
  assert.match(indexSource, /\/api\/vessels-filter\?vesselType=\$\{encodeURIComponent\(selectedTaxonomy\)\}/);
  assert.match(indexSource, /executeReadOnlyAisRefresh/);
});

test('All Cargo uses the general audit endpoint as an explicit reset', () => {
  assert.match(indexSource, /selectedTaxonomy === 'All Cargo' \|\| !selectedTaxonomy[\s\S]*?\/api\/audit-vessels/);
  assert.match(indexSource, /vessels-filter\?vesselType=\$\{encodeURIComponent\(selectedTaxonomy\)\}/);
});

test('filter endpoint reads the exact vesselType parameter and matches audit response shape', () => {
  assert.match(filterFunctionSource, /searchParams\.get\("vesselType"\)/);
  assert.doesNotMatch(filterFunctionSource, /searchParams\.get\("taxonomy"\)/);
  assert.match(filterFunctionSource, /auditStatus: "VALIDATED"/);
  assert.match(filterFunctionSource, /filterApplied: true/);
  assert.match(filterFunctionSource, /count: vessels\.length,[\s\S]*vessels/);
});
