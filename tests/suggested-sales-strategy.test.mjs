import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Ventas Sugeridas calculates using Flete Objetivo Mercado when USAR MERCADO is active and Break-Even when USAR COST-PLUS is active', () => {
  assert.match(indexSource, /isMarketStrategyActive\s*&&\s*fleteObjetivoMercado\s*>\s*0/);
  assert.match(indexSource, /const fleteMinimoBaseVenta = isMarketStrategyActive && fleteObjetivoMercado > 0\s*\?\s*fleteObjetivoMercado\s*:\s*breakEvenParaVentaSugerida;/);
});

test('PDA auto-calculation matrix connects vessel technical inputs (GT, LOA, DWT) without staying at zero or showing incomplete alerts', () => {
  assert.match(indexSource, /autoFillPDA\('pol',\s*false\)/);
  assert.match(indexSource, /autoFillPDA\('pod',\s*false\)/);
  assert.match(indexSource, /gtFactor/);
  assert.match(indexSource, /loaFactor/);
  assert.match(indexSource, /pdaPolVal\s*<=\s*0/);
});
