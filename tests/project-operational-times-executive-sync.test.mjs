import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(
  new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
  'utf8'
);

const engineSource = readFileSync(
  new URL('../voyage-cost-engine.js', import.meta.url),
  'utf8'
);

const indexSource = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
);

// ============================================================================
// BLOQUE 1: LA VISTA EJECUTIVA PUBLICA LOS TIEMPOS OPERATIVOS OFICIALES
// ============================================================================

test('1. voyage-cost-engine publica executiveOperationalTimes con seaDays, portDays y totalDays en el dashboard ejecutivo', () => {
  // Verificación en updateExecutiveDashboard
  assert.match(
    engineSource,
    /root\.executiveOperationalTimes\s*=\s*execTimes;/,
    'Debe asignar executiveOperationalTimes en root'
  );
  assert.match(
    engineSource,
    /root\.State\.executiveOperationalTimes\s*=\s*execTimes;/,
    'Debe sincronizar executiveOperationalTimes en root.State'
  );
  assert.match(
    engineSource,
    /seaDays:\s*toNumber\(calcResults\.seaDays\)/,
    'Debe registrar seaDays normalizado'
  );
  assert.match(
    engineSource,
    /portDays:\s*toNumber\(calcResults\.portDays\)/,
    'Debe registrar portDays normalizado'
  );
  assert.match(
    engineSource,
    /totalDays:\s*toNumber\(calcResults\.totalDays\)/,
    'Debe registrar totalDays normalizado'
  );
});

test('2. index.html expone window.executiveOperationalTimes al invocar syncExecutiveDashboard', () => {
  assert.match(
    indexSource,
    /window\.executiveOperationalTimes\s*=\s*\{[\s\S]*?seaDays:\s*T_sea,[\s\S]*?portDays:\s*T_port,[\s\S]*?totalDays:\s*totalDays[\s\S]*?\}/,
    'Debe registrar window.executiveOperationalTimes con T_sea, T_port y totalDays'
  );
});

// ============================================================================
// BLOQUE 2: CAPTURA DE TIEMPOS DE LA VISTA EJECUTIVA EN EL EXPEDIENTE DE PROYECTOS
// ============================================================================

test('3. readActiveCalculatorSession extrae los tiempos de la Vista Ejecutiva (DOM, window y State)', () => {
  assert.match(
    workspaceSource,
    /document\.getElementById\('exec-sea-days'\)/,
    'Debe leer el elemento DOM exec-sea-days'
  );
  assert.match(
    workspaceSource,
    /document\.getElementById\('exec-port-days'\)/,
    'Debe leer el elemento DOM exec-port-days'
  );
  assert.match(
    workspaceSource,
    /document\.getElementById\('exec-total-days'\)/,
    'Debe leer el elemento DOM exec-total-days'
  );
  assert.match(
    workspaceSource,
    /window\.executiveOperationalTimes/,
    'Debe consultar window.executiveOperationalTimes'
  );
  assert.match(
    workspaceSource,
    /execSeaDays,[\s\S]*?execPortDays,[\s\S]*?execTotalDays,/,
    'Debe retornar execSeaDays, execPortDays y execTotalDays'
  );
});

test('4. ForwarderWorkspace implementa helper getExecutiveOperationalTimes y lo expone en window', () => {
  assert.match(
    workspaceSource,
    /const\s+getExecutiveOperationalTimes\s*=\s*\(sourceRoute\s*=\s*null\)\s*=>/,
    'Debe definir el helper getExecutiveOperationalTimes'
  );
  assert.match(
    workspaceSource,
    /window\.getExecutiveOperationalTimes\s*=\s*getExecutiveOperationalTimes/,
    'Debe registrar getExecutiveOperationalTimes en window'
  );
});

// ============================================================================
// BLOQUE 3: SINCRONIZACIÓN AL GUARDAR Y EN EL REPORTE EJECUTIVO
// ============================================================================

test('5. handleSyncCalculatorData guarda exactamente los días de la Vista Ejecutiva en lugar de fórmulas aisladas', () => {
  assert.match(
    workspaceSource,
    /const\s+execTimes\s*=\s*getExecutiveOperationalTimes\(\);/,
    'handleSyncCalculatorData debe consultar getExecutiveOperationalTimes'
  );
  assert.match(
    workspaceSource,
    /const\s+diasNavegacion\s*=\s*\(execTimes\.seaDays\s*!==\s*null\s*&&\s*execTimes\.seaDays\s*>\s*0\)\s*\?\s*execTimes\.seaDays/,
    'diasNavegacion debe priorizar execTimes.seaDays de la Vista Ejecutiva'
  );
  assert.match(
    workspaceSource,
    /const\s+diasMuelle\s*=\s*\(execTimes\.portDays\s*!==\s*null\s*&&\s*execTimes\.portDays\s*>\s*0\)\s*\?\s*execTimes\.portDays/,
    'diasMuelle debe priorizar execTimes.portDays de la Vista Ejecutiva'
  );
  assert.match(
    workspaceSource,
    /const\s+diasRotacionTotal\s*=\s*\(execTimes\.totalDays\s*!==\s*null\s*&&\s*execTimes\.totalDays\s*>\s*0\)\s*\?\s*execTimes\.totalDays/,
    'diasRotacionTotal debe priorizar execTimes.totalDays de la Vista Ejecutiva'
  );
  assert.match(
    workspaceSource,
    /sea_days:\s*diasNavegacion,[\s\S]*?port_days:\s*diasMuelle,[\s\S]*?total_days:\s*diasRotacionTotal,/,
    'Debe persistir sea_days, port_days y total_days sincronizados en updatedRouteAndChartering'
  );
});

