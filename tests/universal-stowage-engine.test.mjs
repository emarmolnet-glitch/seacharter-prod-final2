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
// 1. MOTOR UNIVERSAL DE ESTIBA: ESPECIFICACIÓN NAVAL Y BODEGAS (1 A 4)
// ============================================================================

test('1. calculateUniversalStowagePlan define el buque Handysize/MPP con 4 bodegas, Tanktop, Tween Deck y Cubierta (30.300 m³)', () => {
  assert.equal(typeof handler.calculateUniversalStowagePlan, 'function', 'calculateUniversalStowagePlan debe ser exportada');
  assert.equal(typeof handler.generateDynamicStowageAscii, 'function', 'generateDynamicStowageAscii debe ser exportada');

  const plan = handler.calculateUniversalStowagePlan([]);
  assert.ok(plan.vesselModel, 'Debe incluir vesselModel');
  assert.equal(plan.vesselModel.holdsCount, 4, 'El buque debe modelar 4 bodegas');
  assert.equal(plan.vesselModel.grainCapacityCbm, 30300, 'Capacidad cúbica Grain debe ser 30.300 m³');
  assert.equal(plan.vesselModel.tanktopUniformLoadTm2, 20.0, 'Resistencia Tanktop debe ser 20.0 t/m²');
  assert.equal(plan.vesselModel.tweenDeckUniformLoadTm2, 4.5, 'Resistencia Tween Deck debe ser 4.5 t/m²');
  assert.equal(plan.vesselModel.weatherDeckUniformLoadTm2, 3.5, 'Resistencia Weather Deck debe ser 3.5 t/m²');

  assert.equal(plan.holds.length, 4, 'Debe incluir el array de 4 bodegas');
  assert.equal(plan.holds[0].name, 'Bodega 1 (Proa / Fwd)');
  assert.equal(plan.holds[1].name, 'Bodega 2 (Crujía Proa / Mid-Fwd)');
  assert.equal(plan.holds[2].name, 'Bodega 3 (Crujía Popa / Mid-Aft)');
  assert.equal(plan.holds[3].name, 'Bodega 4 (Popa / Aft)');
});

// ============================================================================
// 2. CARGAS HOMOGÉNEAS: BIG BAGS / GRANEL ENSACADO
// ============================================================================

