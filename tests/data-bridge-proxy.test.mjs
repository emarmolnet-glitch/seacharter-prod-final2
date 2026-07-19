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