test('6. buildExecutiveReportData adopta la Vista Ejecutiva para días de viaje y rotación', () => {
  assert.match(
    workspaceSource,
    /const\s+execTimes\s*=\s*getExecutiveOperationalTimes\(sourcePayload\?\.route_and_chartering\);/,
    'buildExecutiveReportData debe consultar los tiempos de la Vista Ejecutiva'
  );
  assert.match(
    workspaceSource,
    /diasMuelle,[\s\S]*?diasNavegacion,[\s\S]*?diasRotacionTotal,[\s\S]*?seaDays:\s*diasNavegacion,[\s\S]*?portDays:\s*diasMuelle,[\s\S]*?totalDays:\s*diasRotacionTotal,/,
    'buildExecutiveReportData debe exportar días sincronizados y propiedades normalizadas'
  );
});

// ============================================================================
// BLOQUE 4: RENDERIZADO DEL BLOQUE DE RUTA SIN FÓRMULAS DESINCRONIZADAS
// ============================================================================

test('7. getMaritimeRouteData extrae y sincroniza días náuticos con la Vista Ejecutiva para la visualización del card', () => {
  assert.match(
    workspaceSource,
    /const\s+execTimes\s*=\s*getExecutiveOperationalTimes\(rc\);/,
    'getMaritimeRouteData debe consultar getExecutiveOperationalTimes(rc)'
  );
  assert.match(
    workspaceSource,
    /seaDays:\s*diasNavegacion,[\s\S]*?portDays:\s*diasMuelle,[\s\S]*?totalDays:\s*diasRotacionTotal,/,
    'getMaritimeRouteData debe devolver seaDays, portDays y totalDays'
  );
});

test('8. Resumen dinámico en vivo del bloque de ruta (contadores) refleja exactamente la Vista Ejecutiva', () => {
  assert.match(
    workspaceSource,
    /const\s+execTimes\s*=\s*getExecutiveOperationalTimes\(activeProject\?\.route_and_chartering\);[\s\S]*?const\s+dNav\s*=\s*\(execTimes\.seaDays\s*!==\s*null\s*&&\s*execTimes\.seaDays\s*>\s*0\)\s*\?\s*execTimes\.seaDays/,
    'El bloque de ruta en vivo debe usar execTimes.seaDays para el contador de navegación'
  );
  assert.match(
    workspaceSource,
    /const\s+dPortTotal\s*=\s*\(execTimes\.portDays\s*!==\s*null\s*&&\s*execTimes\.portDays\s*>\s*0\)\s*\?\s*execTimes\.portDays/,
    'El bloque de ruta en vivo debe usar execTimes.portDays para el tiempo en puerto'
  );
  assert.match(
    workspaceSource,
    /const\s+dRot\s*=\s*\(execTimes\.totalDays\s*!==\s*null\s*&&\s*execTimes\.totalDays\s*>\s*0\)\s*\?\s*execTimes\.totalDays/,
    'El bloque de ruta en vivo debe usar execTimes.totalDays para la rotación total'
  );
});

// ============================================================================
// BLOQUE 5: SIMULACIÓN FUNCIONAL DE FUENTE DE VERDAD
// ============================================================================

test('9. Simulación: La Vista Ejecutiva prevalece sobre cálculos náuticos separados cuando difieren', () => {
  // Supongamos un viaje comercial donde la fórmula básica daría:
  // Distancia 3000 NM / (12 nudos * 24 h) = 10.42 días nav
  // Toneladas 15000 MT / 1500 carga + 15000 / 1200 descarga = 10 + 12.5 = 22.5 días muelle
  // Rotación teórica = 32.92 días
  //
  // Sin embargo, la Vista Ejecutiva incorpora márgenes meteorológicos, canales y tiempo de atraque:
  // Sea days = 14.20 días
  // Port days = 26.80 días
  // Total turnaround = 41.00 días

  const mockExecutiveTimes = {
    seaDays: 14.20,
    portDays: 26.80,
    totalDays: 41.00
  };

  function simulateOperationalDaysSync(inputDistance, inputSpeed, cargoQty, loadRate, dischRate, execTimes) {
    const rawCarga = cargoQty / loadRate;
    const rawDescarga = cargoQty / dischRate;
    const rawPortTotal = rawCarga + rawDescarga;
    const rawNav = inputDistance / (inputSpeed * 24);

    const diasNavegacion = (execTimes?.seaDays != null && execTimes.seaDays > 0)
      ? execTimes.seaDays
      : rawNav;

    const diasMuelle = (execTimes?.portDays != null && execTimes.portDays > 0)
      ? execTimes.portDays
      : rawPortTotal;

    const diasRotacionTotal = (execTimes?.totalDays != null && execTimes.totalDays > 0)
      ? execTimes.totalDays
      : diasMuelle + diasNavegacion;

    return {
      diasNavegacion,
      diasMuelle,
      diasRotacionTotal,
      rawNav,
      rawPortTotal
    };
  }

  const synced = simulateOperationalDaysSync(3000, 12, 15000, 1500, 1200, mockExecutiveTimes);

  assert.strictEqual(synced.diasNavegacion, 14.20);
  assert.strictEqual(synced.diasMuelle, 26.80);
  assert.strictEqual(synced.diasRotacionTotal, 41.00);
  assert.notStrictEqual(synced.diasNavegacion, synced.rawNav);
  assert.notStrictEqual(synced.diasMuelle, synced.rawPortTotal);
});
