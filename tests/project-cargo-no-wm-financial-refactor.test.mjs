import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. Total Flete Marítimo (Compra y Venta) no multiplica por Revenue Tons (RT) o volumen m3', () => {
  // Asegura que no se multiplica la tarifa de venta por reportRT para calcular fleteSaleNum
  assert.doesNotMatch(workspaceSource, /fleteSaleNum\s*=\s*Math\.round\(manualFleteVentaUnit\s*\*\s*reportRT/);
  // Asegura que no se calcula targetOceanFreightSale multiplicando por RT en fletamentos
  assert.doesNotMatch(workspaceSource, /targetOceanFreightSale\s*=\s*Math\.round\(effectiveFleteVenta\s*\*\s*revenueTons/);
});

test('2. Flete Marítimo se calcula con Opción A (Tarifa * Peso MT) o Opción B (Lumpsum directo)', () => {
  // Opción A en buildExecutiveReportData
  assert.match(workspaceSource, /fleteSaleNum\s*=\s*Math\.round\(manualFleteVentaUnit\s*\*\s*totalWeightTons\s*\*\s*100\)\s*\/\s*100/);
  // Opción A en autoCalculateEstimates
  assert.match(workspaceSource, /targetOceanFreightSale\s*=\s*Math\.round\(effectiveFleteVenta\s*\*\s*totalWeightTons\s*\*\s*100\)\s*\/\s*100/);
  // Opción B (Lumpsum directo sin multiplicar por volumen)
  assert.match(workspaceSource, /targetOceanFreightSale\s*=\s*Math\.round\(fleteTotalReal\s*\*\s*1\.15\s*\*\s*100\)\s*\/\s*100/);
});

test('3. En el desglose final, la suma es estrictamente: Total Flete (MT o Lumpsum) + Total Costes FOB', () => {
  assert.match(workspaceSource, /finalTotalSale\s*=\s*Math\.round\(\(subtotalFreightSale\s*\+\s*subtotalFobOperationsSale\)\s*\*\s*100\)\s*\/\s*100/);
  assert.match(workspaceSource, /finalTotalSale\s*=\s*Math\.round\(\(subtotalVentaFleteMaritimo\s*\+\s*subtotalVentaFobOperativa\)\s*\*\s*100\)\s*\/\s*100/);
});

test('4. UI no muestra mención a "Tarifa All-In: $X / RT (W/M)" en la tarjeta final', () => {
  assert.doesNotMatch(workspaceSource, /Tarifa All-In:[^/]+\/\s*RT\s*\(W\/M\)/);
  assert.match(workspaceSource, /Precio Único:\s*\$\{\(toneladas\s*>\s*0\s*\?\s*\(finalTotalSale\s*\/\s*toneladas\)\.toFixed\(2\)\s*:\s*'0\.00'\)\}\s*USD\/MT/);
  assert.match(workspaceSource, /Total Lumpsum All-In:/);
});

test('5. Cabecera estática "UNIVERSAL FORWARDING / B2B MODULE" ha sido eliminada y sustituida', () => {
  assert.doesNotMatch(workspaceSource, /Universal Forwarding\s*\/\s*B2B Module/);
  assert.doesNotMatch(workspaceSource, /UNIVERSAL FORWARDING\s*\/\s*B2B MODULE/);
  assert.match(workspaceSource, /RODAHMAR SHIPPING SL/);
  assert.match(workspaceSource, /OFERTA COMERCIAL - PROJECT CARGO/);
});
