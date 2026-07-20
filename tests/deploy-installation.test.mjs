import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const nodeVersion = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();

test('Netlify dependency installation uses npm with the committed lockfile', () => {
  assert.equal(packageJson.packageManager, undefined);
  assert.equal(packageLock.lockfileVersion, 3);
  assert.equal(packageJson.engines.node, '20.x');
  assert.equal(packageJson.engines.npm, '10.x');
  assert.deepEqual(packageLock.packages[''].engines, packageJson.engines);
  assert.match(nodeVersion, /^20\./);
});
