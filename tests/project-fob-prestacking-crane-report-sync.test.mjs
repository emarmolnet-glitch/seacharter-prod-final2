import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

function createHandler(sourceCode, mockGenAI) {
  const cleanCode = sourceCode
    .replace(/import\s+{\s*GoogleGenerativeAI\s*}\s+from\s+["']@google\/generative-ai["'];?/, '')
    .replace(/import\s+{\s*Buffer\s*}\s+from\s+["']node:buffer["'];?/, '')
    .replace(/export\s+default\s+handler;?/, '')
    .replace(/export\s+async\s+function\s+handler/, 'async function handler');

  const fn = new Function('GoogleGenerativeAI', 'Buffer', `${cleanCode}\nreturn handler;`);
  return fn(mockGenAI, Buffer);
}

const mockGenAI = class {
  getGenerativeModel() {
    return {
      generateContent: async () => ({
        response: { text: () => JSON.stringify({ success: true, items: [] }) }
      })
    };
  }
};

const handler = createHandler(projectParserSource, mockGenAI);

// ============================================================================
// 1. REGLA DE ACUMULACIÓN EN MUELLE: PRE-STACKING 70% Y ALMACENAJE PORTUARIO
// ============================================================================

test('1. Pre-Stacking 70%: 10.000 MT cemento en Big Bags exige acopio previo en muelle del 70% (7.000 MT) con almacenaje y manipulación inicial', () => {
  const items = [
    {
      id: 'cement-10k',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento Gris Portland',
      quantity: 10000, // 10.000 sacos de 1.000 kg = 10.000 MT
      weight: 1000,
      length: 1.0,
      width: 1.0,
      height: 1.2,
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  assert.equal(orderTotals.totalWeightTons, 10000);

  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  // Perfil debe registrar regla de pre-stacking y grúa móvil portuaria
  assert.equal(operationalProfile.isMassiveOrBigBags, true);
  assert.ok(operationalProfile.preStackingRule, 'Debe incluir preStackingRule en el perfil operativo');
  assert.equal(operationalProfile.preStackingRule.percentage, 70);

  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    usePortCrane: true,
    craneType: 'port_crane',
  });

  const fobItems = breakdown.fobAndPortOperations.items;

  // 1. Partida de Almacenaje Portuario Pre-Stacking 70%
  const preStackStorage = fobItems.find(it => it.concept.includes('Pre-Stacking 70%') && it.concept.includes('Almacenaje Portuario'));
  assert.ok(preStackStorage, 'Debe incluir partida de almacenaje portuario y estadía previa por pre-stacking del 70%');
  assert.equal(preStackStorage.preStackedTons, 7000, 'Volumen pre-acopiado debe ser de 7.000 MT (70% de 10.000 MT)');
  assert.ok(preStackStorage.units >= 5, 'Días de estadía previa deben ser al menos 5 días');
  assert.ok(preStackStorage.amount > 0, 'Coste de almacenaje portuario pre-stacking debe ser mayor a cero');

  // 2. Partida de Manipulación Inicial y Acopio en Muelle
  const initialHandling = fobItems.find(it => it.concept.includes('Manipulación Inicial') && it.concept.includes('Pre-Stacking 70%'));
  assert.ok(initialHandling, 'Debe incluir partida de manipulación inicial y descarga inland a explanada');
  assert.equal(initialHandling.preStackedTons, 7000);
  assert.ok(initialHandling.amount > 0, 'Coste de manipulación inicial debe ser mayor a cero');

  // 3. Superación obligatoria del modelo infravalorado previo (13.035 €)
  const totalFob = breakdown.fobAndPortOperations.subtotal;
  assert.ok(
    totalFob > 30000,
    `El coste FOB total (${totalFob} €) debe corregir y superar ampliamente el modelo infravalorado de 13.035 € incorporando pre-stacking`
  );
});

// ============================================================================
// 2. INCLUSIÓN OBLIGATORIA DEL ALQUILER DE GRÚA PORTUARIA PARA SPREADER
// ============================================================================

test('2. Grúa Portuaria Spreader: Añade automáticamente el coste de alquiler de grúa móvil portuaria y operador por jornada', () => {
  const items = [
    {
      id: 'urea-3k',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Urea Granulada',
      quantity: 3000, // 3000 sacos de 1000 kg = 3000 MT
      weight: 1000,
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    usePortCrane: true,
  });

  const fobItems = breakdown.fobAndPortOperations.items;

  // Grúa móvil portuaria presente con operador por jornada
  const portCraneItem = fobItems.find(it => it.concept.includes('Alquiler de Grúa Móvil Portuaria y Operador'));
  assert.ok(portCraneItem, 'Debe incluir partida de alquiler de grúa móvil portuaria y operador');
  assert.equal(portCraneItem.category, 'Equipos Auxiliares');
  assert.equal(portCraneItem.unitCost, 1800, 'Tarifa por jornada/turno debe ser de 1.800 €');
  assert.ok(portCraneItem.units >= 1, 'Debe computar al menos 1 jornada');
  assert.ok(portCraneItem.amount >= 1800, 'Importe grúa portuaria debe ser >= 1.800 €');

  // No debe aparecer como 0 en equipos auxiliares
  const auxiliaryTotal = fobItems
    .filter(it => it.category === 'Equipos Auxiliares')
    .reduce((sum, it) => sum + (it.amount || 0), 0);
  assert.ok(auxiliaryTotal > 0, 'Equipos auxiliares no debe ser cero cuando se usa spreader/grúa portuaria');
});

// ============================================================================
// 3. SINCRONIZACIÓN Y DESBLOQUEO DEL REPORTE EJECUTIVO EN FORWARDERWORKSPACE
// ============================================================================

test('3. Sincronización Reporte Ejecutivo: buildExecutiveReportData y propagación completa de subtotales', () => {
  // 1. ForwarderWorkspace implementa buildExecutiveReportData para recopilar snapshot completo
  assert.match(workspaceSource, /const\s+buildExecutiveReportData\s*=\s*\(/);

  // 2. Reporte Ejecutivo recoge Flete TCE, Subtotal FOB, Costes de Grúa y Almacenaje
  assert.match(workspaceSource, /subtotalFreight:\s*fleteCostNum\.toFixed\(2\)/);
  assert.match(workspaceSource, /subtotalFobOperations:\s*fobSubtotal\.toFixed\(2\)/);
  assert.match(workspaceSource, /craneCostNum:/);
  assert.match(workspaceSource, /storageCostNum/);

  // 3. handleSaveProjectCargo almacena snapshot completo en payload_data
  assert.match(workspaceSource, /executive_report_snapshot:\s*currentReportSnapshot/);
  assert.match(workspaceSource, /setReportData\(currentReportSnapshot\)/);

  // 4. Modal se oculta cuando showExecutiveReport está activo para evitar "estado prisionero"
  assert.match(workspaceSource, /isCargoModalOpen\s*&&\s*!showExecutiveReport/);

  // 5. Botón de cierre o salida fluido devuelve el control inmediatamente
  assert.match(workspaceSource, /id="btn-close-executive-report"[\s\S]*?onClick=\{\(\)\s*=>\s*setShowExecutiveReport\(false\)\}/);

  // 6. Listener para tecla Escape para salida rápida sin bloqueo
  assert.match(workspaceSource, /e\.key\s*===\s*['"]Escape['"]/);

  // 7. Renderizado del reporte lee activeReport (reportData || buildExecutiveReportData())
  assert.match(workspaceSource, /const\s+activeReport\s*=\s*reportData\s*\|\|\s*buildExecutiveReportData\(\)/);
  assert.match(workspaceSource, /formatCurrency\(activeReport\.subtotalFreight/);
  assert.match(workspaceSource, /formatCurrency\(activeReport\.subtotalFobOperations/);
});

// ============================================================================
// 4. PRE-STACKING DÍAS REALES (EVITAR "0 d") Y ETIQUETA "MERCANCÍA"
// ============================================================================

test('4. Pre-Stacking días reales (no "0 d") e interpolación de preStackingDays en backend y frontend', () => {
  const items = [
    {
      id: 'bulk-item-1',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento Gris',
      quantity: 5000,
      weight: 1000,
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  // Caso 1: storageDays = 0 o sin definir -> preStackingDays debe ser al menos 5 y reflejarse en la descripción
  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    storageDays: 0,
    customsCost: 450,
  });

  const fobItems = breakdown.fobAndPortOperations.items;
  const preStackItem = fobItems.find(it => it.concept.includes('Almacenaje Portuario y Acopio Previo'));
  assert.ok(preStackItem, 'Debe existir partida de Almacenaje Portuario y Acopio Previo');
  assert.doesNotMatch(preStackItem.description, /\(0\s*d\)/, 'La descripción de almacenaje no debe mostrar "(0 d)"');
  assert.match(preStackItem.description, /\(5\s*d\)/, 'La descripción de almacenaje debe interpolar (5 d)');
  assert.equal(breakdown.preStackingDays, 5, 'preStackingDays en breakdown debe ser 5');

  // Partida de aduanas debe llamarse Mercancía
  const customsItem = fobItems.find(it => it.amount === 450);
  assert.ok(customsItem, 'Debe existir la partida de trámites/aduanas');
  assert.match(customsItem.concept, /Mercancía/i, 'El concepto debe contener Mercancía en lugar de Aduanas');

  // Frontend ForwarderWorkspace
  assert.match(workspaceSource, /preStackingDays/, 'ForwarderWorkspace debe utilizar preStackingDays');
  assert.doesNotMatch(workspaceSource, /Almacenaje muelle \(0 d\)/, 'ForwarderWorkspace no debe tener hardcoded "(0 d)"');
  assert.match(workspaceSource, /Mercancía \(€\)/, 'ForwarderWorkspace debe mostrar etiqueta Mercancía (€)');
  assert.match(workspaceSource, /Logística Periférica \(Almacenaje Portuario, Surveyor, Transporte Inland, Mercancía\)/, 'Fila 4 debe usar Mercancía');
});
