import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('1. Configuración Global de Margen: COMERCIAL_MARGIN definido al inicio de los scripts', () => {
  // Debe definir const COMERCIAL_MARGIN = 1.15; con el comentario específico
  assert.match(
    indexHtml,
    /const\s+COMERCIAL_MARGIN\s*=\s*1\.15;\s*\/\/\s*Añade un 15% de markup sobre el coste neto de la API/,
    'Debe definir COMERCIAL_MARGIN en 1.15 con el comentario exacto'
  );
  assert.match(
    indexHtml,
    /window\.COMERCIAL_MARGIN\s*=\s*COMERCIAL_MARGIN/,
    'Debe exponer COMERCIAL_MARGIN en window'
  );
});

test('2. Función Mock de la API: fetchMarketplaceRates devuelve estructura requerida por modo', async () => {
  // Verificación sintáctica en index.html
  assert.match(
    indexHtml,
    /async\s+function\s+fetchMarketplaceRates\s*\(\s*mode\s*,\s*origin\s*,\s*destination\s*\)/,
    'Debe declarar async function fetchMarketplaceRates(mode, origin, destination)'
  );
  assert.match(
    indexHtml,
    /\/\/\s*TODO:\s*Reemplazar este mock con una llamada fetch\(\) real al endpoint de iContainers/,
    'Debe incluir el comentario TODO de iContainers'
  );

  // Verificación funcional del mock ejecutando el extracto
  const scriptMatch = indexHtml.match(/async\s+function\s+fetchMarketplaceRates[\s\S]*?return\s+rates;\s*\}/);
  assert.ok(scriptMatch, 'Debe encontrarse el cuerpo de fetchMarketplaceRates');

  const evalFn = new Function(`
    return (${scriptMatch[0]});
  `);
  const fetchMarketplaceRates = evalFn();

  // Test Modo Aéreo
  const airRates = await fetchMarketplaceRates('air', 'MAD', 'JFK');
  assert.ok(Array.isArray(airRates), 'airRates debe ser un array');
  assert.equal(airRates.length, 3);
  const airProviders = airRates.map(r => r.providerName);
  assert.deepEqual(airProviders, ['American Airlines', 'Air Canada', 'Lufthansa Cargo']);
  airRates.forEach(r => {
    assert.equal(typeof r.providerName, 'string');
    assert.equal(typeof r.transitTime, 'string');
    assert.equal(typeof r.netCost, 'number');
  });

  // Test Modo Terrestre / LTL
  const groundRates = await fetchMarketplaceRates('ground', 'Miami', 'Atlanta');
  assert.ok(Array.isArray(groundRates), 'groundRates debe ser un array');
  assert.equal(groundRates.length, 3);
  const groundProviders = groundRates.map(r => r.providerName);
  assert.deepEqual(groundProviders, ['ACT', 'Southeastern Freight Lines', 'SAIA']);

  const ltlRates = await fetchMarketplaceRates('ltl', 'Miami', 'Atlanta');
  assert.deepEqual(ltlRates.map(r => r.providerName), ['ACT', 'Southeastern Freight Lines', 'SAIA']);

  // Test Modo FCL / LCL
  const fclRates = await fetchMarketplaceRates('fcl', 'Valencia', 'Jebel Ali');
  assert.ok(Array.isArray(fclRates), 'fclRates debe ser un array');
  assert.equal(fclRates.length, 4);
  const fclProviders = fclRates.map(r => r.providerName);
  assert.deepEqual(fclProviders, ['ZIM', 'Hapag-Lloyd', 'MSC', 'Maersk']);

  const lclRates = await fetchMarketplaceRates('lcl', 'Barcelona', 'Shanghai');
  assert.deepEqual(lclRates.map(r => r.providerName), ['ZIM', 'Hapag-Lloyd', 'MSC', 'Maersk']);
});

