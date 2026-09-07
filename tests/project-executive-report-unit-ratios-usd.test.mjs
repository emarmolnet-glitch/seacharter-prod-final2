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
// 1. SUSTITUCIÓN PERMANENTE DE ADUANAS POR VALOR TOTAL DE LA MERCANCÍA
// ============================================================================

test('1. calculateFinancialBreakdown sustituye Aduanas permanentemente por Mercancía con el valor total', () => {
  const items = [
    {
      id: 'bulk-cement-1',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento',
      quantity: 5000,
      weight: 1000, // 5000 t
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  // Valor de mercancía introducido internamente (e.g. 150.000 €)
  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    merchandiseValue: 150000,
    storageDays: 5,
  });

  const fobItems = breakdown.fobAndPortOperations.items;

  // 1. La partida debe llamarse 'Mercancía'
  const mercanciaItem = fobItems.find(it => it.concept === 'Mercancía' || it.concept.includes('Mercancía'));
  assert.ok(mercanciaItem, 'Debe existir la partida de Mercancía');
  assert.equal(mercanciaItem.concept, 'Mercancía', 'El concepto debe ser estrictamente "Mercancía"');
  assert.equal(mercanciaItem.amount, 150000, 'El importe debe ser el valor total de la mercancía gestionado internamente');

  // 2. Queda prohibido cualquier partida de Aduanas o despacho aduanero
  const aduanasItem = fobItems.find(it => /aduana/i.test(it.concept) || /despacho aduanero/i.test(it.concept));
  assert.equal(aduanasItem, undefined, 'No debe existir ninguna partida denominada Aduanas o Despacho Aduanero');

  // 3. No debe haber ningún cálculo de precio de adquisición externo
  const externalAcqItem = fobItems.find(it => /adquisici[oó]n/i.test(it.concept));
  assert.equal(externalAcqItem, undefined, 'No debe existir concepto de precio de adquisición externo');
});

// ============================================================================
// 2. CÁLCULO DE RATIOS UNITARIOS EN USD/MT (BACKEND PROJECT-PARSER)
// ============================================================================

test('2. calculateFinancialBreakdown calcula ratios flete_unitario_usd_mt y fob_mas_mercancia_unitario_usd_mt', () => {
  const items = [
    {
      id: 'bb-urea',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Urea Granulada',
      quantity: 10000, // 10.000 MT
      weight: 1000,
      shipping_mode_supported: 'Big Bags / Granel',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    valor_total_mercancia_usd: 350000, // 350.000 USD de valor de mercancía
    storageDays: 5,
  });

  // Verificación de tonelaje base
  assert.equal(breakdown.toneladas, 10000, 'El tonelaje debe ser exactamente 10.000 MT');
  assert.ok(breakdown.flete_total_usd > 0, 'El flete total en USD debe ser positivo');
  assert.ok(breakdown.costes_fob_totales_usd > 0, 'Los costes FOB totales en USD deben ser positivos');
  assert.equal(breakdown.valor_total_mercancia_usd, 350000, 'El valor total de mercancía en USD debe ser 350.000');

  // Fórmula 1: flete_unitario_usd_mt = flete_total_usd / toneladas
  const expectedFleteUnitario = Math.round((breakdown.flete_total_usd / breakdown.toneladas) * 100) / 100;
  assert.equal(breakdown.flete_unitario_usd_mt, expectedFleteUnitario, 'flete_unitario_usd_mt debe coincidir con flete_total_usd / toneladas');

  // Fórmula 2: fob_mas_mercancia_unitario_usd_mt = (costes_fob_totales_usd + valor_total_mercancia_usd) / toneladas
  const expectedFobMasMercancia = Math.round(((breakdown.costes_fob_totales_usd + breakdown.valor_total_mercancia_usd) / breakdown.toneladas) * 100) / 100;
  assert.equal(breakdown.fob_mas_mercancia_unitario_usd_mt, expectedFobMasMercancia, 'fob_mas_mercancia_unitario_usd_mt debe coincidir con (costes_fob + mercancia) / toneladas');

  // Verificación de estructura unitRatios
  assert.ok(breakdown.unitRatios, 'Debe existir el objeto unitRatios');
  assert.equal(breakdown.unitRatios.currency, 'USD/MT');
  assert.equal(breakdown.unitRatios.flete_unitario_usd_mt, breakdown.flete_unitario_usd_mt);
  assert.equal(breakdown.unitRatios.fob_mas_mercancia_unitario_usd_mt, breakdown.fob_mas_mercancia_unitario_usd_mt);
});

