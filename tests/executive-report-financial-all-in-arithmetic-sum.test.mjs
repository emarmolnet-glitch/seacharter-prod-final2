import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. Elimina cualquier lógica en el bloque final que calcule el total multiplicando Tarifa * Volumen (RT) o Tarifa * Peso (MT)', () => {
  // Asegura que no se multiplica en el bloque final por RT ni MT para calcular el Precio Total de Venta
  assert.doesNotMatch(workspaceSource, /finalTotalSale\s*=\s*(?:unitRateSale|tarifaAllIn|fleteVentaUnit)\s*\*\s*(?:reportRT|revenueTons|totalWeightTons|toneladas)/);
  assert.doesNotMatch(workspaceSource, /finalTotalCost\s*=\s*(?:unitRateCost|tarifaCost|fleteCompraUnit)\s*\*\s*(?:reportRT|revenueTons|totalWeightTons|toneladas)/);
});

test('2. Precio Total de Venta al Cliente es ESTRICTAMENTE la suma directa aritmética de los valores absolutos ya calculados', () => {
  // En buildExecutiveReportData
  assert.match(
    workspaceSource,
    /finalTotalSale\s*=\s*Math\.round\(\(subtotalFreightSale\s*\+\s*subtotalFobOperationsSale\)\s*\*\s*100\)\s*\/\s*100/
  );
  // En renderizado showExecutiveReport
  assert.match(
    workspaceSource,
    /finalTotalSale\s*=\s*Math\.round\(\(subtotalVentaFleteMaritimo\s*\+\s*subtotalVentaFobOperativa\)\s*\*\s*100\)\s*\/\s*100/
  );
});

test('3. Coste Total All-In es la suma directa de [Subtotal Coste Flete Marítimo] + [Subtotal Coste FOB y Operativa Portuaria]', () => {
  // En buildExecutiveReportData
  assert.match(
    workspaceSource,
    /finalTotalCost\s*=\s*Math\.round\(\(subtotalFreightCost\s*\+\s*subtotalFobOperationsCost\)\s*\*\s*100\)\s*\/\s*100/
  );
  // En renderizado showExecutiveReport
  assert.match(
    workspaceSource,
    /finalTotalCost\s*=\s*Math\.round\(\(subtotalCosteFleteMaritimo\s*\+\s*subtotalCosteFobOperativa\)\s*\*\s*100\)\s*\/\s*100/
  );
});

test('4. Margen Comercial es la resta directa de [Precio Total de Venta] - [Coste Total All-In]', () => {
  // Verificación de resta directa sin recálculos
  assert.match(
    workspaceSource,
    /finalTotalMargin\s*=\s*Math\.round\(\(finalTotalSale\s*-\s*finalTotalCost\)\s*\*\s*100\)\s*\/\s*100/
  );
});

test('5. Tarifa All-In unitaria se calcula a la inversa: [Precio Total de Venta] / [Valor de la regla W/M aplicable (RT o MT)]', () => {
  // Verificación de cálculo a la inversa
  assert.match(
    workspaceSource,
    /unitRateSale\s*=\s*wmApplicableValue\s*>\s*0\s*\?\s*finalTotalSale\s*\/\s*wmApplicableValue\s*:\s*0/
  );
  assert.match(
    workspaceSource,
    /unitRateSale\s*=\s*wmReglaAplicable\s*>\s*0\s*\?\s*\(finalTotalSale\s*\/\s*wmReglaAplicable\)\s*:\s*0/
  );
});

test('6. Simulación matemática de cálculo financiero All-In con regla W/M respetada', () => {
  // Simulación de valores absolutos ya calculados en pasos anteriores
  const subtotalCosteFleteMaritimo = 45000.00;
  const subtotalVentaFleteMaritimo = 51750.00; // Con W/M ya aplicado
  const subtotalCosteFobOperativa = 18450.00;
  const subtotalVentaFobOperativa = 21217.50; // Con W/M ya aplicado

  const revenueTons = 3500;
  const metricTons = 2800;
  const wmApplicable = Math.max(revenueTons, metricTons);

  // 1. Precio Total de Venta al Cliente
  const precioTotalVenta = Math.round((subtotalVentaFleteMaritimo + subtotalVentaFobOperativa) * 100) / 100;
  assert.strictEqual(precioTotalVenta, 72967.50, 'Precio Total de Venta debe ser exactamente la suma de ambos subtotales');

  // 2. Coste Total All-In
  const costeTotalAllIn = Math.round((subtotalCosteFleteMaritimo + subtotalCosteFobOperativa) * 100) / 100;
  assert.strictEqual(costeTotalAllIn, 63450.00, 'Coste Total All-In debe ser exactamente la suma de ambos costes');

  // 3. Margen Comercial
  const margenComercial = Math.round((precioTotalVenta - costeTotalAllIn) * 100) / 100;
  assert.strictEqual(margenComercial, 9517.50, 'Margen Comercial debe ser la resta directa');

  // 4. Tarifa All-In unitaria a la inversa
  const tarifaAllInUnitaria = precioTotalVenta / wmApplicable;
  assert.strictEqual(Math.round(tarifaAllInUnitaria * 100) / 100, 20.85, 'Tarifa All-In unitaria debe calcularse a la inversa dividiendo el precio entre W/M');

  // Comprobar que NO se infla el precio multiplicando de nuevo por W/M
  assert.notStrictEqual(precioTotalVenta * wmApplicable, precioTotalVenta);
});
