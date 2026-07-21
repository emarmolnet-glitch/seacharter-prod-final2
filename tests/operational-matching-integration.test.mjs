import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, engineSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8'),
]);

test('section two exposes a closed turn time selector beside operational rates', () => {
  assert.match(indexSource, /<label id="label-turn-time-hours"[^>]*>TURN TIME TOTAL \(H\)<\/label>/);
  assert.match(indexSource, /<select id="turn-time-hours"[^>]*onchange="runEngine\(\); syncCalculatorAndMatching\('calculator'\)"/);
  assert.match(indexSource, /<option value="12">12 horas<\/option>[\s\S]*<option value="24" selected>24 horas<\/option>[\s\S]*<option value="48">48 horas<\/option>/);
  assert.doesNotMatch(indexSource, /<input[^>]*id="turn-time-hours"/);
  assert.match(indexSource, /const turnTimeDays = isZeroCalculation \? 0 : \(turnTimeHours \/ 24\)/);
  assert.match(indexSource, /const laytimeDays = isZeroCalculation \? 0 : \(dPortLoad \+ dPortDisch \+ turnTimeDays\)/);
});

test('section two keeps POL and POD operations in a symmetric two-column grid', () => {
  assert.match(
    indexSource,
    /<div id="port-operations-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 mb-4">[\s\S]*?id="metodo_carga"[\s\S]*?id="metodo_descarga_pod"[\s\S]*?id="rate-load"[\s\S]*?id="rate-disch"[\s\S]*?id="contenedor-gruas-pol"[\s\S]*?id="contenedor-gruas-pod"[\s\S]*?<\/div>\s*<div id="demurrage-exposure-alert"/,
  );
  assert.doesNotMatch(indexSource, /id="port-operation-(?:pol|pod)"|Bloque de Carga · POL|Bloque de Descarga · POD/);
  assert.match(
    indexSource,
    /<div id="contractual-parameters-grid" class="grid grid-cols-1 md:grid-cols-4 gap-4">[\s\S]*?id="product-sector"[\s\S]*?id="cargo-sf"[\s\S]*?id="turn-time-hours"[\s\S]*?id="freight-conditions"[\s\S]*?id="laytime-load-condition"[\s\S]*?id="laytime-disch-condition"/,
  );
  assert.equal((indexSource.match(/id="contenedor-gruas-pol"/g) || []).length, 1);
  assert.equal((indexSource.match(/id="contenedor-gruas-pod"/g) || []).length, 1);
});

test('section two injects standardized tooltips for contractual and CBAM fields', () => {
  assert.match(indexSource, /'freight-conditions': 'Define la responsabilidad del pago y gestión de la operativa portuaria \(ej\. FIOS: el fletador asume y organiza los gastos de carga, descarga y estiba\)\.'/);
  assert.match(indexSource, /'laytime-load-condition': 'Condiciones de tiempo de plancha que definen si los fines de semana y festivos computan como tiempo operativo continuo \(SHINC\) o si se excluyen del cálculo \(SHEX\/FHEX\)\.'/);
  assert.match(indexSource, /'laytime-disch-condition': 'Condiciones de tiempo de plancha que definen si los fines de semana y festivos computan como tiempo operativo continuo \(SHINC\) o si se excluyen del cálculo \(SHEX\/FHEX\)\.'/);
  assert.match(indexSource, /'product-sector': 'Clasificación aplicable para el Mecanismo de Ajuste en Frontera por Carbono\.'/);
  assert.match(indexSource, /'ritmo_nominal_pol': 'Multiplicador operativo\. Afecta directamente al cálculo automático del ritmo real diario\.'/);
  assert.match(indexSource, /'ritmo_nominal_pod': 'Multiplicador operativo\. Afecta directamente al cálculo automático del ritmo real diario\.'/);
  assert.match(indexSource, /label\.insertAdjacentHTML\('beforeend', buildFieldTooltip\(text\)\)/);
});

test('matching payload carries stowage volume and ship gear requirements', () => {
  assert.match(indexSource, /stowageFactor: readNumber\('cargo-sf'\)/);
  assert.match(indexSource, /requiredVolumeCbm: \(Number\(calculation\.cargo\?\.quantity\) \|\| readNumber\('cargo-qty'\)\) \* readNumber\('cargo-sf'\)/);
  assert.match(indexSource, /metodoRequiereGruasBuque\(document\.getElementById\('metodo_carga'\)\?\.value\)/);
});

test('AIS backend enforces volume and equipment before compatibleCount', () => {
  assert.match(engineSource, /requiredVolumeCbm/);
  assert.match(engineSource, /methodsRequireShipGear/);
  assert.match(engineSource, /requiredVolumeCbm,/);
  assert.match(engineSource, /volumeOk: technicalEligibility\.volume\.compatible/);
  assert.match(engineSource, /compatibleCount: matches\.length/);
});
