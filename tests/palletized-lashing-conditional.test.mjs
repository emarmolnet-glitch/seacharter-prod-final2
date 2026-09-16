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

test('1. ForwarderWorkspace defines cargoCategory and isPalletizedOrBagsCargo state hooks', () => {
  assert.match(workspaceSource, /const\s+\[cargoCategory,\s*setCargoCategory\]\s*=\s*useState/);
  assert.match(workspaceSource, /const\s+\[isPalletizedOrBagsCargo,\s*setIsPalletizedOrBagsCargo\]\s*=\s*useState/);
});

test('2. ForwarderWorkspace defines handleCargoCategoryChange reactive callback and dropdown in Section 2', () => {
  assert.match(workspaceSource, /const\s+handleCargoCategoryChange\s*=\s*\(newCategory\)\s*=>/);
  assert.match(workspaceSource, /id="cargo-category-dropdown"/);
  assert.match(workspaceSource, /value="Carga Paletizada"/);
  assert.match(workspaceSource, /value="Carga de Proyecto \/ Heavy Lift"/);
});

test('3. Rule for Palletized / Bags / General Cargo: forces chains and shackles to 0 units and 0 cost', () => {
  // autoCalculateEstimates must detect palletized/sacos/general cargo
  assert.match(workspaceSource, /const\s+isPalletizedOrBags\s*=/);
  // Zeroes out chains and shackles
  assert.match(workspaceSource, /effectiveCadenas\s*=\s*0;/);
  assert.match(workspaceSource, /effectiveGrilletes\s*=\s*0;/);
  assert.match(workspaceSource, /setChainsBinders\(0\);/);
  assert.match(workspaceSource, /setShackles\(0\);/);
});

test('4. Dynamic Dunnage Label: switches to "Madera de Estiba / Airbags (Dunnage)" and uses light ratio', () => {
  assert.match(workspaceSource, /label=\{isPalletizedOrBagsCargo\s*\?\s*["']Madera de Estiba \/ Airbags \(Dunnage\)["']\s*:\s*["']Maderas de Estiba \(Dunnage\)["']\}/);
  assert.match(workspaceSource, /lightDunnageUnits\s*=\s*Math\.max\(1,\s*Math\.ceil\(totalWeightTons\s*\/\s*25\)\)/);
  assert.match(workspaceSource, /const\s+dunnageRate\s*=\s*isPalletizedOrBags\s*\?\s*20\s*:\s*30/);
});

test('5. Reactivity: Switching to "Carga de Proyecto / Heavy Lift" re-injects chains and shackles', () => {
  assert.match(workspaceSource, /setChains\(Cadenas\);/);
  assert.match(workspaceSource, /setShackles\(Grilletes\);/);
  assert.match(workspaceSource, /Perfil:\s*Carga Industrial de Proyecto \/ Breakbulk/);
  assert.match(workspaceSource, /Perfil:\s*Mercancía Paletizada \/ Sacos \(Calce Ligero\)/);
});

test('6. Backend project-parser: zeroes chains and shackles for palletized and sacos shipments', () => {
  const palletizedItems = [
    {
      id: 'pallets-cemento-1',
      category: 'Carga General / General Cargo',
      type: 'Palets de Sacos de Cemento',
      quantity: 100,
      length: 1.2,
      width: 0.8,
      height: 1.4,
      weight: 1200, // 120 t total
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(palletizedItems);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, palletizedItems);
  const profile = handler.buildOperationalProfile(palletizedItems, orderTotals);
  const breakdown = handler.calculateFinancialBreakdown(palletizedItems, orderTotals, charteringAssessment, profile, {});

  const fobItems = breakdown.fobAndPortOperations.items;

  // Lashing materials should be light calce with airbags, NEVER heavy chains G80
  const heavyLashing = fobItems.find(it => it.concept.includes('Cadenas G80') || it.concept.includes('Trincaje Pesado'));
  assert.equal(heavyLashing, undefined, 'No debe asignar cadenas G80 ni trincaje pesado a carga paletizada');

  const lightLashing = fobItems.find(it => it.concept.includes('Madera de Estiba / Airbags (Dunnage)'));
  assert.ok(lightLashing, 'Debe asignar materiales de sujeción ligeros con airbags y maderas');
  assert.ok(lightLashing.amount > 0, 'El coste ligero debe ser mayor que 0');
});

test('7. Backend project-parser: maintains heavy lashing chains and shackles for heavy lift cargo', () => {
  const projectItems = [
    {
      id: 'transformer-1',
      category: 'Maquinaria / Equipos Industriales',
      type: 'Transformador Eléctrico de Potencia',
      quantity: 1,
      length: 8.0,
      width: 4.0,
      height: 4.5,
      weight: 65000, // 65 t -> Heavy Lift
      shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
    },
  ];

  const orderTotals = handler.calculateOrderTotals(projectItems);
  const charteringAssessment = handler.evaluateCharteringModel(orderTotals, projectItems);
  const profile = handler.buildOperationalProfile(projectItems, orderTotals);
  const breakdown = handler.calculateFinancialBreakdown(projectItems, orderTotals, charteringAssessment, profile, {});

  const fobItems = breakdown.fobAndPortOperations.items;
  const heavyLashing = fobItems.find(it => it.concept.includes('Cadenas G80') || it.concept.includes('Trincaje Pesado'));
  assert.ok(heavyLashing, 'Debe mantener trincaje pesado con cadenas G80 para carga de proyecto');
});
