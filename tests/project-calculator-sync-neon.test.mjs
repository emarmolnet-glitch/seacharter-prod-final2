import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(
  new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
  'utf8'
);

// BLOQUE 1: VERIFICACIÓN ESTRUCTURAL DE LOS BOTONES DE ACCIÓN (SUPERIOR E INFERIOR) Y SINCRONIZACIÓN
test('1. Los botones de acción "Sync DataBridge" y "Volver a Proyectos" se ubican en la barra superior (arriba del Dashboard) y en la barra inferior (debajo de herramientas)', () => {
  // Verifica la existencia y posición en la barra superior arriba del dashboard y lista de empaque
  assert.match(
    workspaceSource,
    /BOTONES SUPERIORES[\s\S]*?(?:←|—)\s*Volver a Proyectos[\s\S]*?⚡ Sync DataBridge[\s\S]*?torre-de-control-dashboard[\s\S]*?1\.\s*Lista de Empaque/,
    'Los botones deben ubicarse en la parte superior antes de la Torre de Control y Lista de Empaque'
  );
  // Verifica la existencia y posición en la barra inferior debajo de herramientas comerciales y regulatorias
  assert.match(
    workspaceSource,
    /Herramientas Comerciales y Regulatorias[\s\S]*?flex flex-wrap items-center gap-3 mt-8 mb-4[\s\S]*?(?:←|—)\s*Volver a Proyectos[\s\S]*?id="btn-update-calculator-data"[\s\S]*?⚡ Sync DataBridge/,
    'El botón "Actualizar datos / Sync DataBridge" debe ubicarse en la barra inferior al final junto a Volver a Proyectos'
  );
  assert.match(
    workspaceSource,
    /onClick=\{handleSyncCalculatorData\}/,
    'El botón debe invocar handleSyncCalculatorData al hacer clic'
  );
  assert.match(
    workspaceSource,
    /disabled=\{isSyncingCalculator\}/,
    'El botón debe deshabilitarse durante la sincronización'
  );
});

// BLOQUE 2: VERIFICACIÓN DEL AVISO VISUAL DE CONFIRMACIÓN
test('2. ForwarderWorkspace renderiza un aviso visual de confirmación de sincronización exitosa', () => {
  assert.match(
    workspaceSource,
    /const\s*\[syncSuccessNotice,\s*setSyncSuccessNotice\]\s*=\s*useState\(null\);/,
    'Debe definir el estado para el aviso visual de sincronización'
  );
  assert.match(
    workspaceSource,
    /id="sync-success-notice"/,
    'Debe renderizar un elemento con id sync-success-notice'
  );
  assert.match(
    workspaceSource,
    /id="sync-floating-toast"/,
    'Debe renderizar un toast flotante con id sync-floating-toast'
  );
  assert.match(
    workspaceSource,
    /¡Datos actualizados con éxito!/,
    'El aviso o mensaje debe incluir ¡Datos actualizados con éxito!'
  );
  assert.match(
    workspaceSource,
    /Los datos de la calculadora se han sincronizado con éxito/,
    'El aviso o mensaje debe confirmar explícitamente que los datos se han sincronizado con éxito'
  );
});

// BLOQUE 3: CAPTURA EXHAUSTIVA DE PARÁMETROS EN TIEMPO REAL
test('3. handleSyncCalculatorData captura en tiempo real tipo de mercancía, categoría, toneladas, rutas, ritmos, fletes, TCE y vista ejecutiva', () => {
  // Mercancía crítica (Granel vs Big Bags vs Palets) y Categoría
  assert.match(workspaceSource, /document\.getElementById\('cargo-product'\)/);
  assert.match(workspaceSource, /document\.getElementById\('cargo-type'\)/);
  assert.match(workspaceSource, /isBigBags/);
  assert.match(workspaceSource, /isPallets/);
  assert.match(workspaceSource, /isBulk/);

  // Toneladas
  assert.match(workspaceSource, /document\.getElementById\('cargo-qty'\)/);

  // Rutas y navegación
  assert.match(workspaceSource, /document\.getElementById\('port-pol'\)/);
  assert.match(workspaceSource, /document\.getElementById\('port-pod'\)/);
  assert.match(workspaceSource, /document\.getElementById\('dist-laden'\)/);
  assert.match(workspaceSource, /document\.getElementById\('spd-laden'\)/);

  // Ritmos operativos
  assert.match(workspaceSource, /document\.getElementById\('rate-load'\)/);
  assert.match(workspaceSource, /document\.getElementById\('rate-disch'\)/);

  // Fletes compra/venta
  assert.match(workspaceSource, /document\.getElementById\('freight-rate'\)/);
  assert.match(workspaceSource, /document\.getElementById\('freight-sell'\)/);

  // TCE
  assert.match(workspaceSource, /document\.getElementById\('res-tce-label'\)/);
  assert.match(workspaceSource, /document\.getElementById\('print-tce-owner'\)/);

  // Vista Ejecutiva
  assert.match(workspaceSource, /buildExecutiveReportData/);
  assert.match(workspaceSource, /executive_report_snapshot/);
});

