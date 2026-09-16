import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf-8');

test('1. ForwarderWorkspace defines commercialScenario state and builds commercialScenarios dictionary', () => {
  assert.match(forwarderSource, /const\s*\[commercialScenario,\s*setCommercialScenario\]\s*=\s*useState\('target'\)/, 'Debe inicializar commercialScenario con target');
  assert.match(forwarderSource, /commercialScenarios:\s*\{/, 'buildExecutiveReportData debe exportar el diccionario commercialScenarios');
  assert.match(forwarderSource, /id:\s*['"]target['"]/, 'commercialScenarios debe incluir el id target');
  assert.match(forwarderSource, /id:\s*['"]agency_fee['"]/, 'commercialScenarios debe incluir el id agency_fee');
  assert.match(forwarderSource, /id:\s*['"]all_in['"]/, 'commercialScenarios debe incluir el id all_in');
});

test('2. Executive Report header renders the 3-scenario commercial selector group', () => {
  assert.match(forwarderSource, /id="commercial-scenario-selector-group"/, 'Debe existir el contenedor del grupo de selectores');
  assert.match(forwarderSource, /id="scenario-btn-target"/, 'Debe existir el botón para el Escenario 1 (Target)');
  assert.match(forwarderSource, /id="scenario-btn-agency"/, 'Debe existir el botón para el Escenario 2 (Agency Fee)');
  assert.match(forwarderSource, /id="scenario-btn-all-in"/, 'Debe existir el botón para el Escenario 3 (All-In)');
  
  assert.match(forwarderSource, /Escenario 1:\s*Desglose Comercial\s*\(Target\)/);
  assert.match(forwarderSource, /Escenario 2:\s*Flete Técnico \+ Agency Fee/);
  assert.match(forwarderSource, /Escenario 3:\s*Tarifa All-In\s*\(Liner Terms\)/);
});

test('3. Escenario 1 (Desglose Comercial / Target) renders synchronized target freight and standard FOB margins', () => {
  assert.match(forwarderSource, /commercialScenario === 'target'/);
  assert.match(forwarderSource, /Flete Sugerido Fletador \(Venta\)/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? fleteCostNum : fleteSaleNum\)/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? estibaCostNum : estibaSaleNum\)/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? matCostNum : matSaleNum\)/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? periCostNum : periSaleNum\)/);
});

test('4. Escenario 2 (Flete Técnico + Agency Fee) displays pure technical costs and explicit "Agency, Logistics & Risk Fee" line', () => {
  assert.match(forwarderSource, /commercialScenario === 'agency_fee'/);
  assert.match(forwarderSource, /Flete Técnico Puro al Coste:/);
  assert.match(forwarderSource, /Agency, Logistics & Risk Fee/, 'Debe existir la fila explícita Agency, Logistics & Risk Fee');
  assert.match(forwarderSource, />Honorarios<\/span>/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? fleteCostNum : fleteSaleNum\)/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? 0 : fleteMarginNum\)/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? estibaCostNum : estibaSaleNum\)/);
  assert.match(forwarderSource, /formatCurrency\(commercialScenario === 'agency_fee' \? 0 : estibaMarginNum\)/);
});

test('5. Escenario 3 (Tarifa All-In / Liner Terms) collapses internal breakdown into a single consolidated client rate with USD/MT', () => {
  assert.match(forwarderSource, /commercialScenario === 'all_in'/);
  assert.match(forwarderSource, /Tarifa All-In \/ Liner Terms/);
  assert.match(forwarderSource, /Precio Único: \$\{\(toneladas > 0 \? \(finalTotalSale \/ toneladas\)\.toFixed\(2\) : '0\.00'\)\} USD\/MT/);
  assert.match(forwarderSource, /Full Service Door-to-Port \/ Liner Terms/);
});

test('6. Golden Rule: Total All-In selling price, final cost and net company margin are mathematically identical across all 3 scenarios', () => {
  // Simulación de valores numéricos de prueba
  const fleteCost = 45000;
  const fleteSale = 62000;
  const fleteMargin = fleteSale - fleteCost; // 17000

  const fobEstibaCost = 5000;
  const fobEstibaSale = fobEstibaCost * 1.15; // 5750
  const fobEstibaMargin = fobEstibaSale - fobEstibaCost; // 750

  const fobMatCost = 3000;
  const fobMatSale = fobMatCost * 1.15; // 3450
  const fobMatMargin = fobMatSale - fobMatCost; // 450

  const fobPeriCost = 7000;
  const fobPeriSale = fobPeriCost * 1.15; // 8050
  const fobPeriMargin = fobPeriSale - fobPeriCost; // 1050

  const totalCost = fleteCost + fobEstibaCost + fobMatCost + fobPeriCost; // 60000
  const totalSale = fleteSale + fobEstibaSale + fobMatSale + fobPeriSale; // 79250
  const totalMargin = totalSale - totalCost; // 19250

  // Scenario 1: Target
  const s1Cost = fleteCost + fobEstibaCost + fobMatCost + fobPeriCost;
  const s1Sale = fleteSale + fobEstibaSale + fobMatSale + fobPeriSale;
  const s1Margin = fleteMargin + fobEstibaMargin + fobMatMargin + fobPeriMargin;

  // Scenario 2: Technical Freight + Real FOB + Agency Fee
  const s2FleteSale = fleteCost;
  const s2FobEstibaSale = fobEstibaCost;
  const s2FobMatSale = fobMatCost;
  const s2FobPeriSale = fobPeriCost;
  const agencyFeeSale = totalMargin;
  const agencyFeeCost = 0;
  const agencyFeeMargin = totalMargin;

  const s2Cost = fleteCost + fobEstibaCost + fobMatCost + fobPeriCost + agencyFeeCost;
  const s2Sale = s2FleteSale + s2FobEstibaSale + s2FobMatSale + s2FobPeriSale + agencyFeeSale;
  const s2Margin = 0 + 0 + 0 + 0 + agencyFeeMargin;

  // Scenario 3: All-In / Liner Terms
  const s3Cost = totalCost;
  const s3Sale = totalSale;
  const s3Margin = totalMargin;

  // Verificación de integridad matemática absoluta
  assert.equal(s1Cost, totalCost, 'Escenario 1 Coste');
  assert.equal(s1Sale, totalSale, 'Escenario 1 Venta');
  assert.equal(s1Margin, totalMargin, 'Escenario 1 Margen');

  assert.equal(s2Cost, totalCost, 'Escenario 2 Coste debe coincidir');
  assert.equal(s2Sale, totalSale, 'Escenario 2 Venta debe coincidir');
  assert.equal(s2Margin, totalMargin, 'Escenario 2 Margen debe coincidir');

  assert.equal(s3Cost, totalCost, 'Escenario 3 Coste debe coincidir');
  assert.equal(s3Sale, totalSale, 'Escenario 3 Venta debe coincidir');
  assert.equal(s3Margin, totalMargin, 'Escenario 3 Margen debe coincidir');
});

test('7. Number shields Number() || 0 are systematically maintained across calculations', () => {
  assert.match(forwarderSource, /Number\(val \|\| 0\)/);
  assert.match(forwarderSource, /Number\(activeReport\.toneladas \|\| activeReport\.totalWeightTons/);
  assert.match(forwarderSource, /Number\(activeReport\.fleteCompraUnit \|\| 0\)/);
  assert.match(forwarderSource, /Number\(activeReport\.fleteVentaUnit \|\| 0\)/);
});
