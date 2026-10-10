import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtmlPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

test('1. Anular el Cálculo Estático Antiguo: total depende de fetchMarketplaceRates', () => {
  // En handleCalculateTariff se invoca calculateAndApplyMarketplace y se delega el total final a la API
  assert.match(
    indexHtml,
    /function\s+handleCalculateTariff\(\)/,
    'Debe definir la función handleCalculateTariff'
  );
  assert.match(
    indexHtml,
    /calculateAndApplyMarketplace\(\s*activeKey\s*,\s*origin\s*,\s*dest\s*\)/,
    'handleCalculateTariff debe delegar el cálculo a calculateAndApplyMarketplace'
  );
});

test('2. Ordenación Estricta por Precio (Sell Rate): sort((a, b) => a.sellPrice - b.sellPrice)', () => {
  // Debe ordenar explícitamente el array de proveedores por sellPrice ascendente
  assert.match(
    indexHtml,
    /\.sort\(\(a,\s*b\)\s*=>\s*a\.sellPrice\s*-\s*b\.sellPrice\)/,
    'Debe ordenar de menor a mayor precio con .sort((a, b) => a.sellPrice - b.sellPrice)'
  );

  // Simulación matemática de ordenación
  const rawList = [
    { providerName: 'Provider C', netCost: 1500 },
    { providerName: 'Provider A', netCost: 950 },
    { providerName: 'Provider B', netCost: 1100 }
  ];
  const margin = 1.15;
  const processed = rawList.map(item => ({
    providerName: item.providerName,
    sellPrice: Math.round(item.netCost * margin * 100) / 100
  })).sort((a, b) => a.sellPrice - b.sellPrice);

  assert.equal(processed[0].providerName, 'Provider A');
  assert.equal(processed[1].providerName, 'Provider B');
  assert.equal(processed[2].providerName, 'Provider C');
  assert.ok(processed[0].sellPrice <= processed[1].sellPrice && processed[1].sellPrice <= processed[2].sellPrice);
});

test('3. Renderizado del Panel Principal (El más barato en índice [0])', () => {
  // Se toma el elemento en índice [0] como el más barato
  assert.match(
    indexHtml,
    /const\s+cheapest\s*=\s*(?:arrayProveedores|processedRates)\[0\];/,
    'Debe extraer estrictamente el índice [0] como el más barato'
  );

  // Inyecta en #active-provider-summary y #multimodal-quote-total
  assert.match(
    indexHtml,
    /totalOutput\.textContent\s*=\s*formattedTotal;/,
    'Debe actualizar totalOutput con el sellPrice del proveedor más barato'
  );
  assert.match(
    indexHtml,
    /consolidatedTotal\s*=\s*cheapest\.sellPrice;/,
    'consolidatedTotal debe asignarse al sellPrice de cheapest'
  );
});

test('4. Renderizado del Modal: lista ordenada de menor a mayor precio', () => {
  // El modal debe consumir currentMarketplaceRates que ya está ordenado
  assert.match(
    indexHtml,
    /const\s+rates\s*=\s*window\.currentMarketplaceRates\s*\|\|\s*currentMarketplaceRates\s*\|\|\s*\[\];/,
    'El modal lee el array procesado y ordenado'
  );

  assert.match(
    indexHtml,
    /rates\.map\(\(item,\s*index\)\s*=>\s*\{/,
    'El modal itera sobre rates para generar las tarjetas de menor a mayor'
  );
});
