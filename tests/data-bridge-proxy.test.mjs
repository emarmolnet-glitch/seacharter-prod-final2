import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const proxySource = readFileSync(new URL('../netlify/functions/databridge-proxy.ts', import.meta.url), 'utf8');
const netlifyConfig = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const rootRedirects = readFileSync(new URL('../_redirects', import.meta.url), 'utf8');
const publicRedirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');

test('Data Bridge proxy forwards the original HTTP method and request body', () => {
  assert.match(proxySource, /fetchPreservingMethod\(targetUrl, req\.method, forwardHeaders, body\)/);
  assert.match(proxySource, /method,/);
  assert.match(proxySource, /body,/);
  assert.match(proxySource, /redirect: "manual"/);
});

test('Data Bridge proxy targets the explicit API path', () => {
  assert.match(proxySource, /DATA_BRIDGE_RECEIVE_CORE_DATA_URL/);
  assert.match(proxySource, /DATA_BRIDGE_RECEIVE_CORE_DATA_PATH/);
  assert.match(proxySource, /`\/api\/\$\{forwardPath\}`/);
});

test('Data Bridge proxy forwards JSON and authentication headers', () => {
  assert.match(proxySource, /forwardHeaders\.set\("content-type", "application\/json"\)/);
  assert.match(proxySource, /forwardHeaders\.set\("accept", "application\/json"\)/);
  assert.match(proxySource, /forwardHeaders\.set\("authorization", `Bearer \$\{apiSecret\}`\)/);
  assert.match(proxySource, /forwardHeaders\.set\("x-api-key", apiKey\)/);
});

test('external redirects no longer bypass the controlled proxy function', () => {
  for (const source of [netlifyConfig, rootRedirects, publicRedirects]) {
    assert.doesNotMatch(source, /calm-shortbread-55bcfc\.netlify\.app\/api\/:splat/);
  }
  assert.match(proxySource, /path: "\/api\/databridge\/\*"/);
});

test('Netlify API rewrites preserve function-native routes and precede the SPA fallback', () => {
  const apiRewriteIndex = netlifyConfig.indexOf('from = "/api/*"');
  const spaFallbackIndex = netlifyConfig.indexOf('from = "/*"');
  const apiRewriteBlock = netlifyConfig.slice(apiRewriteIndex, netlifyConfig.indexOf('[[redirects]]', apiRewriteIndex + 1));

  assert.ok(apiRewriteIndex >= 0);
  assert.ok(spaFallbackIndex > apiRewriteIndex);
  assert.match(apiRewriteBlock, /to = "\/\.netlify\/functions\/:splat"/);
  assert.match(apiRewriteBlock, /status = 200/);
  assert.doesNotMatch(apiRewriteBlock, /force = true/);
  assert.match(rootRedirects, /^\/api\/\* \/\.netlify\/functions\/:splat 200$/m);
  assert.ok(rootRedirects.indexOf('/api/*') < rootRedirects.indexOf('/* /index.html 200'));
});
