import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProjectInstruction } from '../src/utils/agenteProyectosParser.mjs';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const widgetSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');

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

test('1. calculateFinancialBreakdown separates Ocean Freight from FOB/Port Operations for LCL (<40t)', () => {
  const items = [
    {
      id: 'lcl-1',
      type: 'Válvulas industriales de compuerta',
      quantity: 5,
      weight: 250, // 1250 kg = 1.25 t (<40t)
      length: 1.0,
      width: 1.0,
      height: 1.0,
      category: 'Válvulas y Tuberías',
      shipping_mode_supported: "40' HC Contenedor"
    }
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    storageDays: 3,
    inlandCost: 200,
    customsCost: 150
  });

  assert.ok(breakdown.isSeparatedBreakdown, 'Must mark breakdown as explicitly separated');
  assert.ok(breakdown.subtotals.oceanFreight > 0, 'Ocean freight subtotal must be greater than zero');
  assert.ok(breakdown.subtotals.fobAndPortOperations > 0, 'FOB & Port operations subtotal must be greater than zero');

  // Verify Ocean Freight details
  assert.strictEqual(breakdown.oceanFreight.mode, 'Grupaje LCL');
  assert.strictEqual(breakdown.oceanFreight.subtotal, breakdown.subtotals.oceanFreight);
  assert.ok(breakdown.oceanFreight.items.length > 0);

  // Verify FOB and Port Operations details
  assert.strictEqual(breakdown.fobAndPortOperations.subtotal, breakdown.subtotals.fobAndPortOperations);
  const hasWharfHandling = breakdown.fobAndPortOperations.items.some(it => it.category === 'Manipulación en Muelle');
  const hasPortFees = breakdown.fobAndPortOperations.items.some(it => it.category === 'Tasas Portuarias');
  const hasAssociatedServices = breakdown.fobAndPortOperations.items.some(it => it.category === 'Servicios Asociados');
  assert.ok(hasWharfHandling, 'Must include wharf handling');
  assert.ok(hasPortFees, 'Must include port charges');
  assert.ok(hasAssociatedServices, 'Must include storage, inland and customs services');

  // Mathematical integrity: No opaque single lumped figure
  assert.strictEqual(
    breakdown.totalCostAllIn,
    Math.round((breakdown.subtotals.oceanFreight + breakdown.subtotals.fobAndPortOperations) * 100) / 100,
    'totalCostAllIn must strictly equal Ocean Freight + FOB & Port Operations'
  );
  assert.strictEqual(
    breakdown.totalQuotationAllIn,
    Math.round((breakdown.totalCostAllIn * 1.15) * 100) / 100,
    'totalQuotationAllIn must include 15% margin'
  );
});

test('2. calculateFinancialBreakdown separates Ocean Freight (TCE) from FOB/Port Operations for Full Charter (>=40t)', () => {
  const items = [
    {
      id: 'project-1',
      type: 'Transformador Eléctrico de Potencia 120 MVA',
      quantity: 1,
      weight: 65000, // 65 t (>= 40t)
      length: 8.0,
      width: 4.0,
      height: 4.5,
      category: 'Maquinaria / Equipos Industriales',
      shipping_mode_supported: 'Heavy Lift / Breakbulk'
    }
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, items);
  const operationalProfile = handler.buildOperationalProfile(items, orderTotals);

  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, charteringAssessment, operationalProfile, {
    storageDays: 5,
    surveyorCost: 1800,
    inlandCost: 2500,
    customsCost: 600
  });

  assert.ok(breakdown.isSeparatedBreakdown);
  assert.strictEqual(breakdown.oceanFreight.mode, 'Fletamento Completo');
  assert.ok(breakdown.oceanFreight.tceDaily >= 8500, 'TCE daily must be assigned for full charter');

  // FOB & Port Operations must include heavy lift, lashing and peripheral services
  const hasHeavyLift = breakdown.fobAndPortOperations.items.some(it => it.concept.includes('Heavy Lift'));
  const hasLashing = breakdown.fobAndPortOperations.items.some(it => it.category === 'Trincaje y Estiba');
  const hasSurveyor = breakdown.fobAndPortOperations.items.some(it => it.concept.includes('Surveyor'));
  assert.ok(hasHeavyLift, 'Must identify heavy lift mobile crane requirement');
  assert.ok(hasLashing, 'Must identify lashing and securing materials');
  assert.ok(hasSurveyor, 'Must detail independent surveyor inspection');

  // Invariant
  assert.strictEqual(
    breakdown.totalCostAllIn,
    Math.round((breakdown.subtotals.oceanFreight + breakdown.subtotals.fobAndPortOperations) * 100) / 100
  );
});

