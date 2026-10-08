import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fclModuleJs = readFileSync(new URL('../fcl-module.js', import.meta.url), 'utf8');

test('1. Estado de Carga (Loading State): Spinner y Skeleton Loader en Quick Quote y Desglose', () => {
  // Quick Quote loader element
  assert.match(indexHtml, /id="quick-quote-loader"/, 'Debe existir id="quick-quote-loader"');
  assert.match(indexHtml, /animate-spin/, 'Debe contener animación de spinner');
  assert.match(indexHtml, /skeleton-shimmer/, 'Debe contener skeleton shimmer en el panel');
  assert.match(indexHtml, /Sincronizando cotización multimodal|Data Bridge en curso/, 'Debe informar estado asíncrono');

  // Breakdown field loaders
  assert.match(indexHtml, /id="fcl-net-price-loader"/, 'Debe existir loader en campo flete base');
  assert.match(indexHtml, /id="fcl-markup-loader"/, 'Debe existir loader en campo markup');
  assert.match(indexHtml, /id="breakdown-net-loader"/, 'Debe existir loader en desglose net price');
  assert.match(indexHtml, /id="breakdown-markup-loader"/, 'Debe existir loader en desglose markup');

  // JS control function
  assert.match(indexHtml, /function setMultimodalLoadingState\(/, 'Debe definir setMultimodalLoadingState');
  assert.match(indexHtml, /window\.setMultimodalLoadingState\s*=/, 'Debe exponer setMultimodalLoadingState en window');
  assert.match(indexHtml, /window\.setMultimodalLoading\s*=/, 'Debe exponer alias setMultimodalLoading en window');
});

test('2. Actualización de Quick Quote: Panel renderiza estricta y únicamente totalPrice', () => {
  assert.match(indexHtml, /id="fcl-quote-total"/, 'Debe existir fcl-quote-total');
  assert.match(indexHtml, /Precio final de venta consolidado/, 'Debe documentar precio final de venta');

  // Lógica de inyección y renderizado
  assert.match(indexHtml, /function applyDataBridgeMultimodalQuote\(/, 'Debe definir applyDataBridgeMultimodalQuote');
  assert.match(indexHtml, /window\.lastDataBridgeMultimodalQuote\s*=/, 'Debe registrar lastDataBridgeMultimodalQuote');
  assert.match(indexHtml, /totalEl\.textContent\s*=\s*formattedTotal/, 'fcl-quote-total debe renderizar estrictamente el totalPrice formateado');
  assert.match(indexHtml, /Neto\s*\+\s*Margen/, 'El tooltip debe indicar la suma de Neto + Margen sin exponer desglose interno en el valor principal');
});

test('3. Desglose Interno para el Operador: Flete Base read-only con Badge Data Bridge y Margen Comercial', () => {
  // Campo "Flete Base (Proveedor API)"
  assert.match(indexHtml, /Flete Base \(Proveedor API\)/, 'Debe contener la etiqueta Flete Base (Proveedor API)');
  assert.match(indexHtml, /id="fcl-net-price"[^>]*readonly/, 'fcl-net-price debe ser read-only');
  assert.match(indexHtml, /aria-readonly="true"/, 'fcl-net-price debe incluir aria-readonly="true"');
  assert.match(indexHtml, /databridge-sync-badge/, 'Debe incluir clase databridge-sync-badge');
  assert.match(indexHtml, /Sincronizado Data Bridge/, 'Debe mostrar badge con texto "Sincronizado Data Bridge"');

  // Campo "Margen Comercial (Agencia)"
  assert.match(indexHtml, /Margen Comercial \(Agencia\)/, 'Debe contener la etiqueta Margen Comercial (Agencia)');
  assert.match(indexHtml, /id="fcl-markup"/, 'Debe existir id="fcl-markup"');

  // Desglose en sección 06 Total Dinámico
  assert.match(indexHtml, /id="breakdown-net-price"/, 'Debe existir breakdown-net-price en Total Dinámico');
  assert.match(indexHtml, /id="breakdown-markup"/, 'Debe existir breakdown-markup en Total Dinámico');

  // Mapeo en JS
  assert.match(indexHtml, /netInput\.value\s*=\s*formatCurrency\(netPrice,\s*currency\)/, 'netInput debe mapear netPrice');
  assert.match(indexHtml, /markupInput\.value\s*=\s*formatCurrency\(markup,\s*currency\)/, 'markupInput debe mapear markup');
});

test('4. Exportación a PDF / Cliente: Campos internos (netPrice y markup) ocultos y concepto consolidado "Flete Total Multimodal"', () => {
  // Función de exportación de cliente
  assert.match(indexHtml, /function exportMultimodalClientPdf\(/, 'Debe existir exportMultimodalClientPdf');
  assert.match(indexHtml, /window\.exportMultimodalClientPdf\s*=/, 'Debe exponer exportMultimodalClientPdf en window');
  assert.match(indexHtml, /id="fcl-export-client-pdf-btn"/, 'Debe existir botón de exportar cliente en UI');

  // Concepto consolidado único
  assert.match(indexHtml, /'Flete Total Multimodal'/, 'Debe exportar el concepto consolidado exacto "Flete Total Multimodal"');
  assert.match(indexHtml, /proposedSellAmount:\s*totalPrice/, 'El concepto debe recibir el valor de totalPrice');

  // Ocultamiento de costes internos en cliente
  assert.match(indexHtml, /isClientMode/, 'buildSalesQuotePdf debe contemplar isClientMode');
  assert.match(
    indexHtml,
    /Exportación para Cliente:\s*netPrice y markup quedan totalmente ocultos/,
    'Debe documentar que netPrice y markup quedan totalmente ocultos'
  );
  assert.match(
    indexHtml,
    /FLETE TOTAL MULTIMODAL/,
    'Bloque total del PDF debe rotular FLETE TOTAL MULTIMODAL'
  );
});

test('5. Sincronización bidireccional y eventos de Data Bridge en fcl-module.js e index.html', () => {
  assert.match(indexHtml, /window\.addEventListener\('DATABRIDGE_MULTIMODAL_QUOTE'/, 'Escucha evento DATABRIDGE_MULTIMODAL_QUOTE');
  assert.match(indexHtml, /window\.addEventListener\('databridge:multimodal-quote'/, 'Escucha evento databridge:multimodal-quote');
  assert.match(indexHtml, /window\.addEventListener\('DATABRIDGE_MULTIMODAL_LOADING'/, 'Escucha evento DATABRIDGE_MULTIMODAL_LOADING');
  assert.match(indexHtml, /window\.addEventListener\('databridge:multimodal-loading'/, 'Escucha evento databridge:multimodal-loading');

  // Sincronización en fcl-module.js
  assert.match(fclModuleJs, /ids\.netPrice\s*=\s*'fcl-net-price'|netPrice:\s*'fcl-net-price'/, 'fcl-module.js mapea netPrice');
  assert.match(fclModuleJs, /ids\.markup\s*=\s*'fcl-markup'|markup:\s*'fcl-markup'/, 'fcl-module.js mapea markup');
  assert.match(fclModuleJs, /applyDataBridgeMultimodalQuote/, 'fcl-module.js expone o enlaza applyDataBridgeMultimodalQuote');
  assert.match(fclModuleJs, /exportMultimodalClientPdf/, 'fcl-module.js expone o enlaza exportMultimodalClientPdf');
});

test('6. Endpoint Netlify Function: /api/databridge-multimodal-quote devuelve estructura de cotización esperada', () => {
  const fnSource = readFileSync(new URL('../netlify/functions/databridge-multimodal-quote.ts', import.meta.url), 'utf8');
  assert.match(fnSource, /path:\s*["']\/api\/databridge-multimodal-quote["']/, 'Ruta de la función configurada');
  assert.match(fnSource, /netPrice/, 'Maneja netPrice');
  assert.match(fnSource, /markup/, 'Maneja markup');
  assert.match(fnSource, /totalPrice/, 'Calcula y devuelve totalPrice');
  assert.match(fnSource, /syncedFrom:\s*["']Data Bridge["']/, 'Etiqueta sincronizado desde Data Bridge');
});

test('7. Layout Global 2 Columnas y Rediseño Light Theme del Panel Quick Quote', () => {
  // Grid responsive 2 columnas
  assert.match(indexHtml, /grid-cols-1\s+lg:grid-cols-12/, 'Debe utilizar layout de 2 columnas responsive grid-cols-1 lg:grid-cols-12');
  assert.match(indexHtml, /lg:col-span-8|lg:col-span-9/, 'Columna izquierda debe tener col-span-8 o 9');
  assert.match(indexHtml, /lg:col-span-4|lg:col-span-3/, 'Columna derecha debe tener col-span-4 o 3');
  assert.match(indexHtml, /sticky\s+top-4/, 'Columna derecha debe tener sticky top-4');

  // Rediseño Light Theme (eliminar fondos oscuros en el panel extraído)
  assert.match(indexHtml, /id="multimodal-quick-quote-panel"[^>]*bg-white/, 'Panel debe tener fondo blanco bg-white');
  assert.match(indexHtml, /border\s+border-slate-200/, 'Panel debe tener borde border-slate-200');
  assert.match(indexHtml, /rounded-xl/, 'Panel debe tener esquinas rounded-xl');
  assert.match(indexHtml, /shadow-sm/, 'Panel debe tener sombra ligera shadow-sm');

  // Tipografía corporativa grande para el precio total
  assert.match(indexHtml, /id="multimodal-quote-total"[^>]*text-3xl/, 'Total debe ser grande (text-3xl)');
  assert.match(indexHtml, /text-slate-800/, 'Total debe usar color corporativo slate-800');

  // fcl-module.js mapea el ID unificado
  assert.match(fclModuleJs, /total:\s*'multimodal-quote-total'/, 'fcl-module.js debe tener total apuntando a multimodal-quote-total');
});


