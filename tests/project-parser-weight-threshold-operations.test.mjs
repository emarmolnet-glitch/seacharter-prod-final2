import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');

function createHandler(sourceCode, mockGenAI) {
  const cleanCode = sourceCode
    .replace(/import\s+{\s*GoogleGenerativeAI\s*}\s+from\s+["']@google\/generative-ai["'];?/, '')
    .replace(/import\s+{\s*Buffer\s*}\s+from\s+["']node:buffer["'];?/, '')
    .replace(/export\s+default\s+handler;?/, '')
    .replace(/export\s+async\s+function\s+handler/, 'async function handler');

  const fn = new Function('GoogleGenerativeAI', 'Buffer', `${cleanCode}\nreturn handler;`);
  return fn(mockGenAI || class DummyAI {}, Buffer);
}

const handler = createHandler(projectParserSource);
const {
  calculateOrderTotals,
  evaluateCharteringModel,
  buildOperationalProfile,
  evaluateOrderPortOperations,
  isBulkOrBigBagsCargo,
  WEIGHT_THRESHOLD_TONS,
} = handler;

// ============================================================================
// 1. SUMA DEL PESO TOTAL ACUMULADO DE TODOS LOS ÍTEMS DE LA ORDEN
// ============================================================================

test('1. calculateOrderTotals: suma con precisión el peso total acumulado en kg y toneladas', () => {
  const items = [
    {
      id: 'item-1',
      type: 'Big Bags de Sulfato Amónico',
      quantity: 15,
      weight: 1250, // 15 * 1250 = 18,750 kg
      length: 1.0,
      width: 1.0,
      height: 1.2,
      category: 'Mercancía Ensacada / Dry Bulk',
      shipping_mode_supported: 'Big Bags / Granel',
    },
    {
      id: 'item-2',
      type: 'Big Bags de Urea Granulada',
      quantity: 10,
      weight: 1000, // 10 * 1000 = 10,000 kg
      length: 1.0,
      width: 1.0,
      height: 1.1,
      category: 'Mercancía Ensacada / Dry Bulk',
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const totals = calculateOrderTotals(items);

  assert.equal(totals.totalItems, 2);
  assert.equal(totals.totalPieces, 25);
  assert.equal(totals.totalWeightKg, 28750);
  assert.equal(totals.totalWeightTons, 28.75);
  assert.equal(totals.weightThresholdTons, 40);
  assert.equal(totals.exceedsCharterThreshold, false);
  assert.equal(totals.maxPieceWeightKg, 1250);
});

test('2. calculateOrderTotals: detecta superación de umbral de 40 toneladas acumuladas', () => {
  const items = [
    {
      id: 'item-1',
      type: 'Palets de Cemento Portland',
      quantity: 30,
      weight: 1500, // 30 * 1500 = 45,000 kg = 45 t
      length: 1.2,
      width: 0.8,
      height: 1.0,
      category: 'Mercancía Ensacada / Dry Bulk',
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const totals = calculateOrderTotals(items);

  assert.equal(totals.totalWeightKg, 45000);
  assert.equal(totals.totalWeightTons, 45);
  assert.equal(totals.exceedsCharterThreshold, true);
});

// ============================================================================
// 2. REGLA < 40 TONELADAS: OMITIR TCE Y FLETAMENTO COMPLETO, COMPUTAR LCL
// ============================================================================

test('3. Peso < 40 toneladas: OMITIR por completo TCE y fletamento completo, computar costes bajo LCL', () => {
  const items = [
    {
      type: 'Cajas de componentes hidráulicos',
      quantity: 8,
      weight: 1200, // 9,600 kg = 9.6 t (< 40 t)
      length: 1.2,
      width: 1.0,
      height: 1.2, // unit vol = 1.44 m3 * 8 = 11.52 m3
      category: 'Carga General / General Cargo',
      shipping_mode_supported: 'Contenedor (FCL / LCL)',
    },
  ];

  const totals = calculateOrderTotals(items);
  assert.ok(totals.totalWeightTons < 40, 'Debe ser estrictamente inferior a 40 toneladas');

  const assessment = evaluateCharteringModel(totals, items);

  // Verificación estricta de omisión de TCE y fletamento completo
  assert.equal(assessment.isFullCharter, false, 'Modalidad de fletamento completo omitida');
  assert.equal(assessment.fullCharterOmitted, true, 'Flag fullCharterOmitted activado');
  assert.equal(assessment.tceCalculated, false, 'Cálculo de TCE desactivado');
  assert.equal(assessment.tce, null, 'TCE debe ser estrictamente null');
  assert.equal(assessment.timeCharterEquivalent, null, 'Objeto timeCharterEquivalent omitido');
  assert.equal(assessment.suggestedVessel, null, 'Buque sugerido omitido para carga LCL');
  assert.match(assessment.mode, /LCL/i);

  // Verificación del cómputo automático de costes LCL
  assert.ok(assessment.lclCostEstimation, 'Debe incluir cálculo automático de costes LCL');
  const lcl = assessment.lclCostEstimation;
  assert.equal(lcl.currency, 'USD');
  assert.ok(lcl.revenueTons >= totals.totalWeightTons, 'Revenue Tons W/M respeta factor limitante');
  assert.ok(lcl.totalLclCost > 0, 'Coste LCL total calculado');
  assert.ok(lcl.breakdown.length >= 4, 'Desglose detallado de costes LCL (flete marítimo, CFS, B/L)');

  const oceanFreight = lcl.breakdown.find((c) => c.concept.includes('Flete Marítimo LCL'));
  assert.ok(oceanFreight && oceanFreight.amount > 0);
});

// ============================================================================
// 3. REGLA >= 40 TONELADAS: FLETAMENTO COMPLETO Y CÁLCULO DE TCE DE BUQUE
// ============================================================================

test('4. Peso >= 40 toneladas: Aplicar fletamento completo y calcular TCE del buque sugerido', () => {
  const items = [
    {
      type: 'Big Bags de Fertilizante Urea Agrícola',
      quantity: 250,
      weight: 1000, // 250,000 kg = 250 t (>= 40 t)
      length: 1.0,
      width: 1.0,
      height: 1.2,
      category: 'Mercancía Ensacada / Dry Bulk',
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const totals = calculateOrderTotals(items);
  assert.ok(totals.totalWeightTons >= 40, 'Debe igualar o superar 40 toneladas');

  const assessment = evaluateCharteringModel(totals, items);

  // Verificación del modelo de fletamento
  assert.equal(assessment.isFullCharter, true, 'Modalidad fletamento completo activada');
  assert.equal(assessment.fullCharterOmitted, false);
  assert.equal(assessment.tceCalculated, true, 'Cálculo de TCE activado');
  assert.equal(assessment.lclCostEstimation, null, 'Coste LCL no aplica en fletamento completo');
  assert.match(assessment.mode, /Fletamento Completo/i);

  // Verificación del buque sugerido
  assert.ok(assessment.suggestedVessel, 'Buque sugerido provisto');
  assert.match(assessment.suggestedVessel.vesselType, /Coaster|Mini-Bulker|General Cargo/i);
  assert.ok(assessment.suggestedVessel.dwt >= totals.totalWeightTons, 'DWT del buque suficiente');

  // Verificación del cálculo de TCE
  assert.ok(typeof assessment.tce === 'number' && assessment.tce > 0, 'TCE numérico calculado');
  assert.ok(assessment.timeCharterEquivalent, 'Objeto TCE completo presente');
  const tceData = assessment.timeCharterEquivalent;
  assert.ok(tceData.dailyUsd > 0);
  assert.ok(tceData.totalVoyageDays > 0);
  assert.ok(tceData.seaDays > 0);
  assert.ok(tceData.portDays > 0);
  assert.ok(tceData.grossFreightRevenueUsd > 0);
  assert.ok(tceData.totalVoyageExpensesUsd > 0);
  assert.match(tceData.formula, /TCE = \(Gross Freight - Voyage Expenses\)/);
});

// ============================================================================
// 4. PERFIL OPERATIVO COHERENTE: CARGAS MASIVAS O EN BIG BAGS
// ============================================================================

test('5. Perfil Operativo Big Bags: estiba en bloque, sacos de aire y láminas antihumedad', () => {
  const items = [
    {
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento y Escoria',
      quantity: 120,
      weight: 1250, // 150,000 kg = 150 t
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const totals = calculateOrderTotals(items);
  const profile = buildOperationalProfile(items, totals);

  assert.equal(profile.isMassiveOrBigBags, true, 'Identificado como carga masiva / Big Bags');
  assert.equal(profile.stowageMethod, 'Estiba en bloque (Block Stowage)');

  // Requisitos obligatorios
  assert.equal(profile.blockStowage.applied, true);
  assert.equal(profile.blockStowage.required, true);

  assert.equal(profile.airBags.applied, true);
  assert.equal(profile.airBags.required, true);
  assert.match(profile.airBags.material, /Sacos de aire inflables|Dunnage Air Bags/i);

  assert.equal(profile.moistureBarrier.applied, true);
  assert.equal(profile.moistureBarrier.required, true);
  assert.match(profile.moistureBarrier.material, /Láminas antihumedad|Moisture Barrier/i);

  // EXCLUSIONES OBLIGATORIAS: Cables de acero pesados y cunas de madera estructurales
  assert.equal(profile.heavySteelCables.applied, false);
  assert.equal(profile.heavySteelCables.required, false);
  assert.equal(profile.heavySteelCables.permitted, false);
  assert.equal(profile.heavySteelCables.status, 'EXCLUIDO POR COMPLETO');
  assert.match(profile.heavySteelCables.reason, /desgarran y seccionan los sacos/i);

  assert.equal(profile.structuralTimberCradles.applied, false);
  assert.equal(profile.structuralTimberCradles.required, false);
  assert.equal(profile.structuralTimberCradles.permitted, false);
  assert.equal(profile.structuralTimberCradles.status, 'EXCLUIDO POR COMPLETO');
  assert.match(profile.structuralTimberCradles.reason, /maquinaria industrial pesada indivisible/i);

  assert.ok(profile.excludedEquipment.some((e) => e.includes('Cables de acero pesados')));
  assert.ok(profile.excludedEquipment.some((e) => e.includes('Cunas de madera estructurales')));
});

test('6. Perfil Operativo Carga Industrial Pesada: habilita cunas y cables de acero', () => {
  const items = [
    {
      category: 'Maquinaria / Equipos Industriales',
      type: 'Transformador Eléctrico de Potencia 120 MVA',
      quantity: 1,
      weight: 65000, // 65 t
      length: 7.5,
      width: 3.2,
      height: 4.1,
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
  ];

  const totals = calculateOrderTotals(items);
  const profile = buildOperationalProfile(items, totals);

  assert.equal(profile.isMassiveOrBigBags, false, 'No es carga de Big Bags');
  assert.equal(profile.heavySteelCables.required, true, 'Cables de acero requeridos para maquinaria');
  assert.equal(profile.heavySteelCables.status, 'REQUERIDO');
  assert.equal(profile.structuralTimberCradles.required, true, 'Cunas de madera estructurales requeridas');
  assert.equal(profile.structuralTimberCradles.status, 'REQUERIDO');
});

// ============================================================================
// 5. INVOCACIÓN HTTP END-TO-END DE PROJECT-PARSER
// ============================================================================

test('7. End-to-end HTTP: orden con peso < 40t omite TCE y calcula costes LCL', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          category: 'Carga General / General Cargo',
          type: 'Palets de repuestos mecánicos',
          quantity: 10,
          weight: 1200, // 12,000 kg = 12 t (< 40 t)
          length: 1.2,
          width: 0.8,
          height: 1.4,
          shipping_mode_supported: 'Contenedor (FCL / LCL)',
        },
      ],
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.orderTotals.totalWeightTons, 12);
  assert.equal(data.orderTotals.exceedsCharterThreshold, false);

  assert.equal(data.charteringAssessment.isFullCharter, false);
  assert.equal(data.charteringAssessment.fullCharterOmitted, true);
  assert.equal(data.charteringAssessment.tce, null);
  assert.equal(data.charteringAssessment.suggestedVessel, null);
  assert.ok(data.charteringAssessment.lclCostEstimation.totalLclCost > 0);
});

test('8. End-to-end HTTP: orden masiva >= 40t en Big Bags calcula TCE y excluye cables pesados/cunas', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          category: 'Mercancía Ensacada / Dry Bulk',
          type: 'Big Bags de Harina de Soja',
          quantity: 80,
          weight: 1250, // 80 * 1250 = 100,000 kg = 100 t (>= 40 t)
          length: 1.0,
          width: 1.0,
          height: 1.3,
          shipping_mode_supported: 'Big Bags / Granel',
        },
      ],
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.orderTotals.totalWeightTons, 100);
  assert.equal(data.orderTotals.exceedsCharterThreshold, true);

  // Fletamento completo y TCE
  assert.equal(data.charteringAssessment.isFullCharter, true);
  assert.equal(data.charteringAssessment.tceCalculated, true);
  assert.ok(data.charteringAssessment.tce > 0);
  assert.ok(data.charteringAssessment.suggestedVessel);

  // Perfil operativo de estiba
  assert.equal(data.operationalProfile.isMassiveOrBigBags, true);
  assert.equal(data.operationalProfile.stowageMethod, 'Estiba en bloque (Block Stowage)');
  assert.equal(data.operationalProfile.airBags.applied, true);
  assert.equal(data.operationalProfile.moistureBarrier.applied, true);

  // Exclusiones absolutas
  assert.equal(data.operationalProfile.heavySteelCables.status, 'EXCLUIDO POR COMPLETO');
  assert.equal(data.operationalProfile.structuralTimberCradles.status, 'EXCLUIDO POR COMPLETO');
});
