import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

function createHandler(source, mockGenAI) {
  const cleanCode = source
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
        response: { text: () => JSON.stringify({ success: true, items: [] }) },
      }),
    };
  }
};

const handler = createHandler(projectParserSource, mockGenAI);

// ============================================================================
// 1. OPERATIVA ESPECÍFICA PARA GRANEL ENSACADO EN BIG BAGS
// ============================================================================

test('1. Perfil Operativo Big Bags: Spreader multipunto (14-16 sacos/ciclo) obligatorio y exclusión de eslingas sueltas y trincaje pesado', () => {
  const items = [
    {
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento Portland 52.5R',
      quantity: 300,
      weight: 1500, // 450 t
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const profile = handler.buildOperationalProfile(items, orderTotals);

  assert.equal(profile.isMassiveOrBigBags, true);
  assert.equal(profile.profileType, 'CARGA_MASIVA_BIG_BAGS');

  // Spreader multipunto obligatorio (14 a 16 Big Bags por ciclo)
  assert.equal(profile.spreaderEquipment.applied, true);
  assert.equal(profile.spreaderEquipment.required, true);
  assert.match(profile.spreaderEquipment.capacityBagsPerCycle, /14-16/);
  assert.match(profile.spreaderEquipment.equipment, /Spreader multipunto/i);
  assert.ok(profile.spreaderEquipment.cyclesEstimated > 0);

  // Cuadrillas enfocadas en enganche rápido al spreader
  assert.equal(profile.stevedoringLabor.applied, true);
  assert.match(profile.stevedoringLabor.focus, /enganche rápido/i);
  assert.match(profile.stevedoringLabor.pacingBasis, /ciclos de retorno de grúa/i);

  // Exclusiones obligatorias: eslingas sueltas, cables de acero, cunas y cadenas pesadas, trincadores a bordo
  assert.equal(profile.looseSlings.applied, false);
  assert.equal(profile.looseSlings.status, 'EXCLUIDO POR COMPLETO');
  assert.match(profile.looseSlings.reason, /prohibido calcular eslingas sueltas individuales/i);

  assert.equal(profile.heavySteelCables.applied, false);
  assert.equal(profile.heavySteelCables.status, 'EXCLUIDO POR COMPLETO');

  assert.equal(profile.structuralTimberCradles.applied, false);
  assert.equal(profile.structuralTimberCradles.status, 'EXCLUIDO POR COMPLETO');

  assert.equal(profile.heavyLashingChains.applied, false);
  assert.equal(profile.heavyLashingChains.status, 'EXCLUIDO POR COMPLETO');

  assert.equal(profile.industrialLashingPersonnel.applied, false);
  assert.equal(profile.industrialLashingPersonnel.status, 'EXCLUIDO POR COMPLETO');

  // Listas de verificación rápida
  assert.ok(profile.requiredEquipment.some(e => e.includes('Spreader multipunto')));
  assert.ok(profile.excludedEquipment.some(e => e.includes('Eslingas sueltas individuales')));
  assert.ok(profile.excludedEquipment.some(e => e.includes('Cables de acero pesados')));
  assert.ok(profile.excludedEquipment.some(e => e.includes('Cunas de madera estructurales')));
  assert.ok(profile.excludedEquipment.some(e => e.includes('Personal técnico especializado en trincaje')));
});

test('2. Desglose Financiero Big Bags: computa Spreader multipunto y cuadrillas por ciclos de grúa, excluyendo trincadores y eslingas sueltas', () => {
  const items = [
    {
      id: 'bb-1',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Sulfato de Amonio',
      quantity: 600, // 600 sacos / 15 sacos por ciclo = 40 ciclos de izado
      weight: 1250,  // 750 t
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  // Operativa con grúa de buque (ciclo estándar)
  const breakdownShipCrane = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    usePortCrane: false,
    craneType: 'ship_crane',
  });

  const fobItems = breakdownShipCrane.fobAndPortOperations.items;

  // 1. Spreader multipunto presente
  const spreaderItem = fobItems.find(it => it.concept.includes('Spreader Multipunto'));
  assert.ok(spreaderItem, 'Debe incluir partida de Spreader Multipunto');
  assert.match(spreaderItem.concept, /14-16 sacos\/ciclo/i);
  assert.ok(spreaderItem.amount > 0);

  // 2. Cuadrilla de enganche rápido presente dimensionada según ciclos
  const stevedoresItem = fobItems.find(it => it.concept.includes('Enganche Rápido Spreader'));
  assert.ok(stevedoresItem, 'Debe incluir cuadrilla de estibadores para enganche rápido');
  assert.equal(stevedoresItem.craneCycles, 40); // 600 / 15
  assert.equal(stevedoresItem.bagsPerCycle, '14-16');
  assert.match(stevedoresItem.cranePacing, /Grúa Propia del Buque/i);

  // 3. Prohibición estricta de eslingas sueltas, trincaje pesado y trincadores a bordo
  const hasLooseSlings = fobItems.some(it => it.concept.toLowerCase().includes('eslingas y medios neumáticos'));
  assert.equal(hasLooseSlings, false, 'No debe calcular eslingas sueltas individuales');

  const hasHeavyLashing = fobItems.some(it => it.concept.includes('Cadenas G80') || it.concept.includes('Maderas Dunnage'));
  assert.equal(hasHeavyLashing, false, 'No debe computar materiales de trincaje pesado en Big Bags');

  const hasLashingTeam = fobItems.some(it => it.concept.includes('Personal Técnico Especializado en Trincaje'));
  assert.equal(hasLashingTeam, false, 'No debe computar personal de trincaje industrial en Big Bags');

  const hasHeavyLift = fobItems.some(it => it.concept.includes('Heavy Lift'));
  assert.equal(hasHeavyLift, false, 'No debe aplicar grúa heavy lift extraordinaria para Big Bags');
});

test('3. Desglose Financiero Big Bags: dimensiona ciclos y cuadrillas según grúa móvil portuaria de muelle', () => {
  const items = [
    {
      id: 'bb-2',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Fertilizante Urea',
      quantity: 1800, // 1800 sacos / 15 = 120 ciclos
      weight: 1000,   // 1800 t
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  // Operativa con grúa móvil portuaria de muelle
  const breakdownPortCrane = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    usePortCrane: true,
    craneType: 'port_crane',
  });

  const stevedoresItem = breakdownPortCrane.fobAndPortOperations.items.find(it => it.concept.includes('Enganche Rápido Spreader'));
  assert.ok(stevedoresItem);
  assert.equal(stevedoresItem.craneCycles, 120);
  assert.match(stevedoresItem.cranePacing, /Grúa Móvil Portuaria de Muelle/i);
});

// ============================================================================
// 2. OPERATIVA PARA CARGA GENERAL, PALETIZADA Y PROYECTO (BREAKBULK / HEAVY LIFT)
// ============================================================================

test('4. Carga Industrial / Proyecto / Paletizado: mantiene estrictamente dunnage, cables, cadenas G80 y trincadores a bordo', () => {
  const items = [
    {
      id: 'breakbulk-1',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Transformador Eléctrico de Subestación',
      quantity: 2,
      length: 6.5,
      width: 3.0,
      height: 3.8,
      weight: 45000, // 45 t por pieza (> 8t -> Heavy Lift)
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
    {
      id: 'palets-1',
      category: 'Carga General / General Cargo',
      type: 'Palets de Cuadros de Control Eléctrico',
      quantity: 10,
      length: 1.2,
      width: 0.8,
      height: 1.6,
      weight: 800,
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const profile = handler.buildOperationalProfile(items, orderTotals);

  assert.equal(profile.isMassiveOrBigBags, false);
  assert.equal(profile.profileType, 'CARGA_PROYECTO_INDUSTRIAL');

  // Perfil exige cunas, cables, cadenas G80 y personal de trincaje
  assert.equal(profile.dunnageWood.required, true);
  assert.equal(profile.heavySteelCables.required, true);
  assert.equal(profile.lashingChainsG80.required, true);
  assert.equal(profile.industrialLashingPersonnel.required, true);

  // Desglose financiero
  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, profile, {});
  const fobItems = breakdown.fobAndPortOperations.items;

  // Materiales de trincaje pesado requeridos
  const lashingMaterials = fobItems.find(it => it.concept.includes('Maderas Dunnage, Cadenas G80, Cables de Acero'));
  assert.ok(lashingMaterials, 'Debe incluir materiales de sujeción pesados específicos');
  assert.ok(lashingMaterials.amount > 0);

  // Personal técnico especializado en trincaje a bordo requerido
  const lashingPersonnel = fobItems.find(it => it.concept.includes('Personal Técnico Especializado en Trincaje Industrial a Bordo'));
  assert.ok(lashingPersonnel, 'Debe incluir equipo de trincadores técnicos a bordo');
  assert.ok(lashingPersonnel.units >= 1);
  assert.equal(lashingPersonnel.unitCost, 800);

  // Grúa Heavy lift para pieza de 45t
  const heavyLift = fobItems.find(it => it.concept.includes('Heavy Lift'));
  assert.ok(heavyLift, 'Debe incluir grúa auxiliar heavy lift para pieza > 8t');

  // Spreader para Big Bags no aplica a maquinaria
  const hasSpreader = fobItems.some(it => it.concept.includes('Spreader Multipunto de Izado para Big Bags'));
  assert.equal(hasSpreader, false, 'No debe incluir spreader de Big Bags para maquinaria o carga general');
});

// ============================================================================
// 3. COHERENCIA AUTOMÁTICA EN LA INTERFAZ (ForwarderWorkspace)
// ============================================================================

test('5. Coherencia en Interfaz: Detección de "Mercancía Ensacada / Dry Bulk" y "Big Bags / Granel" activa Spreader y excluye trincaje pesado', () => {
  // Verifica el estado y las funciones del componente ForwarderWorkspace
  assert.match(workspaceSource, /const\s+\[spreaderMultipunto,\s*setSpreaderMultipunto\]\s*=\s*useState\(0\);/);
  assert.match(workspaceSource, /const\s+\[craneLiftCycles,\s*setCraneLiftCycles\]\s*=\s*useState\(0\);/);

  // Detección automática en autoCalculateEstimates
  assert.match(workspaceSource, /const\s+isBigBagsOrBulk\s*=\s*items\.some/);

  // Spreader multipunto configurado
  assert.match(workspaceSource, /setSpreaderMultipunto\(calculatedSpreaders\);/);
  assert.match(workspaceSource, /setCraneLiftCycles\(calculatedCycles\);/);

  // Cuadrillas dimensionadas según ciclos de retorno de grúa
  assert.match(workspaceSource, /setStevedoreGangs\(calculatedGangs\);/);

  // Trincaje pesado, eslingas sueltas y trincadores a bordo EXCLUIDOS
  assert.match(workspaceSource, /setHighCapacitySlings\(0\);/);
  assert.match(workspaceSource, /setDunnageWood\(0\);/);
  assert.match(workspaceSource, /setChainsBinders\(0\);/);
  assert.match(workspaceSource, /setShackles\(0\);/);
  assert.match(workspaceSource, /setLashingTeam\(0\);/);
  assert.match(workspaceSource, /setHeavyLiftCrane\(0\);/);

  // Mensaje de perfil operativo claro
  assert.match(workspaceSource, /Spreader multipunto \(14-16 sacos\/ciclo\)/);
  assert.match(workspaceSource, /Maderas de cuna pesadas y cables de acero de proyecto quedan excluidos/);

  // UI renderiza Spreader multipunto cuando isBigBagsCargo es true
  assert.match(workspaceSource, /Spreader Multipunto de Izado \(14-16 Big Bags \/ ciclo\)/);
  assert.match(workspaceSource, /label="Spreaders en Muelle"/);
  assert.match(workspaceSource, /subtitle="Bloques 14-16 sacos"/);
  assert.match(workspaceSource, /value=\{spreaderMultipunto\}/);

  // UI renderiza subtítulos acordes a la operativa de Big Bags
  assert.match(workspaceSource, /subtitle=\{isBigBagsCargo \? "Prohibidas \(Usar Spreader\)" : "Alta Capacidad"\}/);
  assert.match(workspaceSource, /subtitle=\{isBigBagsCargo \? "Enganche Rápido Spreader" : "Turnos de Estiba"\}/);
  assert.match(workspaceSource, /subtitle=\{isBigBagsCargo \? "Excluido \(Big Bags\)" : "Especialistas"\}/);
});

// ============================================================================
// 4. INVOCACIÓN HTTP END-TO-END DE PROJECT-PARSER
// ============================================================================

test('6. End-to-end HTTP: solicitud con Big Bags calcula spreader, ciclos de retorno y excluye trincadores a bordo', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          category: 'Mercancía Ensacada / Dry Bulk',
          type: 'Big Bags de Cemento',
          quantity: 450,
          weight: 1000, // 450 t
          shipping_mode_supported: 'Big Bags / Granel',
        },
      ],
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.operationalProfile.isMassiveOrBigBags, true);
  assert.equal(data.operationalProfile.spreaderEquipment.applied, true);

  const fobItems = data.financialBreakdown.fobAndPortOperations.items;
  const spreader = fobItems.find(it => it.concept.includes('Spreader Multipunto'));
  assert.ok(spreader, 'Spreader multipunto presente en desglose FOB');

  const stevedores = fobItems.find(it => it.concept.includes('Enganche Rápido Spreader'));
  assert.ok(stevedores, 'Cuadrilla de enganche rápido presente');
  assert.equal(stevedores.craneCycles, 30); // 450 / 15

  const lashingTeam = fobItems.find(it => it.concept.includes('Personal Técnico Especializado en Trincaje'));
  assert.equal(lashingTeam, undefined, 'Personal de trincaje industrial a bordo debe estar ausente');
});
