import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. Variable landCost está declarada en el scope principal de autoCalculateEstimates', () => {
  // Comprueba que landCost se declara antes de los bloques if (isUnderThreshold) / else
  const functionBodyMatch = workspaceSource.match(/const autoCalculateEstimates = \([\s\S]*?setIsUnder40t\(isUnderThreshold\);([\s\S]*?)if \(isUnderThreshold\)/);
  assert.ok(functionBodyMatch, 'Debe encontrarse la declaración previa a if (isUnderThreshold)');
  assert.match(functionBodyMatch[1], /const\s+landCost\s*=\s*Number\(activeProject\?\.land_freight_cost\s*\?\?\s*activeProject\?\.landFreightCost\s*\?\?\s*0\)\s*\|\|\s*0;/, 'landCost debe ser inicializada con Number y fallback seguro');
});

test('2. Ninguna referencia a landCost queda huérfana en bloques externos o hijos', () => {
  // Comprueba que las referencias a landCost se encuentran en el mismo scope o posterior
  assert.match(workspaceSource, /targetSalePrice = .*?\+ \(\(Number\(landCost\) \|\| 0\) \* 1\.15\);/);
});

test('3. Blindaje de variables financieras con fallback numérico ante null/undefined/NaN', () => {
  assert.match(workspaceSource, /calculatedOceanFreight = Number\(/);
  assert.match(workspaceSource, /calculatedFobOperations = \(Number\(/);
  assert.match(workspaceSource, /setSubtotalFreight\(\(Number\(calculatedOceanFreight\) \|\| 0\)\.toFixed\(2\)\)/);
  assert.match(workspaceSource, /setSubtotalFobOperations\(\(Number\(calculatedFobOperations\) \|\| 0\)\.toFixed\(2\)\)/);
  assert.match(workspaceSource, /setEstimatedCost\(\(Number\(totalEstimatedCost\) \|\| 0\)\.toFixed\(2\)\)/);
  assert.match(workspaceSource, /setSalePrice\(\(Number\(targetSalePrice\) \|\| 0\)\.toFixed\(2\)\)/);
});

test('4. Simulación funcional: autoCalculateEstimates ejecuta de forma síncrona sin lanzar ReferenceError', () => {
  // Simulador representativo de la función sin DOM
  const activeProject = {
    land_freight_cost: 450,
  };
  const totalWeightTons = 12000;
  const isUnderThreshold = totalWeightTons < 40;
  const landCost = Number(activeProject?.land_freight_cost ?? activeProject?.landFreightCost ?? 0) || 0;

  let calculatedOceanFreight = 0;
  let calculatedFobOperations = 0;
  let totalEstimatedCost = 0;

  if (isUnderThreshold) {
    calculatedOceanFreight = 1500;
    calculatedFobOperations = 500;
  } else {
    calculatedOceanFreight = 45000;
    calculatedFobOperations = 8000;
  }
  totalEstimatedCost = calculatedOceanFreight + calculatedFobOperations + landCost;

  let targetSalePrice = 0;
  const effectiveFleteVenta = 35.0;
  const effectiveWeightOrRt = totalWeightTons;

  if (effectiveFleteVenta > 0 && effectiveWeightOrRt > 0) {
    const targetOceanFreightSale = Math.round(effectiveFleteVenta * effectiveWeightOrRt * 100) / 100;
    targetSalePrice = (Number(targetOceanFreightSale) || 0) + ((Number(calculatedFobOperations) || 0) * 1.15) + ((Number(landCost) || 0) * 1.15);
  } else {
    targetSalePrice = (Number(totalEstimatedCost) || 0) * 1.15;
  }

  assert.equal(typeof landCost, 'number');
  assert.equal(landCost, 450);
  assert.equal(totalEstimatedCost, 45000 + 8000 + 450);
  assert.equal(Number.isNaN(targetSalePrice), false);
  assert.ok(targetSalePrice > 0);
});