test('3. evaluateOrderPortOperations consolidates financialBreakdown with chartering and operations', () => {
  const items = [
    {
      id: 'bulk-1',
      type: 'Big Bags de Cemento Portland 52.5R',
      quantity: 100,
      weight: 1000, // 100 t
      length: 1.0,
      width: 1.0,
      height: 1.2,
      category: 'Mercancía Ensacada / Dry Bulk',
      shipping_mode_supported: 'Big Bags / Granel'
    }
  ];

  const result = handler.evaluateOrderPortOperations(items, { storageDays: 2 });
  assert.ok(result.orderTotals);
  assert.ok(result.charteringAssessment);
  assert.ok(result.operationalProfile);
  assert.ok(result.financialBreakdown);

  assert.strictEqual(result.financialBreakdown.isSeparatedBreakdown, true);
  assert.ok(result.financialBreakdown.subtotalOceanFreight > 0);
  assert.ok(result.financialBreakdown.subtotalFobPortOperations > 0);
  assert.ok(result.financialBreakdown.totalCostAllIn > 0);
  assert.ok(result.financialBreakdown.totalQuotationAllIn > result.financialBreakdown.totalCostAllIn);
});

test('4. project-parser HTTP handler returns financialBreakdown for structured items', async () => {
  const req = new Request('http://localhost/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          id: 'item-1',
          category: 'Maquinaria / Equipos Industriales',
          type: 'Generador Industrial Diésel',
          quantity: 2,
          length: 5.0,
          width: 2.2,
          height: 2.6,
          weight: 12000
        }
      ]
    })
  });

  const res = await handler(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(data.financialBreakdown);
  assert.ok(data.financialBreakdown.subtotals.oceanFreight > 0);
  assert.ok(data.financialBreakdown.subtotals.fobAndPortOperations > 0);
  assert.ok(data.financialBreakdown.totalCostAllIn > 0);
  assert.ok(data.financialBreakdown.totalQuotationAllIn > data.financialBreakdown.totalCostAllIn);
  assert.ok(data.reply.includes('DESGLOSE FINANCIERO SEPARADO'));
});

test('5. parseProjectInstruction detects explicit financial breakdown requests from chat', () => {
  const result = parseProjectInstruction('por favor muéstrame el desglose financiero separando flete y costes fob');
  assert.strictEqual(result.payload.requestFinancialBreakdown, true);
  assert.strictEqual(result.payload.showFinancialBreakdown, true);
  assert.strictEqual(result.payload.forceOpenModal, true);
  assert.ok(result.detectedActions.some(a => a.toLowerCase().includes('desglose financiero')));
  assert.ok(result.agentResponse.includes('Flete Marítimo'));
  assert.ok(result.agentResponse.includes('Costes FOB'));
  assert.ok(result.agentResponse.includes('All-In'));
});

test('6. AgenteProyectosWidget processes breakdown requests and reports explicit subtotals', () => {
  assert.match(widgetSource, /isBreakdownReq/);
  assert.match(widgetSource, /payloadObj\.requestFinancialBreakdown\s*=\s*true/);
  assert.match(widgetSource, /payloadObj\.showFinancialBreakdown\s*=\s*true/);
  assert.match(widgetSource, /Subtotal Flete Marítimo \/ TCE/);
  assert.match(widgetSource, /Subtotal Costes FOB/);
  assert.match(widgetSource, /Total Cotización \(All-In\)/);
});

test('7. ForwarderWorkspace renders separate Ocean Freight vs FOB subtotals in Cargo Builder modal', () => {
  assert.match(workspaceSource, /const\s*\[subtotalFreight,\s*setSubtotalFreight\]\s*=\s*useState/);
  assert.match(workspaceSource, /const\s*\[subtotalFobOperations,\s*setSubtotalFobOperations\]\s*=\s*useState/);
  assert.match(workspaceSource, /id="financial-breakdown-card"/);
  assert.match(workspaceSource, /id="subtotal-ocean-freight"/);
  assert.match(workspaceSource, /id="subtotal-fob-operations"/);
  assert.match(workspaceSource, /id="input-estimated-cost"/);
  assert.match(workspaceSource, /id="input-sale-price"/);
});

test('8. ForwarderWorkspace Executive Report displays separated financial table rows and subtotals', () => {
  assert.match(workspaceSource, /Flete Marítimo \(Base RT\)/);
  assert.match(workspaceSource, /Estiba y Trincaje \(Cuadrillas, Trincadores\)/);
  assert.match(workspaceSource, /Materiales Especiales \(MAFIs, Heavy Lift, Cadenas, Dunnage\)/);
  assert.match(workspaceSource, /Logística Periférica \(Almacenaje Portuario, Surveyor, Transporte Inland, Aduanas\)/);
  assert.match(workspaceSource, /Subtotal Flete Marítimo \/ TCE/);
  assert.match(workspaceSource, /Subtotal Costes FOB y Operativa Portuaria/);
  assert.match(workspaceSource, /PRECIO TOTAL DE VENTA AL CLIENTE/);
});
