import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mapLoaderSource = await readFile(new URL('../map_loader.js', import.meta.url), 'utf8');
const auditFunctionSource = await readFile(new URL('../netlify/functions/audit-vessels.ts', import.meta.url), 'utf8');

test('density map loads validated vessels through the read-only endpoint', () => {
  assert.match(indexSource, /fetch\('\/api\/audit-vessels',[\s\S]*?method: 'GET'/);
  assert.match(indexSource, /loadValidatedAisDensityVessels/);
  assert.match(indexSource, /audit-database-readonly/);
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
  assert.match(auditFunctionSource, /\.select\(\)/);
  assert.match(auditFunctionSource, /\.from\(aisVessels\)/);
  assert.match(auditFunctionSource, /\.where\(eq\(aisVessels\.auditStatus, VALIDATED_AUDIT_STATUS\)\)/);
  assert.doesNotMatch(auditFunctionSource, /\.insert\(|\.update\(|\.delete\(/);
});