test('3. evaluateOrderPortOperations consolida los ratios unitarios en USD/MT', () => {
  const items = [
    {
      id: 'equipment-1',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Compresor Industrial de Gas',
      quantity: 1,
      length: 12,
      width: 4,
      height: 4.5,
      weight: 80000, // 80 t
      shipping_mode_supported: 'Heavy Lift / Carga Proyecto',
    },
  ];

  const evaluated = handler.evaluateOrderPortOperations(items, {
    valor_total_mercancia_usd: 500000,
  });

  assert.equal(evaluated.toneladas, 80);
  assert.ok(evaluated.flete_unitario_usd_mt > 0, 'flete_unitario_usd_mt debe estar presente y ser positivo');
  assert.ok(evaluated.fob_mas_mercancia_unitario_usd_mt > 0, 'fob_mas_mercancia_unitario_usd_mt debe estar presente y ser positivo');
  assert.equal(evaluated.valor_total_mercancia_usd, 500000);
});

test('4. HTTP POST project-parser devuelve ratios unitarios en USD/MT en raíz y en financialBreakdown', async () => {
  const requestBody = {
    items: [
      {
        id: 'steel-plates',
        category: 'Carga General / General Cargo',
        type: 'Chapas de Acero Estructural',
        quantity: 100,
        length: 6,
        width: 2,
        height: 0.1,
        weight: 1000, // 100 MT
        shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
      },
    ],
    merchandiseValue: 80000,
    pol: 'Bilbao',
    pod: 'Rotterdam',
    loadingRate: 1500,
    dischargingRate: 1200,
  };

  const req = new Request('http://localhost/api/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.toneladas, 100);
  assert.ok(json.flete_unitario_usd_mt > 0, 'flete_unitario_usd_mt debe ser devuelto en la raíz del JSON');
  assert.ok(json.fob_mas_mercancia_unitario_usd_mt > 0, 'fob_mas_mercancia_unitario_usd_mt debe ser devuelto en la raíz del JSON');
  assert.equal(json.financialBreakdown.flete_unitario_usd_mt, json.flete_unitario_usd_mt);
  assert.equal(json.financialBreakdown.fob_mas_mercancia_unitario_usd_mt, json.fob_mas_mercancia_unitario_usd_mt);
});

// ============================================================================
// 3. RENDERIZADO EN EL REPORTE EJECUTIVO (FRONTEND)
// ============================================================================

test('5. ForwarderWorkspace incluye sección "Desglose Unitario Operativo (USD/MT)"', () => {
  // Debe existir el título de la sección
  assert.match(workspaceSource, /Desglose\s+Unitario\s+Operativo\s*\(USD\/MT\)/);

  // Debe visualizar de forma diferenciada "Valor del Flete" en USD/MT
  assert.match(workspaceSource, /Valor del Flete/);
  assert.match(workspaceSource, /fleteUnitarioUsdMt[\s\S]*?USD\/MT/);

  // Debe visualizar de forma diferenciada "Costes FOB + Mercancía" en USD/MT
  assert.match(workspaceSource, /Costes FOB \+ Mercancía/);
  assert.match(workspaceSource, /fobMasMercanciaUnitarioUsdMt[\s\S]*?USD\/MT/);
});

test('6. Botones del reporte ejecutivo situados abajo a la derecha sin cortes visuales', () => {
  // Posicionamiento abajo a la derecha
  assert.match(workspaceSource, /fixed\s+bottom-6\s+right-8\s+flex\s+items-center\s+gap-4\s+z-\[9999\]\s+print:hidden/);

  // Botones de acción presentes
  assert.match(workspaceSource, /id="btn-close-executive-report"/);
  assert.match(workspaceSource, /id="btn-print-executive-report"/);

  // Padding inferior para evitar cortes visuales
  assert.match(workspaceSource, /pb-28/, 'El contenedor debe tener pb-28 para evitar que los botones floten sobre el contenido');
});

test('7. Almacenaje en muelle refleja días reales evitando mostrar "(0 d)"', () => {
  assert.doesNotMatch(workspaceSource, /Almacenaje muelle \(0 d\)/, 'No debe existir "(0 d)" en la plantilla del reporte');
  assert.match(workspaceSource, /activeReport\.preStackingDays/, 'Debe utilizar preStackingDays para reflejar los días reales');
});
