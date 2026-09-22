import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. Eliminación de Hardcoding y Valores por Defecto: Single Source of Truth para flete marítimo', () => {
  // Verifica que fleteTotalReal sea el cálculo estricto de tarifa armador * tonelaje
  assert.match(
    workspaceSource,
    /const\s+fleteTotalReal\s*=\s*\(Number\(tarifaArmadorUsdMt\)\s*\|\|\s*0\)\s*\*\s*\(Number\(quantityMT\)\s*\|\|\s*0\);/,
    'Debe definir fleteTotalReal multiplicando tarifaArmadorUsdMt por quantityMT'
  );

  // Verifica que subtotalFreight se actualice redondeando a 2 decimales
  assert.match(
    workspaceSource,
    /setSubtotalFreight\(Math\.round\(fleteTotalReal\s*\*\s*100\)\s*\/\s*100\);/,
    'Debe actualizar subtotalFreight con Math.round(fleteTotalReal * 100) / 100'
  );
});

test('2. Propagación reactiva al Coste Total All-In (estimatedCost)', () => {
  // Verifica que costeTotalAllIn sea la suma estricta de flete real + operaciones FOB
  assert.match(
    workspaceSource,
    /const\s+costeTotalAllIn\s*=\s*fleteTotalReal\s*\+\s*Number\(subtotalFobOperations\s*\|\|\s*0\);/,
    'Debe calcular costeTotalAllIn como fleteTotalReal + subtotalFobOperations'
  );

  // Verifica que estimatedCost se actualice redondeando a 2 decimales
  assert.match(
    workspaceSource,
    /setEstimatedCost\(Math\.round\(costeTotalAllIn\s*\*\s*100\)\s*\/\s*100\);/,
    'Debe actualizar estimatedCost con Math.round(costeTotalAllIn * 100) / 100'
  );
});

test('3. Hook Reactivo de cálculo financiero con dependencias explícitas', () => {
  // Verifica que exista un useEffect que escuche a tarifaArmadorUsdMt, quantityMT y subtotalFobOperations
  assert.match(
    workspaceSource,
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*?const fleteTotalReal = \(Number\(tarifaArmadorUsdMt\) \|\| 0\) \* \(Number\(quantityMT\) \|\| 0\);[\s\S]*?setSubtotalFreight\(Math\.round\(fleteTotalReal \* 100\) \/ 100\);[\s\S]*?const costeTotalAllIn = fleteTotalReal \+ Number\(subtotalFobOperations \|\| 0\);[\s\S]*?setEstimatedCost\(Math\.round\(costeTotalAllIn \* 100\) \/ 100\);[\s\S]*?\}, \[\s*tarifaArmadorUsdMt,\s*quantityMT,\s*subtotalFobOperations/,
    'El hook reactivo debe depender explícitamente de tarifaArmadorUsdMt, quantityMT y subtotalFobOperations'
  );
});

test('4. Capacidad de introducir tarifas personalizadas directamente en la interfaz (32.25 USD/MT o 50.00 USD/MT)', () => {
  // Verifica que el campo de Flete Sugerido Armador sea editable para permitir al usuario introducir cotizaciones directas
  assert.match(
    workspaceSource,
    /<input[^>]*id="modal-flete-sugerido-armador"[^>]*onChange=/,
    'El flete sugerido del armador debe ser un input editable con onChange'
  );
  assert.match(
    workspaceSource,
    /<input[^>]*id="modal-flete-sugerido-fletador"[^>]*onChange=/,
    'El flete sugerido del fletador debe ser un input editable con onChange'
  );
});

test('5. Simulación matemática de cálculo financiero B2B con flete dinámico', () => {
  const simularCalculoFinanciero = (tarifaArmadorUsdMt, quantityMT, subtotalFobOperations) => {
    const fleteTotalReal = (Number(tarifaArmadorUsdMt) || 0) * (Number(quantityMT) || 0);
    const subtotalFreight = Math.round(fleteTotalReal * 100) / 100;
    const costeTotalAllIn = fleteTotalReal + Number(subtotalFobOperations || 0);
    const estimatedCost = Math.round(costeTotalAllIn * 100) / 100;
    return { subtotalFreight, estimatedCost };
  };

  // Escenario A: Usuario introduce 32.25 USD/MT para 1,500 MT con 4,250 USD de costes FOB
  const casoA = simularCalculoFinanciero(32.25, 1500, 4250);
  assert.equal(casoA.subtotalFreight, 48375.00);
  assert.equal(casoA.estimatedCost, 52625.00);

  // Escenario B: Usuario introduce 50.00 USD/MT para 3,000 MT con 12,300.50 USD de costes FOB
  const casoB = simularCalculoFinanciero(50.00, 3000, 12300.50);
  assert.equal(casoB.subtotalFreight, 150000.00);
  assert.equal(casoB.estimatedCost, 162300.50);

  // Escenario C: Manejo defensivo ante valores vacíos o nulos
  const casoC = simularCalculoFinanciero(null, undefined, 0);
  assert.equal(casoC.subtotalFreight, 0.00);
  assert.equal(casoC.estimatedCost, 0.00);
});
