import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modalComponentSource = readFileSync(
  new URL('../src/components/VoyageExecutiveReportModal.jsx', import.meta.url),
  'utf8'
);
const entrySource = readFileSync(
  new URL('../src/voyage-executive-report-entry.jsx', import.meta.url),
  'utf8'
);
const indexHtmlSource = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
);

test('1. VoyageExecutiveReportModal define el estado booleano isClientMode inicializado en false por defecto', () => {
  assert.match(
    modalComponentSource,
    /const\s*\[\s*isClientMode\s*,\s*setIsClientMode\s*\]\s*=\s*useState\(\s*initialClientMode\s*\);/,
    'VoyageExecutiveReportModal debe definir isClientMode con useState(initialClientMode)'
  );
  assert.match(
    modalComponentSource,
    /initialClientMode\s*=\s*false/,
    'initialClientMode debe inicializarse en false por defecto'
  );
});

test('2. VoyageExecutiveReportModal importa y renderiza el Croquis Naval (<VisualStowagePlan />)', () => {
  assert.match(
    modalComponentSource,
    /import\s+VisualStowagePlan.*?from\s+['"]\.\/VisualStowagePlan\.jsx['"]/,
    'VoyageExecutiveReportModal debe importar VisualStowagePlan'
  );
  assert.match(
    modalComponentSource,
    /<VisualStowagePlan[\s\S]*?stowagePlan=\{[\s\S]*?vesselType=\{[\s\S]*?projectRef=\{/,
    'VoyageExecutiveReportModal debe renderizar <VisualStowagePlan /> con sus props'
  );

  // Verificar que el Croquis Naval se ubica entre el Resumen Operativo/Financiero y los Acordeones
  const resumenIndex = modalComponentSource.indexOf('RESUMEN OPERATIVO Y FINANCIERO');
  const croquisIndex = modalComponentSource.indexOf('executive-visual-stowage-section');
  const accordionsIndex = modalComponentSource.indexOf('executive-data-accordions');

  assert.ok(resumenIndex > 0, 'Debe contener el encabezado RESUMEN OPERATIVO Y FINANCIERO');
  assert.ok(croquisIndex > resumenIndex, 'El Croquis Naval debe estar ubicado después del resumen');
  assert.ok(accordionsIndex > croquisIndex, 'Los acordeones deben estar ubicados después del Croquis Naval');
});

test('3. Pie del modal reemplaza botón único por dos botones: "Imprimir Reporte Interno" e "Imprimir Reporte Cliente"', () => {
  assert.match(
    modalComponentSource,
    /id="btn-print-internal-report"/,
    'Debe existir el botón id="btn-print-internal-report"'
  );
  assert.match(
    modalComponentSource,
    /Imprimir Reporte Interno/,
    'Debe contener el texto Imprimir Reporte Interno'
  );
  assert.match(
    modalComponentSource,
    /id="btn-print-client-report"/,
    'Debe existir el botón id="btn-print-client-report"'
  );
  assert.match(
    modalComponentSource,
    /Imprimir Reporte Cliente/,
    'Debe contener el texto Imprimir Reporte Cliente'
  );

  // Comprobar que los botones invocan la impresión con clientMode true o false
  assert.match(
    modalComponentSource,
    /handlePrint\(false\)/,
    'El botón interno debe invocar handlePrint(false)'
  );
  assert.match(
    modalComponentSource,
    /handlePrint\(true\)/,
    'El botón cliente debe invocar handlePrint(true)'
  );
});

test('4. Modo Cliente oculta al 100% la columna ESTRUCTURA DE COSTES', () => {
  assert.match(
    modalComponentSource,
    /\{!isClientMode\s*&&\s*\([\s\S]*?id="executive-cost-structure-column"[\s\S]*?ESTRUCTURA DE COSTES/,
    'La columna ESTRUCTURA DE COSTES debe estar condicionada por {!isClientMode}'
  );
});

test('5. Modo Cliente limpia columna de Resultados Netos dejando visible ÚNICAMENTE la cifra final de venta', () => {
  // Cifra final de venta permanece visible
  assert.match(
    modalComponentSource,
    /Flete Sugerido \(Tarifa de Venta\):/,
    'Flete Sugerido / Tarifa de Venta debe existir y permanecer visible'
  );
  assert.match(
    modalComponentSource,
    /Precio Total de Venta:/,
    'Precio Total de Venta debe existir para el cliente'
  );

  // Beneficios confidenciales y TCE condicionados por !isClientMode
  assert.match(
    modalComponentSource,
    /\{!isClientMode\s*&&\s*\([\s\S]*?Beneficio Neto Fletador[\s\S]*?Beneficio Neto Armador/,
    'Beneficio Neto Armador y Fletador deben ocultarse cuando isClientMode es true'
  );
  assert.match(
    modalComponentSource,
    /\{!isClientMode\s*&&\s*\([\s\S]*?TCE Estimado Armador/,
    'TCE Estimado Armador debe ocultarse cuando isClientMode es true'
  );
});

test('6. Modo Cliente oculta los acordeones internos (Break-Even, Combustible, OPEX)', () => {
  assert.match(
    modalComponentSource,
    /\{!isClientMode\s*&&\s*\([\s\S]*?FÓRMULAS Y DESGLOSE DE CÁLCULO BREAK-EVEN/,
    'Acordeón BREAK-EVEN debe estar condicionado por !isClientMode'
  );
  assert.match(
    modalComponentSource,
    /\{!isClientMode\s*&&\s*\([\s\S]*?COSTOS DE COMBUSTIBLE/,
    'Acordeón COSTOS DE COMBUSTIBLE debe estar condicionado por !isClientMode'
  );
  assert.match(
    modalComponentSource,
    /\{!isClientMode\s*&&\s*\([\s\S]*?CÁLCULOS OPEX Y CARACTERÍSTICAS BUQUE/,
    'Acordeón CÁLCULOS OPEX debe estar condicionado por !isClientMode'
  );

  // El croquis naval y las restricciones portuarias permanecen sin depender de isClientMode
  assert.match(
    modalComponentSource,
    /RESTRICCIONES PORTUARIAS Y CONDICIONES OPERATIVAS/,
    'Restricciones portuarias deben mantenerse visibles'
  );
});

test('7. index.html integra soporte de isClientMode, botones de acción e inyección de Croquis Naval', () => {
  assert.match(
    indexHtmlSource,
    /id="btn-print-internal-report"/,
    'index.html debe contener id="btn-print-internal-report"'
  );
  assert.match(
    indexHtmlSource,
    /id="btn-print-client-report"/,
    'index.html debe contener id="btn-print-client-report"'
  );
  assert.match(
    indexHtmlSource,
    /id="report-mode-toggle-group"/,
    'index.html debe contener id="report-mode-toggle-group"'
  );
  assert.match(
    indexHtmlSource,
    /id="voyage-visual-stowage-container"/,
    'index.html debe contener id="voyage-visual-stowage-container"'
  );
  assert.match(
    indexHtmlSource,
    /src="\.\/src\/voyage-executive-report-entry\.jsx"/,
    'index.html debe importar voyage-executive-report-entry.jsx'
  );
});

test('8. buildVoyageStowagePlan genera un plan de estiba completo con bodegas segregadas y estabilidad hidrodinámica', async () => {
  const { buildVoyageStowagePlan } = await import('../src/voyage-stowage-builder.mjs');

  const testState = {
    vessel: 'Atlantic Pioneer',
    class: 'Handysize',
    dwt: 34000,
    cargo: 28000,
    cargoType: 'Trigo a Granel (Bulk Wheat)',
  };

  const plan = buildVoyageStowagePlan(testState);

  assert.ok(Array.isArray(plan.holds), 'plan.holds debe ser un array');
  assert.equal(plan.holds.length, 4, 'Handysize debe generar 4 bodegas segregadas');
  assert.equal(plan.cargoClassification.totalWeightTons, 28000, 'Peso total debe coincidir con cargo');
  assert.ok(plan.hydrodynamicsAndSafety.metacentricHeightGmEstimatedM > 1.0, 'GM debe ser positivo y seguro');
  assert.ok(plan.executiveJustification.length >= 3, 'Debe incluir justificación técnica naval');
});
