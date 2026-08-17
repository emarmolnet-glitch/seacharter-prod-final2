import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [serviceSource, functionSource, componentSource, hsCodesSource, entrySource, indexSource] = await Promise.all([
  readFile(new URL('../src/services/comtradeApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/comtrade.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ComtradeCompetitivenessRadar.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/data/comtradeHsCodes.ts', import.meta.url), 'utf8'),
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
  assert.match(serviceSource, /getTradeRecords\(reporterCode, partnerCode, normalizedCmdCode, 'M'\)/);
  assert.match(serviceSource, /getTradeRecords\(partnerCode, reporterCode, normalizedCmdCode, 'X'\)/);
  assert.match(serviceSource, /LAST_CONSOLIDATED_PERIOD = 2025/);
  assert.doesNotMatch(serviceSource, /CONSOLIDATED_PERIODS|retryAttempt|RATE_LIMIT_RETRY_DELAY_MS/);
  assert.doesNotMatch(serviceSource, /for \(const period/);
  assert.equal((serviceSource.match(/await getTradeRecords\(/g) || []).length, 2);
  assert.ok(
    serviceSource.indexOf("await getTradeRecords(reporterCode, partnerCode, normalizedCmdCode, 'M')")
      < serviceSource.indexOf("await getTradeRecords(partnerCode, reporterCode, normalizedCmdCode, 'X')"),
  );
  assert.match(serviceSource, /response\.status === 429 \|\| apiStatusCode === 429/);
  assert.match(serviceSource, /Límite de peticiones de la ONU alcanzado\. Espere unos minutos/);
  assert.match(functionSource, /response\.status === 429/);
  assert.match(functionSource, /statusCode: 429/);
});

test('competitiveness radar mounts inside commercial negotiation', () => {
  assert.match(indexSource, /src\/comtrade-radar-entry\.ts/);
  assert.match(indexSource, /id="comtrade-competitiveness-radar"/);
  assert.match(entrySource, /ComtradeCompetitivenessRadar\(root\)/);
  assert.doesNotMatch(componentSource, /value="252310"/);
  assert.match(componentSource, /Selecciona una especificación de carga/);
  assert.match(componentSource, /data-comtrade-signal/);
  assert.doesNotMatch(componentSource, /debouncedLoadMargin|COMTRADE_DEBOUNCE_MS/);
  assert.match(componentSource, /onChange: resetPendingQuery/);
  assert.match(componentSource, /addEventListener\('change', resetPendingQuery\)/);
  assert.match(componentSource, /addEventListener\('click', handleLoadClick\)/);
  assert.equal((componentSource.match(/getTradeMargin\(/g) || []).length, 1);
  assert.equal((componentSource.match(/void loadMargin\(\)/g) || []).length, 1);
  assert.doesNotMatch(componentSource, /onChange: (?:loadMargin|debouncedLoadMargin)/);
});

test('competitiveness radar clarifies the destination differential', () => {
  assert.match(componentSource, /Diferencial absorbido en destino/i);
  assert.match(componentSource, /Este valor NO es un flete marítimo/);
  assert.match(componentSource, /role="tooltip"/);
  assert.match(componentSource, /bg-slate-900/);
  assert.match(componentSource, /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(componentSource, /Brecha CIF-FOB \| Volumen Anual Total \(\$\{latestResult\.period\}\):/);
});

test('HS codes follow the calculator cargo specification and select a family default', () => {
  assert.match(componentSource, /getElementById\('cargo-type-manual'\)/);
  assert.match(componentSource, /addEventListener\('CARGO_TYPE_CHANGED'/);
  assert.match(componentSource, /replaceHsCodeOptions\(cmdSelect, normalizedCargoTypeId\)/);
  assert.match(componentSource, /select\.value = family\.defaultCode/);
  assert.match(componentSource, /select\.disabled = true/);
  assert.match(hsCodesSource, /'10':[\s\S]*?defaultCode: '252310'/);
  assert.match(hsCodesSource, /'20':[\s\S]*?defaultCode: '7208'/);
  assert.match(hsCodesSource, /'30':[\s\S]*?defaultCode: '3105'/);
  assert.match(hsCodesSource, /'60':[\s\S]*?defaultCode: '1001'/);
  assert.doesNotMatch(hsCodesSource, /'100':/);
});

test('radar remains isolated from phase-one recalculation logic', () => {
  assert.doesNotMatch(componentSource, /runEngine\s*\(/);
  assert.doesNotMatch(componentSource, /freightInput(?:\?\.)?\.value\s*=/);
  assert.doesNotMatch(serviceSource, /runEngine\s*\(/);
  assert.match(componentSource, /getElementById\('freight-sell'\)/);
});
