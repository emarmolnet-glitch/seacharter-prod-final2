import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Ventas Sugeridas calculates using Flete Objetivo Mercado when USAR MERCADO is active and Break-Even when USAR COST-PLUS is active', () => {
  assert.match(indexSource, /isMarketStrategyActive\s*&&\s*fleteObjetivoMercado\s*>\s*0/);
  assert.match(indexSource, /const fleteMinimoBaseVenta = breakEvenParaVentaSugerida;/);
  assert.match(indexSource, /precioObjetivoFletador = fleteObjetivoMercado;/);
  assert.match(indexSource, /precioObjetivoArmador = calcularPrecioObjetivo\(fleteMinimoBaseVenta, marginOwner\);/);
});

test('PDA auto-calculation matrix connects vessel technical inputs (GT, LOA, DWT) without staying at zero or showing incomplete alerts', () => {
  assert.match(indexSource, /autoFillPDA\('pol',\s*false\)/);
  assert.match(indexSource, /autoFillPDA\('pod',\s*false\)/);
  assert.match(indexSource, /gtFactor/);
  assert.match(indexSource, /loaFactor/);
  assert.match(indexSource, /pdaPolVal\s*<=\s*0/);
});

test('USAR MERCADO mode isolates cost break-even from market rate benchmark and prevents feedback loop', () => {
  assert.match(indexSource, /const costPlusMinimumFreight = Number\.isFinite\(costPlusResults\?\.\s*minFreightRate\)/);
  assert.match(indexSource, /const benchmarkBase = isCostPlusMode\s*\?\s*\(/);
  assert.doesNotMatch(indexSource, /costPlusMinimumFreight\s*=\s*isMarketStrategyActive/);
});
