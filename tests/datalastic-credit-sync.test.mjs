import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const trackingSource = await readFile(new URL('../tracking-live.js', import.meta.url), 'utf8');
const creditStoreSource = await readFile(new URL('../src/stores/datalastic-credit-store.js', import.meta.url), 'utf8');
const consumptionLogSource = await readFile(new URL('../src/utils/datalastic-consumption-log.js', import.meta.url), 'utf8');
const dueDiligenceSource = await readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8');
const coordinatorSource = await readFile(new URL('../netlify/functions/_shared/aisCoordinator.js', import.meta.url), 'utf8');
const dataBridgeSource = await readFile(new URL('../public/databridge.html', import.meta.url), 'utf8');

test('Datalastic credit balance stays authoritative across radar responses', () => {
  assert.match(creditStoreSource, /createStore/);
  assert.match(creditStoreSource, /recordRadarSuccess\(meta = \{\}\)/);
  assert.match(creditStoreSource, /cacheStatus === 'MISS' \? 1 : 0/);
  assert.match(creditStoreSource, /normalizeBudget\(meta\.budget, state\)/);
  assert.match(creditStoreSource, /fetch\('\/api\/credits\/status'/);
  assert.doesNotMatch(creditStoreSource, /state\.remainingCredits - requestCost/);
  assert.match(creditStoreSource, /void get\(\)\.refresh\(\)/);
  assert.match(creditStoreSource, /BroadcastChannel/);
});

test('Matching and Data Bridge mount the shared credit counter', () => {
  assert.match(indexSource, /data-datalastic-credit-counter/);
  assert.match(indexSource, /datalastic:radar-success/);
  assert.match(trackingSource, /mountDatalasticCreditCounter/);
  assert.match(trackingSource, /datalasticCreditStore\.getState\(\)\.refresh/);
  assert.match(dataBridgeSource, /DatalasticCreditCounter/);
  assert.match(dataBridgeSource, /databridge-datalastic-credit/);
});

test('Datalastic consumption logs only confirmed provider credits across modules', () => {
  assert.match(consumptionLogSource, /cacheStatus.*MISS/);
  assert.match(consumptionLogSource, /Crédito Datalastic consumido por \[\$\{entry\.module\}\]: \[\$\{entry\.action\}\]/);
  assert.match(indexSource, /module: 'Cálculo de Rutas'[\s\S]*Autocompletar especificaciones por IMO/);
  assert.match(indexSource, /module: radarContext === 'core-pro-voyage-time' \? 'Cálculo de Rutas' : 'Tracking \/ Radar'/);
  assert.match(trackingSource, /module: 'Tracking'[\s\S]*Consultar posición AIS en vivo/);
  assert.match(dueDiligenceSource, /module: 'Auditoría'[\s\S]*Consultar ficha técnica del buque/);
  assert.match(coordinatorSource, /Crédito Datalastic consumido por \[\$\{consumption\.module\}\]: \[\$\{consumption\.action\}\]/);
});
