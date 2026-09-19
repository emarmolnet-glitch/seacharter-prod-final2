import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(
  new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
  'utf8'
);

test('1. Fix del Estado Fantasma: useEffect resetea estados operativos cuando totalWeightTons === 0 o !activeProject', () => {
  // Verifies the operational states declaration
  assert.match(componentSource, /const\s+\[origin,\s*setOrigin\]\s*=\s*useState/);
  assert.match(componentSource, /const\s+\[destination,\s*setDestination\]\s*=\s*useState/);
  assert.match(componentSource, /const\s+\[demurrageCost,\s*setDemurrageCost\]\s*=\s*useState/);
  assert.match(componentSource, /const\s+\[oceanFreight,\s*setOceanFreight\]\s*=\s*useState/);

  // Verifies the explicit operational states reset
  assert.match(componentSource, /setOrigin\(['"]['"]\)/);
  assert.match(componentSource, /setDestination\(['"]['"]\)/);
  assert.match(componentSource, /setPol\(['"]['"]\)/);
  assert.match(componentSource, /setPod\(['"]['"]\)/);
  assert.match(componentSource, /setDistanceNm\(0\)/);
  assert.match(componentSource, /setDemurrageCost\(0\)/);
  assert.match(componentSource, /setOceanFreight\(0\)/);

  // Verifies condition for zero tons or inactive project
  assert.match(componentSource, /if\s*\(\s*(?:totalWeightTons\s*===\s*0\s*\|\|\s*!activeProject|!activeProject\s*\|\|\s*totalWeightTons\s*===\s*0)\s*\)/);
});

test('2. Guarda Matemática: el cálculo de Demoras y Plancha contiene if (totalWeightTons <= 0) return;', () => {
  assert.match(
    componentSource,
    /if\s*\(\s*totalWeightTons\s*<=\s*0\s*\)\s*return;/,
    'Debe incluir la guarda matemática exacta if (totalWeightTons <= 0) return; para prevenir tiempos de muelle erróneos con 0 toneladas'
  );
});

test('3. UI Torre de Control: Dashboard Superior tipo Grid (grid-cols-1 md:grid-cols-4 gap-4 mb-6)', () => {
  assert.match(
    componentSource,
    /grid\s+grid-cols-1\s+md:grid-cols-4\s+gap-4\s+mb-6/,
    'Debe definir el contenedor grid con las clases requeridas'
  );

  // Verifies location above "1. Lista de Empaque"
  const towerIndex = componentSource.indexOf('torre-de-control-dashboard');
  const packingListIndex = componentSource.indexOf('1. Lista de Empaque');
  assert.ok(towerIndex > 0, 'El dashboard Torre de Control debe estar renderizado');
  assert.ok(packingListIndex > 0, 'La sección 1. Lista de Empaque debe existir');
  assert.ok(towerIndex < packingListIndex, 'La Torre de Control debe ubicarse encima del bloque 1. Lista de Empaque');
});

test('4. Tarjeta 1 (Marítimo): Muestra Flete Marítimo Coste y Venta con datos locales', () => {
  assert.match(componentSource, /Marítimo/);
  assert.match(componentSource, /controlTowerMaritimeCost/);
  assert.match(componentSource, /controlTowerMaritimeSale/);
});

test('5. Tarjeta 2 (Terrestre): Muestra fletes terrestres Neon y etiqueta Pendiente Land Charter si están a 0', () => {
  assert.match(componentSource, /Terrestre/);
  assert.match(componentSource, /activeProject\?\.land_freight_cost/);
  assert.match(componentSource, /activeProject\?\.land_freight_sale/);
  assert.match(componentSource, /Pendiente Land Charter/);
});

test('6. Tarjeta 3 (Mercancía FOB): Muestra activeProject?.valor_total_mercancia_usd', () => {
  assert.match(componentSource, /Mercancía FOB/);
  assert.match(componentSource, /activeProject\?\.valor_total_mercancia_usd/);
});

test('7. Tarjeta 4 (Resumen All-In): Muestra Margen y Gran Total Facturar con fondo oscuro', () => {
  assert.match(componentSource, /Resumen All-In/);
  assert.match(componentSource, /bg-slate-800\s+text-white/);
  assert.match(componentSource, /Gran Total Facturar/);
  assert.match(componentSource, /Margen Beneficio/);
});

test('8. Formateo con Intl.NumberFormat estilo moneda USD para evitar NaN', () => {
  assert.match(componentSource, /new\s+Intl\.NumberFormat\(\s*['"]en-US['"],\s*\{[\s\S]*?currency:\s*['"]USD['"]/);
});