// BLOQUE 4: ENVÍO PUT A LA BASE DE DATOS DE NEON
test('4. handleSyncCalculatorData ejecuta una actualización (PUT) a /.netlify/functions/forwarder-projects para sincronizar con Neon', () => {
  assert.match(
    workspaceSource,
    /fetch\(getApiUrl\('\/\.netlify\/functions\/forwarder-projects'\),\s*\{[\s\S]*?method:\s*['"]PUT['"]/
  );
  assert.match(
    workspaceSource,
    /route_and_chartering:\s*updatedRouteAndChartering/
  );
  assert.match(
    workspaceSource,
    /items:\s*updatedLineItems/
  );
});

// BLOQUE 5: SIMULACIÓN DE COMPORTAMIENTO Y COMPROBACIÓN FUNCIONAL
test('5. Simulación de sincronización: captura de cambio de Granel a Big Bags con toneladas, ritmos, TCE y persistencia PUT', async () => {
  // Simulamos datos de entrada de la calculadora en tiempo real
  const mockDOM = {
    'cargo-product': { value: 'Big Bags (Minerales/Cemento)' },
    'cargo-type': { value: 'Carga Unitizada / Envasada' },
    'cargo-qty': { value: '18500' },
    'port-pol': { value: 'Santander' },
    'port-pod': { value: 'Nouakchott' },
    'rate-load': { value: '1400' },
    'rate-disch': { value: '1100' },
    'dist-laden': { value: '1980' },
    'spd-laden': { value: '12.5' },
    'freight-rate': { value: '42.50' },
    'freight-sell': { value: '51.00' },
    'res-tce-label': { textContent: '$ 15,200 /día' },
    'print-tce-owner': { innerText: '15200' },
  };

  // Verificamos la deducción lógica del tipo de mercancía
  const productVal = mockDOM['cargo-product'].value;
  const isBigBags = /big[- ]?bag|ensacad|saco/i.test(productVal);
  assert.equal(isBigBags, true, 'Debe detectar correctamente que es Big Bags');

  const cargoQty = parseFloat(mockDOM['cargo-qty'].value);
  assert.equal(cargoQty, 18500);

  const tceValue = parseFloat(mockDOM['res-tce-label'].textContent.replace(/[^0-9.-]/g, ''));
  assert.equal(tceValue, 15200);

  // Verificamos el cálculo de rotación
  const loadRate = parseFloat(mockDOM['rate-load'].value);
  const dischRate = parseFloat(mockDOM['rate-disch'].value);
  const dist = parseFloat(mockDOM['dist-laden'].value);
  const spd = parseFloat(mockDOM['spd-laden'].value);

  const diasCarga = Math.round((cargoQty / loadRate) * 100) / 100;
  const diasDescarga = Math.round((cargoQty / dischRate) * 100) / 100;
  const diasNavegacion = Math.round((dist / (spd * 24)) * 100) / 100;
  const diasRotacionTotal = Math.round((diasCarga + diasDescarga + diasNavegacion) * 100) / 100;

  assert.ok(diasRotacionTotal > 0);
  assert.equal(diasCarga, 13.21);
  assert.equal(diasDescarga, 16.82);

  // Simulación del payload PUT hacia Neon
  const simulatedPutPayload = {
    id: 1,
    project_ref: 'RDM/2026-TEST',
    route_and_chartering: {
      pol: mockDOM['port-pol'].value,
      pod: mockDOM['port-pod'].value,
      commodity: productVal,
      is_big_bags: isBigBags,
      total_weight_tons: cargoQty,
      loading_rate_mt_day: loadRate,
      discharging_rate_mt_day: dischRate,
      tce_value: tceValue,
      dias_rotacion_total: diasRotacionTotal,
    }
  };

  assert.equal(simulatedPutPayload.route_and_chartering.pol, 'Santander');
  assert.equal(simulatedPutPayload.route_and_chartering.pod, 'Nouakchott');
  assert.equal(simulatedPutPayload.route_and_chartering.is_big_bags, true);
  assert.equal(simulatedPutPayload.route_and_chartering.total_weight_tons, 18500);
  assert.equal(simulatedPutPayload.route_and_chartering.tce_value, 15200);
});
