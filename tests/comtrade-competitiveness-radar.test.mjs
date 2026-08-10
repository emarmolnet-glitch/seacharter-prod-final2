import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [serviceSource, functionSource, componentSource, entrySource, indexSource] = await Promise.all([
  readFile(new URL('../src/services/comtradeApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/comtrade.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ComtradeCompetitivenessRadar.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/comtrade-radar-entry.ts', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

test('Comtrade service uses the Netlify proxy and seven-day browser cache', () => {
  assert.match(serviceSource, /\/\.netlify\/functions\/comtrade/);
  assert.doesNotMatch(serviceSource, /VITE_UN_COMTRADE_API_KEY/);
  assert.doesNotMatch(serviceSource, /comtradeapi\.un\.org/);
  assert.doesNotMatch(serviceSource, /subscription-key/);
  assert.doesNotMatch(serviceSource, /Ocp-Apim-Subscription-Key/);
  assert.match(functionSource, /process\.env\.VITE_UN_COMTRADE_API_KEY/);
  assert.match(functionSource, /https:\/\/comtradeapi\.un\.org\/data\/v1\/get\/C\/A\/HS/);
  assert.match(functionSource, /'Ocp-Apim-Subscription-Key': apiKey/);
  assert.match(serviceSource, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(serviceSource, /window\.localStorage/);
  assert.match(serviceSource, /export async function getTradeMargin/);
  assert.match(serviceSource, /responseCacheKey/);
  assert.match(serviceSource, /cifPricePerMt - fobPricePerMt/);
  assert.match(serviceSource, /getTradeRecords\(reporterCode, 0, normalizedCmdCode, 'M'\)/);
  assert.match(serviceSource, /getTradeRecords\(partnerCode, 0, normalizedCmdCode, 'X'\)/);
});

test('competitiveness radar mounts inside commercial negotiation', () => {
  assert.match(indexSource, /src\/comtrade-radar-entry\.ts/);
  assert.match(indexSource, /id="comtrade-competitiveness-radar"/);
  assert.match(entrySource, /ComtradeCompetitivenessRadar\(root\)/);
  assert.match(componentSource, /252310 · Clinker de cemento/);
  assert.match(componentSource, /data-comtrade-signal/);
});

test('radar remains isolated from phase-one recalculation logic', () => {
  assert.doesNotMatch(componentSource, /runEngine\s*\(/);
  assert.doesNotMatch(componentSource, /\.value\s*=/);
  assert.doesNotMatch(serviceSource, /runEngine\s*\(/);
  assert.match(componentSource, /getElementById\('freight-sell'\)/);
});
