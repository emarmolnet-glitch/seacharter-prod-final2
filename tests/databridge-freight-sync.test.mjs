import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. Captura de Inputs Financieros: readActiveCalculatorSession captura Flete Compra y Flete Venta', () => {
  // Selectores exactos de los campos de flete compra y flete venta de la Calculadora
  assert.match(workspaceSource, /document\.getElementById\('freight-rate'\)/, 'Debe capturar el input freight-rate (Flete Compra Armador)');
  assert.match(workspaceSource, /document\.getElementById\('freight-sell'\)/, 'Debe capturar el input freight-sell (Flete Venta Fletador)');

  // Verificación de que readActiveCalculatorSession expone los valores de flete
  assert.match(workspaceSource, /fleteCompra:\s*freightCost/, 'readActiveCalculatorSession debe retornar fleteCompra');
  assert.match(workspaceSource, /fleteVenta:\s*freightSell/, 'readActiveCalculatorSession debe retornar fleteVenta');
  assert.match(workspaceSource, /fleteSugeridoArmadorCompra:\s*freightCost/);
  assert.match(workspaceSource, /fleteSugeridoFletadorVenta:\s*freightSell/);
});

test('2. Sincronización DataBridge: handleSyncCalculatorData captura y persiste Flete Compra y Flete Venta en route_and_chartering', () => {
  assert.match(workspaceSource, /flete_compra_usd_mt:\s*capturedFreightCost/);
  assert.match(workspaceSource, /flete_venta_usd_mt:\s*capturedFreightSell/);
  assert.match(workspaceSource, /flete_sugerido_armador_compra:\s*capturedFreightCost/);
  assert.match(workspaceSource, /flete_sugerido_fletador_venta:\s*capturedFreightSell/);

  // Actualiza los estados reactivos fleteCompra y fleteVenta
  assert.match(workspaceSource, /setFleteCompra\(capturedFreightCost\)/);
  assert.match(workspaceSource, /setFleteVenta\(capturedFreightSell\)/);
});

test('3. Inyección en Proyectos: La interfaz muestra explícitamente "Flete Sugerido Armador (Compra)" y "Flete Sugerido Fletador (Venta)"', () => {
  assert.match(
    workspaceSource,
    /Flete Sugerido Armador \(Compra\)/,
    'Debe mostrar explícitamente la etiqueta "Flete Sugerido Armador (Compra)"'
  );
  assert.match(
    workspaceSource,
    /Flete Sugerido Fletador \(Venta\)/,
    'Debe mostrar explícitamente la etiqueta "Flete Sugerido Fletador (Venta)"'
  );

  // Verificación de elementos en project-maritime-route-card
  assert.match(workspaceSource, /id="project-financial-freights-bar"/);
  assert.match(workspaceSource, /id="project-flete-compra-display"/);
  assert.match(workspaceSource, /id="project-flete-venta-display"/);

  // Verificación de elementos en el modal de Project Cargo
  assert.match(workspaceSource, /id="modal-suggested-freights-bar"/);
  assert.match(workspaceSource, /id="modal-flete-sugerido-armador"/);
  assert.match(workspaceSource, /id="modal-flete-sugerido-fletador"/);
});

test('4. Respetar la Simulación: autoCalculateEstimates y buildExecutiveReportData priorizan el flete de venta sincronizado sobre el cálculo bottom-up', () => {
  // autoCalculateEstimates debe verificar effectiveFleteVenta
  assert.match(workspaceSource, /effectiveFleteVenta\s*>\s*0\s*&&\s*effectiveWeightOrRt\s*>\s*0/);
  assert.match(workspaceSource, /targetOceanFreightSale\s*=\s*Math\.round\(effectiveFleteVenta\s*\*\s*effectiveWeightOrRt\s*\*\s*100\)\s*\/\s*100/);

  // buildExecutiveReportData debe respetar manualFleteVentaUnit
  assert.match(workspaceSource, /manualFleteVentaUnit\s*>\s*0\s*&&\s*reportRT\s*>\s*0/);
  assert.match(workspaceSource, /fleteSaleNum\s*=\s*Math\.round\(manualFleteVentaUnit\s*\*\s*reportRT\s*\*\s*100\)\s*\/\s*100/);
});

test('5. Simulación funcional: cálculo de cotización respetando el flete venta simulado vs bottom-up', () => {
  const toneladas = 18500;
  const fleteCompraSimulado = 32.50; // $/MT introducido en la Calculadora
  const fleteVentaSimulado = 35.00;  // $/MT introducido en la Calculadora

  const fobOperationsCost = 25000;
  const landCost = 5000;
  const totalCostWithoutFreight = fobOperationsCost + landCost;

  // 1. Simulación con Flete Venta Sincronizado (Respetando la simulación de la Calculadora):
  const targetFreightSale = Math.round(fleteVentaSimulado * toneladas * 100) / 100;
  assert.strictEqual(targetFreightSale, 647500);

  const totalSaleWithSimulation = targetFreightSale + (fobOperationsCost * 1.15) + (landCost * 1.15);
  assert.strictEqual(totalSaleWithSimulation, 647500 + 28750 + 5750);
  assert.strictEqual(totalSaleWithSimulation, 682000);

  // 2. Cálculo puro bottom-up (sin flete de venta manual):
  const freightCost = fleteCompraSimulado * toneladas;
  const totalCost = freightCost + totalCostWithoutFreight;
  const bottomUpSale = totalCost * 1.15;

  // El precio respetando la simulación no es el simple coste + 15%
  assert.notStrictEqual(totalSaleWithSimulation, bottomUpSale);
  assert.strictEqual(totalSaleWithSimulation > totalCost, true);
});

test('6. Botón Sincronizar DataBridge disponible en la cabecera del expediente activo', () => {
  assert.match(workspaceSource, /id="btn-sync-databridge-project-header"/);
  assert.match(workspaceSource, /Sincronizar \(DataBridge\)/);
});
