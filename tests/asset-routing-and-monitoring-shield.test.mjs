import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const viteConfigSource = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
const rootRedirects = await readFile(new URL('../_redirects', import.meta.url), 'utf8');
const publicRedirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
const netlifyConfig = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const headersSource = await readFile(new URL('../_headers', import.meta.url), 'utf8');
const distIndexSource = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

test('1. Vite configuration uses base: "/" to ensure absolute asset resolution', () => {
  assert.match(viteConfigSource, /base:\s*['"]\/['"]/);
});

test('2. Netlify redirects preserve /assets/* routing before SPA fallback', () => {
  for (const redirects of [rootRedirects, publicRedirects]) {
    const assetIndex = redirects.indexOf('/assets/* /assets/:splat 200');
    const spaIndex = redirects.indexOf('/* /index.html 200');
    assert.ok(assetIndex >= 0, 'Must include /assets/* /assets/:splat 200');
    assert.ok(spaIndex > assetIndex, 'SPA fallback must follow after asset rule');
  }

  assert.match(netlifyConfig, /from\s*=\s*"\/assets\/\*"/);
  assert.match(netlifyConfig, /to\s*=\s*"\/assets\/:splat"/);
});

test('3. index.html contains cache-busting headers and meta tags to invalidate old chunks', () => {
  assert.match(indexSource, /http-equiv="Cache-Control"\s+content="no-cache,\s*no-store,\s*must-revalidate"/);
  assert.match(indexSource, /name="build-version"/);
  assert.match(headersSource, /\/index\.html[\s\S]*?Cache-Control:\s*no-cache,\s*no-store,\s*must-revalidate/);
  assert.match(headersSource, /\/assets\/\*[\s\S]*?Cache-Control:\s*public,\s*max-age=\d+,\s*immutable/);
});

test('4. index.html installs vendor monitoring shield to prevent Worker errors from breaking React', () => {
  assert.match(indexSource, /installMonitoringShield/);
  assert.match(indexSource, /monitoring\.vendor/);
  assert.match(indexSource, /Worker error/);
  assert.match(indexSource, /window\.Worker\s*=\s*function\s+SeaCharterSafeWorker/);
});

test('5. Built production index.html references assets from absolute root /assets/', () => {
  assert.match(distIndexSource, /src="\/assets\/index-[^"]+\.js"/);
  assert.match(distIndexSource, /href="\/assets\/index-[^"]+\.css"/);
});
