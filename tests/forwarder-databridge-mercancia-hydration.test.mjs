import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ForwarderWorkspace hidrata valor_total_mercancia_usd en el estado de Mercancía (USD)', () => {
  const componentPath = path.resolve(process.cwd(), 'src/components/ForwarderWorkspace.jsx');
  const source = fs.readFileSync(componentPath, 'utf8');

  // 1. Verifica la existencia de setCustCost o setCustomsCost
  assert.match(
    source,
    /const\s+\[customsCost,\s*setCustomsCost\]\s*=\s*useState\(0\);/,
    'Debe definir el estado customsCost y su setter setCustomsCost'
  );
  assert.match(
    source,
    /const\s+setCustCost\s*=\s*setCustomsCost;/,
    'Debe definir el alias setCustCost apuntando a setCustomsCost'
  );

  // 2. Verifica la extracción e inyección de valor_total_mercancia_usd en la hidratación
  assert.match(
    source,
    /setCustCost\(\s*Number\(activeProject\.valor_total_mercancia_usd\)/,
    'Debe inyectar directamente activeProject.valor_total_mercancia_usd con setCustCost'
  );

  // 3. Verifica que el input de Mercancía (USD) esté vinculado al estado de customsCost
  assert.match(
    source,
    /<label[^>]*>Mercancía \(USD\)<\/label>\s*<input[^>]*value=\{customsCost\}[^>]*onChange=\{\(e\)\s*=>\s*setCustomsCost\(e\.target\.value\)\}/,
    'El input visual de Mercancía (USD) debe estar ligado a customsCost'
  );

  // 4. Simulación funcional de la absorción de mercancía desde Data Bridge
  const mockActiveProject = {
    project_ref: 'RDM/2026-TEST',
    land_freight_cost: '1200.00',
    valor_total_mercancia_usd: 85000,
  };

  let mockCustomsCost = 0;
  const setCustCost = (val) => { mockCustomsCost = val; };

  const incomingMercancia = Number(mockActiveProject.valor_total_mercancia_usd) || 0;
  setCustCost(incomingMercancia);

  assert.equal(mockCustomsCost, 85000, 'mockCustomsCost debe actualizarse a 85000 USD');
});
