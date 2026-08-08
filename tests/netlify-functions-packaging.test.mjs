import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);
const functionsDirectory = new URL('../netlify/functions/', import.meta.url);
const netlifyConfig = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

test('Netlify explicitly configures the individual Functions directory and esbuild bundler', () => {
  assert.match(netlifyConfig, /\[build\][\s\S]*functions = "netlify\/functions"/);
  assert.match(netlifyConfig, /\[functions\][\s\S]*directory = "netlify\/functions"/);
  assert.match(netlifyConfig, /\[functions\][\s\S]*node_bundler = "esbuild"/);
  assert.match(netlifyConfig, /from = "\/api\/\*"[\s\S]*to = "\/\.netlify\/functions\/:splat"[\s\S]*status = 200/);
  assert.match(netlifyConfig, /\[dev\][\s\S]*command = "npm run dev"[\s\S]*targetPort = 5173[\s\S]*port = 8889/);
});

test('every top-level serverless Function exposes a Netlify-compatible handler', async () => {
  const entries = await readdir(functionsDirectory, { withFileTypes: true });
  const functionFiles = entries
    .filter((entry) => entry.isFile() && /\.(?:js|mjs|ts|mts)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const invalidFunctions = [];

  for (const functionFile of functionFiles) {
    const source = await readFile(new URL(`netlify/functions/${functionFile}`, repositoryRoot), 'utf8');
    const hasModernHandler = /export\s+default\s+/.test(source);
    const hasLegacyHandler = /export\s+(?:const|async function|function)\s+handler\b|exports\.handler\s*=|module\.exports\.handler\s*=/.test(source);
    if (!hasModernHandler && !hasLegacyHandler) invalidFunctions.push(functionFile);
  }

  assert.deepEqual(invalidFunctions, []);
});

test('shared Function modules resolve repository imports from their nested directory', async () => {
  const vesselStoreSource = await readFile(new URL('../netlify/functions/_shared/vessel-store.ts', import.meta.url), 'utf8');
  assert.match(vesselStoreSource, /from "\.\.\/\.\.\/\.\.\/db\/index\.js"/);
  assert.match(vesselStoreSource, /from "\.\.\/\.\.\/\.\.\/db\/schema\.js"/);
});

test('critical Data Bridge Functions retain their physical Netlify endpoints', async () => {
  const connectionStateSource = await readFile(new URL('../netlify/functions/databridge-connection-state.ts', import.meta.url), 'utf8');
  const masterStatsSource = await readFile(new URL('../netlify/functions/databridge-master-stats.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(connectionStateSource, /export const config|path:/);
  assert.doesNotMatch(masterStatsSource, /export const config|path:/);
});
