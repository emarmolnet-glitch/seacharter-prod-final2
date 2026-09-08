import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');
const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

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

test('1. project-parser: captures insuranceCost / seguroMercancia and adds it to fobPortOperationsItems under Servicios Asociados', () => {
  const items = [
    {
      id: 'pipe-1',
      category: 'Tuberías / Pipes',
      type: 'Tubería de Acero Carbono',
      quantity: 50,
      weight: 2000, // 100 MT
      length: 12.0,
      width: 0.5,
      height: 0.5,
      shipping_mode_supported: 'Breakbulk / Convencional',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const assessment = handler.evaluateCharteringModel(orderTotals, items);
  const profile = handler.buildOperationalProfile(items, orderTotals);

  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, assessment, profile, {
    currency: 'USD',
    surveyorCost: 1500,
    inlandCost: 3000,
    insuranceCost: 4500,
    customsCost: 200000, // Mercancía
  });

  const itemsList = breakdown.fobAndPortOperations.items;
  const insuranceItem = itemsList.find(it => it.concept.includes('Seguro de Mercancía'));

  assert.ok(insuranceItem, 'Debe existir una partida de Seguro de Mercancía en fobPortOperationsItems');
  assert.equal(insuranceItem.category, 'Servicios Asociados', 'La categoría debe ser "Servicios Asociados"');
  assert.equal(insuranceItem.amount, 4500, 'El importe del seguro debe coincidir con insuranceCost');
  assert.ok(insuranceItem.description && insuranceItem.description.length > 20, 'Debe incluir una descripción técnica detallada (póliza marítima/ICC A/CIF)');
});

test('2. project-parser: fob_mas_mercancia_unitario_usd_mt is mathematically exact: (subtotalFobPortOperations en USD) / toneladas without internal duplication', () => {
  const items = [
    {
      id: 'equipment-1',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Módulo de Compresión de Gas',
      quantity: 2,
      weight: 50000, // 100 MT
      length: 8.0,
      width: 4.0,
      height: 3.5,
      shipping_mode_supported: 'Heavy Lift / Carga de Proyecto',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const assessment = handler.evaluateCharteringModel(orderTotals, items);
  const profile = handler.buildOperationalProfile(items, orderTotals);

  const insuranceVal = 5000;
  const mercanciaVal = 150000;

  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, assessment, profile, {
    currency: 'USD',
    surveyorCost: 2000,
    inlandCost: 4000,
    insuranceCost: insuranceVal,
    customsCost: mercanciaVal,
  });

  const toneladas = breakdown.toneladas;
  assert.equal(toneladas, 100, 'El tonelaje debe ser exactamente 100 MT');

  const subtotalFobUsd = breakdown.subtotalFobPortOperations;
  assert.ok(subtotalFobUsd > 0, 'subtotalFobPortOperations debe ser positivo');

  // La fórmula matemática exacta sin duplicidades: subtotalFobPortOperations / toneladas
  const expectedFobMasMercanciaRatio = Math.round((subtotalFobUsd / toneladas) * 100) / 100;
  assert.equal(breakdown.fob_mas_mercancia_unitario_usd_mt, expectedFobMasMercanciaRatio, 'fob_mas_mercancia_unitario_usd_mt debe ser exactamente subtotalFobPortOperations / toneladas');

  // Comprobar que en unitRatios también coincide exactamente
  assert.equal(breakdown.unitRatios.fob_mas_mercancia_unitario_usd_mt, expectedFobMasMercanciaRatio);
  assert.equal(breakdown.unitRatios.currency, 'USD/MT');
});

test('3. extractRouteAndOperationalOptions parses insuranceCost and seguroMercancia from text and options', () => {
  const extractedFromText = handler.extractRouteAndOperationalOptions('POL Valencia POD Houston seguro mercancia 3500');
  assert.equal(extractedFromText.insuranceCost, 3500);

  const extractedFromOptions = handler.extractRouteAndOperationalOptions('', { seguroMercancia: 2800 });
  assert.equal(extractedFromOptions.insuranceCost, 2800);
  assert.equal(extractedFromOptions.seguroMercancia, 2800);
});

test('4. ForwarderWorkspace Section 4: Logística Periférica has (USD) labels and Seguro Mercancía (USD) input', () => {
  assert.match(forwarderSource, /4\.\s*Logística Periférica/);
  assert.match(forwarderSource, /Surveyor \(USD\)/, 'Debe existir la etiqueta Surveyor (USD)');
  assert.match(forwarderSource, /Transporte Inland \(USD\)/, 'Debe existir la etiqueta Transporte Inland (USD)');
  assert.match(forwarderSource, /Mercancía \(USD\)/, 'Debe existir la etiqueta Mercancía (USD)');
  assert.match(forwarderSource, /Seguro Mercancía \(USD\)/, 'Debe existir la etiqueta Seguro Mercancía (USD)');
  assert.match(forwarderSource, /id="input-insurance-cost"/, 'Debe existir el input numérico id="input-insurance-cost"');
  assert.match(forwarderSource, /setInsuranceCost/, 'Debe utilizar el setter reactivo setInsuranceCost');
});

test('5. ForwarderWorkspace Section 5: Desglose Financiero Separado renders subtotals natively in USD without 0.92 conversion', () => {
  assert.match(forwarderSource, /Subtotal Flete Marítimo \/ TCE/);
  assert.match(forwarderSource, /id="subtotal-ocean-freight"[^>]*>\{subtotalFreight\}<\/span>\s*<span[^>]*>USD<\/span>/, 'Subtotal Flete debe tener badge USD');
  assert.match(forwarderSource, /id="subtotal-fob-operations"[^>]*>\{subtotalFobOperations\}<\/span>\s*<span[^>]*>USD<\/span>/, 'Subtotal FOB debe tener badge USD');
  assert.match(forwarderSource, /diasRotacionTotal \* effectiveDailyHire \* 100/);
});

test('6. ForwarderWorkspace Bottom Cards: Coste Total Estimado and Precio Venta show USD natively with $ symbol', () => {
  assert.match(forwarderSource, /Coste Total Estimado \(\$\)/, 'Coste Total Estimado debe indicar ($)');
  assert.match(forwarderSource, /Precio Venta a Cliente \(\$\)/, 'Precio Venta a Cliente debe indicar ($)');
  assert.match(forwarderSource, /id="input-estimated-cost"/, 'Input Coste Total Estimado debe estar presente');
  assert.match(forwarderSource, /id="input-sale-price"/, 'Input Precio Venta a Cliente debe estar presente');
  assert.match(forwarderSource, />\$<\/span>\s*<input id="input-estimated-cost"/, 'Coste Total Estimado debe mostrar el símbolo $');
  assert.match(forwarderSource, />\$<\/span>\s*<input id="input-sale-price"/, 'Precio Venta a Cliente debe mostrar el símbolo $');
});

test('7. ForwarderWorkspace Executive Report: includes dedicated row for Seguro de Mercancía a Todo Riesgo and USD currency formatting', () => {
  assert.match(forwarderSource, /formatCurrency\s*=\s*\(val\)\s*=>\s*'\$'\s*\+\s*Number\(val/, 'formatCurrency del reporte ejecutivo debe usar formato $');
  assert.match(forwarderSource, /Seguro de Mercancía a Todo Riesgo/, 'El reporte ejecutivo debe incluir fila para Seguro de Mercancía a Todo Riesgo');
  assert.match(forwarderSource, /Póliza marítima de seguro a todo riesgo para la mercancía bajo cobertura de cláusulas ICC A del Instituto de Londres \(condiciones CIF\)/, 'Debe incluir descripción técnica detallada del seguro CIF');
});