test('3. Seguridad y Margen: cálculo de sellPrice y prohibición de netCost en DOM', () => {
  // Debe contener la fórmula requerida
  assert.match(
    indexHtml,
    /const\s+sellPrice\s*=\s*item\.netCost\s*\*\s*COMERCIAL_MARGIN;/,
    'Debe calcular const sellPrice = item.netCost * COMERCIAL_MARGIN;'
  );

  // REGLA DE ORO: Ningún data-net-cost ni propiedad de coste neto expuesta en el HTML
  assert.doesNotMatch(
    indexHtml,
    /data-net-cost/i,
    'REGLA DE ORO: netCost nunca debe exponerse en atributos de datos (data-*)'
  );
  assert.doesNotMatch(
    indexHtml,
    /<[^>]+netCost[^>]*>/i,
    'REGLA DE ORO: netCost nunca debe exponerse en etiquetas HTML'
  );
});

test('4. Inyección en el Panel Principal (Quick Quote)', () => {
  // Debe existir el bloque #active-provider-summary oculto por defecto
  const summaryMatch = indexHtml.match(/<div\s+id="active-provider-summary"[\s\S]*?<\/div>/);
  assert.ok(summaryMatch, 'Debe existir el elemento #active-provider-summary');
  assert.match(summaryMatch[0], /\bhidden\b/, '#active-provider-summary debe iniciar con clase hidden');

  // Debe existir #active-provider-name
  assert.match(
    indexHtml,
    /id="active-provider-name"/,
    'Debe existir el elemento #active-provider-name'
  );

  // Debe existir el botón #btn-view-alternatives deshabilitado inicialmente
  const btnMatch = indexHtml.match(/<button\s+id="btn-view-alternatives"[^>]*>/);
  assert.ok(btnMatch, 'Debe existir el botón #btn-view-alternatives');
  assert.match(btnMatch[0], /\bdisabled\b/, '#btn-view-alternatives debe partir deshabilitado');

  // Inyección con etiqueta neutral: "Proveedor seleccionado (Mejor Tarifa)" y NUNCA "Recomendado"
  assert.match(
    indexHtml,
    /Proveedor seleccionado \(Mejor Tarifa\)/,
    'Debe usar la etiqueta neutral exacta "Proveedor seleccionado (Mejor Tarifa)"'
  );
  assert.doesNotMatch(
    indexHtml,
    /Proveedor\s+recomendado/i,
    'NO debe utilizar la palabra "Recomendado"'
  );

  // En handleCalculateTariff debe invocar calculateAndApplyMarketplace y actualizar #multimodal-quote-total
  assert.match(
    indexHtml,
    /calculateAndApplyMarketplace/,
    'handleCalculateTariff debe invocar la sincronización del marketplace'
  );
});

test('5. Modal de Alternativas (#modal-alternatives-marketplace)', () => {
  // Debe existir el modal #modal-alternatives-marketplace
  assert.match(
    indexHtml,
    /id="modal-alternatives-marketplace"/,
    'Debe existir el contenedor del modal #modal-alternatives-marketplace'
  );

  // Debe contener contenedor para resultados dinámicos
  assert.match(
    indexHtml,
    /id="modal-alternatives-results"/,
    'Debe existir #modal-alternatives-results para renderizar las tarjetas'
  );

  // Apertura y reseteo del contenedor de resultados al abrir
  assert.match(
    indexHtml,
    /resultsContainer\.innerHTML\s*=\s*['"]{2}/,
    'Debe vaciar el contenido previo del contenedor de resultados al abrir'
  );

  // Renderizado dinámico de tarjetas con nombre, tiempo de tránsito, sellPrice y botón Seleccionar
  assert.match(
    indexHtml,
    /Tiempo de tránsito:/,
    'Las tarjetas deben mostrar el tiempo de tránsito'
  );
  assert.match(
    indexHtml,
    />\s*Seleccionar\s*<\/button>/,
    'Cada tarjeta debe tener un botón con el texto exacto "Seleccionar"'
  );

  // selectMarketplaceProvider actualiza #multimodal-quote-total y #active-provider-name y cierra el modal
  assert.match(
    indexHtml,
    /function\s+selectMarketplaceProvider\s*\(/,
    'Debe implementar la función selectMarketplaceProvider'
  );
  assert.match(
    indexHtml,
    /closeMarketplaceAlternativesModal\(\)/,
    'selectMarketplaceProvider debe cerrar el modal tras seleccionar'
  );
});
