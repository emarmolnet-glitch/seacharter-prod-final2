import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseOperationalRate } from '../netlify/functions/_shared/calculator-autofill-reasoning.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const proxy = read('../netlify/functions/cerebro-ia.js');
const start = proxy.indexOf('export function applyOperationalRateOverride');
const end = proxy.indexOf('export function applyPackagingOverride', start);
const override = vm.runInNewContext(`(${proxy.slice(start, end).trim().replace('export ', '')})`, { parseOperationalRate });

test('explicit rates replace backend cement defaults independently, including nested payloads', () => {
  const response = { payload: { loadRate: 1028, dischargeRate: 4800 } };
  override(response, 'cemento 15000 toneladas, ritmos de carga 6.000 y descarga 7,500');
  assert.equal(response.payload.loadRate, 6000);
  assert.equal(response.payload.dischargeRate, 7500);
  override(response, 'descarga 2800');
  assert.equal(response.payload.loadRate, 6000);
  assert.equal(response.payload.dischargeRate, 2800);
  override(response, 'cemento 15000 toneladas');
  assert.equal(response.payload.loadRate, 6000);
  assert.equal(parseOperationalRate('1500 carga y 2000 descarga', 'load'), 1500);
  assert.equal(parseOperationalRate('1500 carga y 2000 descarga', 'discharge'), 2000);
});

test('live market rate wins over stored rates and invalid values preserve target', () => {
  const html = read('../index.html');
  const start = html.indexOf('        function syncMarketIntelToInverseTce(');
  const end = html.indexOf('        function applyMarketLatestToInverseTce(', start);
  const market = { value: '$ 24.500,50 /día' };
  const target = { value: '1' };
  let calculations = 0;
  const sync = vm.runInNewContext(`(${html.slice(start, end).trim()})`, {
    currentVesselPricingCategory: 'Panamax', getMarketSpeedVesselClass: x => x,
    document: { getElementById: id => id === 'market-intel-panamax-tc' ? market : id === 'inverse-tce-target' ? target : null },
    updateBalticSpotSourceLabel() {}, calculateInverseTce() { calculations++; }
  });
  assert.equal(sync(), true);
  assert.equal(target.value, '24500.5');
  market.value = 'No disponible';
  assert.equal(sync(), false);
  assert.equal(target.value, '24500.5');
  assert.equal(calculations, 1);
});

test('scan sends local request with context and renders server reply without local replacement', () => {
  const drawer = read('../src/components/GlobalMadreDrawer.jsx');
  assert.match(drawer, /MADRE_API_ENDPOINT = "\/api\/madre-chat"/);
  assert.match(drawer, /current_module: "core_pro"/);
  assert.match(drawer, /contexto_ui: getCoreProUIContext\(\)/);
  const requestStart = drawer.indexOf('const response = await fetch(MADRE_API_ENDPOINT');
  const requestEnd = drawer.indexOf('const handleSubmit', requestStart);
  const request = drawer.slice(requestStart, requestEnd);
  assert.match(request, /const finalReply = data.respuesta/);
  assert.doesNotMatch(request, /buildMotherExecutiveScript/);
  assert.match(request, /text: finalReply/);
});