test('2. Carga homogénea en Big Bags: estiba en bloque compacta con spreader multipunto y reparto proporcional entre bodegas', () => {
  const items = [
    {
      id: 'bb-cement-5000',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento Portland',
      quantity: 5000,
      weight: 1000, // 5.000 MT
      length: 1.0,
      width: 1.0,
      height: 1.2,
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const plan = handler.calculateUniversalStowagePlan(items);
  assert.equal(plan.cargoClassification.isMixedCargo, false, 'Una sola familia debe clasificarse como no mixta');
  assert.equal(plan.cargoClassification.totalWeightTons, 5000);
  assert.ok(plan.cargoClassification.totalVolumeCbm > 0);

  // Verificación de método y trincaje específico de Big Bags
  const primaryBreakdown = plan.cargoClassification.cargoMixBreakdown[0];
  assert.match(primaryBreakdown.stowageMethod, /estiba en bloque|Block Stowage/i);
  assert.match(primaryBreakdown.securingLegend, /spreader multipunto/i);

  // Verificación de reparto equilibrado entre bodegas para trim
  assert.ok(plan.holds[0].totalWeightTons > 0, 'Bodega 1 debe recibir peso');
  assert.ok(plan.holds[1].totalWeightTons > 0, 'Bodega 2 debe recibir peso');
  assert.ok(plan.holds[2].totalWeightTons > 0, 'Bodega 3 debe recibir peso');
  assert.ok(plan.holds[3].totalWeightTons > 0, 'Bodega 4 debe recibir peso');

  // Suma de pesos en bodegas debe ser igual al total
  const sumWeights = plan.holds.reduce((acc, h) => acc + h.totalWeightTons, 0);
  assert.ok(Math.abs(sumWeights - 5000) < 5, 'La suma de pesos por bodega debe coincidir con el total');
});

// ============================================================================
// 3. CARGAS HOMOGÉNEAS: MAQUINARIA INDUSTRIAL PESADA / HEAVY LIFT
// ============================================================================

test('3. Carga industrial pesada: asignada a fondo de bodega (Tanktop) con cunas de madera estructurales y cadenas G80', () => {
  const items = [
    {
      id: 'mach-turbine',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Turbina de Gas Industrial',
      quantity: 1,
      weight: 85000, // 85 MT
      length: 6.5,
      width: 3.2,
      height: 3.8,
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
    {
      id: 'mach-generator',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Generador Eléctrico Principal',
      quantity: 1,
      weight: 60000, // 60 MT
      length: 5.0,
      width: 3.0,
      height: 3.5,
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
  ];

  const plan = handler.calculateUniversalStowagePlan(items);
  assert.equal(plan.cargoClassification.totalWeightTons, 145);

  // Asignadas a Tanktop
  assert.ok(plan.cargoClassification.items.every(it => it.tier === 'TANKTOP'), 'Maquinaria pesada debe asignarse a TANKTOP');
  assert.match(plan.cargoClassification.items[0].securingLegend, /cunas.*cadenas g80/i);

  // Verificación de resistencia de carga local
  assert.ok(plan.hydrodynamicsAndSafety.structuralResistanceCompliance, 'La presión de planchaje debe estar validada');
  assert.ok(plan.hydrodynamicsAndSafety.maxFloorPressureTm2 <= 20.0, 'Presión no debe superar los 20 t/m² del Tanktop');
});

// ============================================================================
// 4. MOTOR MULTI-CARGA: MEZCLA COMPLEJA DE MERCANCÍAS DISTINTAS
// ============================================================================

test('4. Motor Multi-Carga: analiza mezcla de maquinaria pesada, big bags, pallets y contenedores optimizando por gravedad y compartimentos', () => {
  const multiItems = [
    {
      id: 'item-mach-transformer',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Transformador Eléctrico 120kV',
      quantity: 1,
      weight: 75000, // 75 MT -> Tanktop Bodega 1/2
      length: 5.5,
      width: 3.0,
      height: 3.6,
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
    {
      id: 'item-bulk-cement',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento',
      quantity: 200, // 200 MT -> Bodega 3 en Bloque
      weight: 1000,
      length: 1.0,
      width: 1.0,
      height: 1.2,
      shipping_mode_supported: 'Big Bags / Granel',
    },
    {
      id: 'item-general-pallets',
      category: 'Carga General / General Cargo',
      type: 'Pallets con Repuestos y Válvulas',
      quantity: 50, // 25 MT -> Tween Deck
      weight: 500,
      length: 1.2,
      width: 0.8,
      height: 1.6,
      shipping_mode_supported: 'Lo-Lo Carga General',
    },
    {
      id: 'item-deck-container',
      category: 'Carga General / General Cargo',
      type: 'Contenedor 40 HC con Herramientas',
      quantity: 2, // 50 MT -> Weather Deck
      weight: 25000,
      length: 12.0,
      width: 2.4,
      height: 2.9,
      shipping_mode_supported: "Contenedor (FCL / LCL)",
    },
  ];

  const plan = handler.calculateUniversalStowagePlan(multiItems);

  // 1. Detección Multi-Carga
  assert.equal(plan.cargoClassification.isMixedCargo, true, 'Debe detectarse como carga mixta (Multi-Cargo)');
  assert.equal(plan.cargoClassification.totalWeightTons, 350, 'El peso acumulado debe ser 350 MT');

  // 2. Distribución por Gravedad y Resistencia
  const transformerItem = plan.cargoClassification.items.find(it => it.id === 'item-mach-transformer');
  assert.equal(transformerItem.tier, 'TANKTOP', 'Transformador debe asignarse a TANKTOP');
  assert.match(transformerItem.securingLegend, /cunas.*cadenas g80/i);

  const bigBagsItem = plan.cargoClassification.items.find(it => it.id === 'item-bulk-cement');
  assert.equal(bigBagsItem.tier, 'BODEGA_BLOQUE', 'Big Bags deben asignarse a BODEGA_BLOQUE');
  assert.match(bigBagsItem.securingLegend, /spreader multipunto/i);

  const palletsItem = plan.cargoClassification.items.find(it => it.id === 'item-general-pallets');
  assert.equal(palletsItem.tier, 'TWEEN_DECK', 'Pallets deben asignarse a TWEEN_DECK');
  assert.match(palletsItem.securingLegend, /cinchas y redes/i);

  const containerItem = plan.cargoClassification.items.find(it => it.id === 'item-deck-container');
  assert.equal(containerItem.tier, 'WEATHER_DECK', 'Contenedores deben asignarse a WEATHER_DECK');
  assert.match(containerItem.securingLegend, /twistlocks/i);

  // 3. Desglose analítico de mezcla (Cargo Mix Breakdown)
  assert.ok(plan.cargoClassification.cargoMixBreakdown.length >= 3, 'Debe incluir el desglose por categorías');
  const totalMixPct = plan.cargoClassification.cargoMixBreakdown.reduce((acc, g) => acc + g.weightPercentage, 0);
  assert.ok(Math.abs(totalMixPct - 100) < 1.0, 'La suma de porcentajes de peso debe aproximar el 100%');

  // 4. Verificación de capacidad cúbica y resistencia local
  assert.equal(plan.hydrodynamicsAndSafety.isCubicCapacityExceeded, false, 'No debe exceder capacidad cúbica (30.300 m³)');
  assert.equal(plan.hydrodynamicsAndSafety.isPermissibleLoadExceeded, false, 'No debe exceder límites portantes de bodega');
  assert.ok(plan.hydrodynamicsAndSafety.metacentricHeightGmEstimatedM > 1.40, 'Debe garantizar GM positivo');
});

// ============================================================================
// 5. GENERADOR DINÁMICO DE CROQUIS ESQUEMÁTICO (ASCII STOWAGE PLAN)
// ============================================================================

test('5. generateDynamicStowageAscii genera esquema dinámico matricial sin usar plantillas estáticas y refleja bodegas y métodos reales', () => {
  const multiItems = [
    {
      id: 'it-excavator',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Excavadora CAT 336 Heavy',
      quantity: 2,
      weight: 38000,
      length: 9.5,
      width: 3.2,
      height: 3.4,
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
    {
      id: 'it-sacos',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento',
      quantity: 100,
      weight: 1000,
      length: 1.0,
      width: 1.0,
      height: 1.2,
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const plan = handler.calculateUniversalStowagePlan(multiItems);
  const ascii = plan.asciiCroquis;

  // Verificación de NO estaticidad (no debe tener textos genéricos o fijos no presentes en manifiesto)
  assert.ok(typeof ascii === 'string' && ascii.length > 500, 'El croquis debe ser un string no vacío');
  assert.match(ascii, /Excavadora CAT 336 Heavy/i, 'Debe incluir el nombre real del ítem de maquinaria');
  assert.match(ascii, /Big Bags de Cemento/i, 'Debe incluir el nombre real de los sacos');

  // Verificación de compartimentos y cabeceras
  assert.match(ascii, /CUBIERTA PRINCIPAL \/ WEATHER DECK/i);
  assert.match(ascii, /ENTREPUENTE \/ TWEEN DECK/i);
  assert.match(ascii, /FONDO DE BODEGA \/ TANKTOP/i);
  assert.match(ascii, /Bodega 1/i);
  assert.match(ascii, /Bodega 2/i);
  assert.match(ascii, /Bodega 3/i);
  assert.match(ascii, /Bodega 4/i);

  // Verificación de métodos aplicados
  assert.match(ascii, /Cunas de madera estructurales/i);
  assert.match(ascii, /cadenas.*G80/i);
  assert.match(ascii, /Spreader multipunto/i);

  // Verificación de proporciones de peso
  assert.match(ascii, /PROPORCIONES DE PESO/i);
  assert.match(ascii, /VALIDACIÓN TÉCNICA E HIDRODINÁMICA/i);
  assert.match(ascii, /Estabilidad GM/i);
});

// ============================================================================
// 6. INTEGRACIÓN BACKEND HTTP POST (PROJECT-PARSER.JS)
// ============================================================================

test('6. HTTP POST a project-parser devuelve el modelo de estiba en stowagePlan, operationalProfile y financialBreakdown', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          id: 'test-mach',
          category: 'Maquinaria / Equipos Industriales',
          type: 'Generador Eólico Marino',
          quantity: 1,
          weight: 45000,
          length: 7.2,
          width: 3.1,
          height: 3.0,
          shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
        },
        {
          id: 'test-bags',
          category: 'Mercancía Ensacada / Dry Bulk',
          type: 'Big Bags de Harina Industrial',
          quantity: 150,
          weight: 1000,
          length: 1.0,
          width: 1.0,
          height: 1.2,
          shipping_mode_supported: 'Big Bags / Granel',
        },
      ],
      pol: 'Bilbao',
      pod: 'Altamira',
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.ok(data.stowagePlan, 'La respuesta raíz debe incluir stowagePlan');
  assert.equal(data.stowagePlan.vesselModel.holdsCount, 4);
  assert.equal(data.stowagePlan.cargoClassification.isMixedCargo, true);
  assert.ok(data.stowagePlan.asciiCroquis.length > 200, 'Debe incluir el croquis ASCII');

  assert.ok(data.operationalProfile.stowagePlan, 'operationalProfile debe incluir stowagePlan');
  assert.ok(data.charteringAssessment.stowagePlan, 'charteringAssessment debe incluir stowagePlan');
  assert.ok(data.financialBreakdown.stowagePlan, 'financialBreakdown debe incluir stowagePlan');
});

// ============================================================================
// 7. CONSERVACIÓN DE AJUSTES PREVIOS Y RENDERIZADOR FRONTEND (FORWARDERWORKSPACE)
// ============================================================================

test('7. ForwarderWorkspace conserva intactos los 4 ajustes previos', () => {
  // 1. Botones abajo a la derecha sin cortes visuales
  assert.match(
    workspaceSource,
    /fixed\s+bottom-6\s+right-8\s+flex\s+items-center\s+gap-4\s+z-\[9999\]\s+print:hidden/,
    'Los botones deben permanecer fijos abajo a la derecha'
  );

  // 2. Almacenaje reflejando días reales (no "0 d")
  assert.doesNotMatch(
    workspaceSource,
    /Almacenaje muelle \(0 d\)/,
    'No debe existir "(0 d)"'
  );
  assert.match(
    workspaceSource,
    /activeReport\.preStackingDays/,
    'Debe utilizar preStackingDays para días reales de almacenaje'
  );

  // 3. Etiqueta Aduanas sustituida por Mercancía con su valor total
  assert.doesNotMatch(
    workspaceSource,
    /<td[^>]*>Despacho de Aduanas<\/td>/,
    'La fila no debe llamarse "Despacho de Aduanas"'
  );
  assert.match(
    workspaceSource,
    /Mercancía/,
    'Debe referenciar a Mercancía'
  );

  // 4. Desglose Unitario en USD/MT
  assert.match(
    workspaceSource,
    /Desglose Unitario Operativo \(USD\/MT\)/,
    'Debe mantener la sección de Desglose Unitario Operativo (USD/MT)'
  );
  assert.match(
    workspaceSource,
    /Valor del Flete/,
    'Debe desglosar el Valor del Flete'
  );
  assert.match(
    workspaceSource,
    /Costes FOB \+ Mercancía/,
    'Debe desglosar Costes FOB + Mercancía'
  );
});

test('8. ForwarderWorkspace renderiza dinámicamente el croquis esquemático y la matriz visual de compartimentos', () => {
  // Verificación de invocación de getStowageAscii con activeReport
  assert.match(
    workspaceSource,
    /getStowageAscii\(activeReport\)/,
    'Debe invocar getStowageAscii pasando activeReport'
  );

  // Verificación de la matriz de bodegas visual
  assert.match(
    workspaceSource,
    /activeReport\?\.stowagePlan/,
    'Debe comprobar activeReport.stowagePlan'
  );
  assert.match(
    workspaceSource,
    /activeReport\.stowagePlan\.holds\?\.map/,
    'Debe iterar sobre las bodegas en el reporte ejecutivo'
  );
  assert.match(
    workspaceSource,
    /Distribución Multi-Carga Optimizada/,
    'Debe mostrar el badge de multi-carga'
  );
  assert.match(
    workspaceSource,
    /Resistencia Estructural/,
    'Debe mostrar la comprobación de resistencia estructural'
  );
  assert.match(
    workspaceSource,
    /GM Estabilidad/,
    'Debe mostrar la comprobación de GM estabilidad'
  );
});
