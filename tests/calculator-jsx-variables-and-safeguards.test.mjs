import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tceWorkspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
const reverseCalculatorJsxSource = await readFile(new URL('../src/components/ReverseTceCalculator.jsx', import.meta.url), 'utf8');

test('1. useDataBridgeSpotConnection and updateMarketIndications are explicitly imported and defined with try/catch', () => {
  assert.match(tceWorkspaceSource, /import\s*\{[\s\S]*useDataBridgeSpotConnection[\s\S]*\}\s*from\s*'\.\/src\/hooks\/useDataBridgeSpotConnection\.js'/);
  assert.match(tceWorkspaceSource, /export function updateMarketIndications/);
  assert.match(tceWorkspaceSource, /console\.warn\('Data Bridge desconectado'\)/);
  assert.match(reverseCalculatorJsxSource, /updateMarketIndications/);
});

test('2. JSX cards render calculatedNetOwnerProfit, calculatedTceDaily, and calculatedTceTotal with toLocaleString', () => {
  assert.match(tceWorkspaceSource, /calculatedNetOwnerProfit\.toLocaleString\('en-US',\s*\{maximumFractionDigits:\s*0\}\)/);
  assert.match(tceWorkspaceSource, /calculatedTceDaily\.toLocaleString\('en-US',\s*\{maximumFractionDigits:\s*0\}\)/);
  assert.match(tceWorkspaceSource, /calculatedTceTotal\.toLocaleString\('en-US',\s*\{maximumFractionDigits:\s*0\}\)/);
});
