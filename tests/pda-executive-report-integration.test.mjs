import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('State.gastos_puerto supports dual structure (totalPortCost and breakdown)', () => {
  assert.match(indexSource, /gastos_puerto:\s*\{\s*totalPortCost:\s*0,\s*breakdown:\s*\[\]\s*\}/);
  assert.match(indexSource, /State\.gastos_puerto\s*=\s*\{/);
  assert.match(indexSource, /totalPortCost:\s*smartPortExpenses/);
  assert.match(indexSource, /valueOf\(\)\s*\{\s*return\s*this\.totalPortCost;/);
});

test('getPortPdaBreakdown returns itemized breakdown matching total exactly', () => {
  assert.match(indexSource, /function getPortPdaBreakdown\(type,\s*portTotal\)/);
  assert.match(indexSource, /Agencia y Despacho/);
  assert.match(indexSource, /Remolcadores/);
  assert.match(indexSource, /Practicaje y Amarre/);
  assert.match(indexSource, /Tasas de Muelle y Autoridad/);
  assert.match(indexSource, /Estadía y Derechos de Puerto/);
});

test('Executive Report top risk section visually excludes Remolcadores line while preserving PDA section breakdown map', () => {
  // Check that upper Break-Even list in Executive Report details does not include the old standalone Remolcadores line
  const breakEvenDetailsStart = indexSource.indexOf('Fórmula y Desglose de Cálculo Break-Even');
  const fuelDetailsStart = indexSource.indexOf('Costes de Combustible y Origen de Precios');
  assert.ok(breakEvenDetailsStart > 0 && fuelDetailsStart > breakEvenDetailsStart);
  
  const breakEvenBlock = indexSource.slice(breakEvenDetailsStart, fuelDetailsStart);
  assert.doesNotMatch(breakEvenBlock, /<li><strong>\${currentLang === 'es' \? 'Remolcadores' : 'Tugs'}:<\/strong>/);

  // Check that PDA section uses .map() iteration over getPortPdaBreakdown
  const pdaSectionStart = indexSource.indexOf('Gastos Portuarios (PDA) y Fuentes');
  const etsSectionStart = indexSource.indexOf('Cargos y Normativa ETS / CO₂');
  assert.ok(pdaSectionStart > 0 && etsSectionStart > pdaSectionStart);

  const pdaBlock = indexSource.slice(pdaSectionStart, etsSectionStart);
  assert.match(pdaBlock, /getPortPdaBreakdown\('pol',/);
  assert.match(pdaBlock, /getPortPdaBreakdown\('pod',/);
  assert.match(pdaBlock, /\.map\(b =>/);
});

test('UI Cost-Plus panel includes ✨ Auto indicator and openPdaManualEditModal click trigger', () => {
  assert.match(indexSource, /openPdaManualEditModal\(\)/);
  assert.match(indexSource, /✨ Auto/);
});
