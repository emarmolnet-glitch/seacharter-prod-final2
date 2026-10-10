import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('1. index.html contiene el botón #btn-checkout-booking con disabled inicial', () => {
  const btnMatch = indexHtml.match(/<button\s+id="btn-checkout-booking"[\s\S]*?<\/button>/);
  assert.ok(btnMatch, 'Debe existir el botón #btn-checkout-booking en index.html');
  assert.match(btnMatch[0], /\bdisabled\b/, 'El botón #btn-checkout-booking debe iniciar como disabled');
  assert.match(btnMatch[0], /Confirmar Booking y Pagar|fa-credit-card/, 'Debe contener icono o texto de confirmación');
});

test('2. Habilitación dinámica en updateQuickQuoteForTab según el valor calculado', () => {
  // Debe evaluar si el valor calculado es mayor a 0
  assert.match(
    indexHtml,
    /calculatedValue\s*>\s*0/,
    'Debe evaluar si el valor calculado es mayor a 0'
  );

  // Si es mayor a 0, quita disabled de checkout, pdf y sync
  assert.match(
    indexHtml,
    /checkoutBtn\.removeAttribute\(['"]disabled['"]\)/,
    'Debe eliminar el atributo disabled de #btn-checkout-booking si el valor > 0'
  );
  assert.match(
    indexHtml,
    /pdfBtn\.removeAttribute\(['"]disabled['"]\)/,
    'Debe eliminar el atributo disabled de #fcl-export-client-pdf-btn si el valor > 0'
  );
  assert.match(
    indexHtml,
    /syncBtn\.removeAttribute\(['"]disabled['"]\)/,
    'Debe eliminar el atributo disabled de #btn-sync-databridge-quote si el valor > 0'
  );

  // Si es 0, vuelve a aplicarles el atributo disabled
  assert.match(
    indexHtml,
    /checkoutBtn\.setAttribute\(['"]disabled['"],\s*['"]disabled['"]\)/,
    'Debe volver a aplicar disabled a #btn-checkout-booking si es 0'
  );
  assert.match(
    indexHtml,
    /pdfBtn\.setAttribute\(['"]disabled['"],\s*['"]disabled['"]\)/,
    'Debe volver a aplicar disabled a #fcl-export-client-pdf-btn si es 0'
  );
  assert.match(
    indexHtml,
    /syncBtn\.setAttribute\(['"]disabled['"],\s*['"]disabled['"]\)/,
    'Debe volver a aplicar disabled a #btn-sync-databridge-quote si es 0'
  );
});

test('3. Event listener de checkout con secuencia exacta', () => {
  // Bloquear UI: disabled = true a los 3 botones
  assert.match(
    indexHtml,
    /currentCheckoutBtn\.disabled\s*=\s*true/,
    'Bloquear UI: checkout disabled = true'
  );
  assert.match(
    indexHtml,
    /pdfBtn\.disabled\s*=\s*true/,
    'Bloquear UI: pdfBtn disabled = true'
  );
  assert.match(
    indexHtml,
    /syncBtn\.disabled\s*=\s*true/,
    'Bloquear UI: syncBtn disabled = true'
  );

  // Estado de carga: innerHTML con spinner y Procesando...
  assert.match(
    indexHtml,
    /<i class="fa-solid fa-spinner fa-spin text-white"><\/i><span>Procesando\.\.\.<\/span>/,
    'Estado de carga con spinner y Procesando...'
  );

  // Temporizador de 1000ms
  assert.match(
    indexHtml,
    /setTimeout\s*\(\s*function\s*\(\)\s*\{[\s\S]*?1000\s*\)/,
    'Simulación con setTimeout de 1000ms'
  );

  // Alert con texto exacto
  assert.match(
    indexHtml,
    /alert\(["']Iniciando conexión con pasarela de pago segura\.\.\. \(Proveedor pendiente de integración\)["']\)/,
    'Alert con el texto exacto requerido'
  );

  // Restaurar UI: innerHTML original y quitar disabled de los 3 botones
  assert.match(
    indexHtml,
    /<i class="fa-solid fa-credit-card"><\/i><span>Confirmar Booking y Pagar<\/span>/,
    'Restaurar innerHTML original del botón checkout'
  );
  assert.match(
    indexHtml,
    /currentCheckoutBtn\.removeAttribute\(['"]disabled['"]\)/,
    'Quitar disabled del botón de checkout tras el alert'
  );
  assert.match(
    indexHtml,
    /pdfBtn\.removeAttribute\(['"]disabled['"]\)/,
    'Quitar disabled del botón de PDF tras el alert'
  );
  assert.match(
    indexHtml,
    /syncBtn\.removeAttribute\(['"]disabled['"]\)/,
    'Quitar disabled del botón de Data Bridge tras el alert'
  );
});

test('4. Inicialización en DOMContentLoaded', () => {
  assert.match(
    indexHtml,
    /document\.addEventListener\(['"]DOMContentLoaded['"],\s*\(\)\s*=>\s*\{[\s\S]*?initCheckoutBookingListener\(\)/,
    'initCheckoutBookingListener debe ejecutarse en DOMContentLoaded'
  );
});

test('5. Simulación de ejecución en tiempo de ejecución (click en #btn-checkout-booking)', async () => {
  const mockCheckoutBtn = {
    disabled: false,
    dataset: {},
    attributes: {},
    innerHTML: '<i class="fa-solid fa-credit-card"></i><span>Confirmar Booking y Pagar</span>',
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    listeners: {},
    addEventListener(evt, fn) { this.listeners[evt] = fn; },
    click() { if (this.listeners['click']) this.listeners['click']({ preventDefault() {} }); }
  };
  const mockPdfBtn = {
    disabled: false,
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; }
  };
  const mockSyncBtn = {
    disabled: false,
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; }
  };

  const elements = {
    'btn-checkout-booking': mockCheckoutBtn,
    'fcl-export-client-pdf-btn': mockPdfBtn,
    'btn-sync-databridge-quote': mockSyncBtn
  };

  const codeMatch = indexHtml.match(/function\s+initCheckoutBookingListener\(\)\s*\{([\s\S]*?)\n\s*\}\n\s*window\.generateFallbackBillingItems/);
  assert.ok(codeMatch, 'Debe encontrarse initCheckoutBookingListener');

  let alertMessage = null;
  const originalAlert = global.alert;
  const originalDoc = global.document;
  const originalWindow = global.window;

  global.window = {};
  global.alert = (msg) => { alertMessage = msg; };
  global.document = {
    getElementById: (id) => elements[id] || null
  };

  try {
    const fn = new Function('document', 'setTimeout', 'alert', 'window', codeMatch[0] + '; return initCheckoutBookingListener;');
    const initListener = fn(global.document, setTimeout, global.alert, global.window);
    initListener();

    // Trigger click
    mockCheckoutBtn.click();

    // Right after click: UI must be locked and innerHTML in loading state
    assert.strictEqual(mockCheckoutBtn.disabled, true, 'Checkout button must be disabled immediately');
    assert.strictEqual(mockPdfBtn.disabled, true, 'PDF button must be disabled immediately');
    assert.strictEqual(mockSyncBtn.disabled, true, 'Sync button must be disabled immediately');
    assert.match(mockCheckoutBtn.innerHTML, /fa-spinner.*Procesando\.\.\./, 'Checkout button shows spinner and Procesando...');

    // Wait 1100ms for simulation to resolve
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // After timeout: alert was called and UI is restored
    assert.strictEqual(alertMessage, "Iniciando conexión con pasarela de pago segura... (Proveedor pendiente de integración)");
    assert.strictEqual(mockCheckoutBtn.disabled, false, 'Checkout button must be re-enabled');
    assert.strictEqual(mockPdfBtn.disabled, false, 'PDF button must be re-enabled');
    assert.strictEqual(mockSyncBtn.disabled, false, 'Sync button must be re-enabled');
    assert.match(mockCheckoutBtn.innerHTML, /fa-credit-card.*Confirmar Booking y Pagar/, 'Checkout button restored to original innerHTML');
  } finally {
    global.alert = originalAlert;
    global.document = originalDoc;
    global.window = originalWindow;
  }
});

test('6. Vigilante de Precio: MutationObserver inyectado en window.initSeaCharterMultimodalModule', () => {
  // Verificación estricta de presencia del MutationObserver
  assert.match(
    indexHtml,
    /\/\/\s*VIGILANTE DE PRECIO:\s*Desbloqueo dinámico de botones de acción/,
    'Debe incluir el comentario del Vigilante de Precio'
  );
  assert.match(
    indexHtml,
    /const\s+totalOutputElement\s*=\s*document\.getElementById\('multimodal-quote-total'\);/,
    'Debe obtener totalOutputElement con document.getElementById("multimodal-quote-total")'
  );
  assert.match(
    indexHtml,
    /const\s+priceObserver\s*=\s*new\s+MutationObserver\(function\(mutations\)\s*\{/,
    'Debe instanciar priceObserver = new MutationObserver(function(mutations) {...})'
  );
  assert.match(
    indexHtml,
    /priceObserver\.observe\(totalOutputElement,\s*\{\s*childList:\s*true,\s*characterData:\s*true,\s*subtree:\s*true\s*\}\);/,
    'Debe observar con childList: true, characterData: true, subtree: true'
  );

  // Verificación funcional del observador
  let observerCallback = null;
  class MockMutationObserver {
    constructor(cb) {
      observerCallback = cb;
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
    }
  }

  const mockTotalOut = {
    textContent: '€0.00'
  };
  const mockCheckout = {
    disabled: true,
    removeAttribute(k) { if (k === 'disabled') this.disabled = false; },
    setAttribute(k) { if (k === 'disabled') this.disabled = true; },
    classList: { remove() {}, add() {} }
  };
  const mockPdf = {
    disabled: true,
    removeAttribute(k) { if (k === 'disabled') this.disabled = false; },
    setAttribute(k) { if (k === 'disabled') this.disabled = true; },
    classList: { remove() {}, add() {} }
  };
  const mockSync = {
    disabled: true,
    removeAttribute(k) { if (k === 'disabled') this.disabled = false; },
    setAttribute(k) { if (k === 'disabled') this.disabled = true; },
    classList: { remove() {}, add() {} }
  };

  const getEl = (id) => {
    if (id === 'multimodal-quote-total') return mockTotalOut;
    if (id === 'btn-checkout-booking') return mockCheckout;
    if (id === 'fcl-export-client-pdf-btn') return mockPdf;
    if (id === 'btn-sync-databridge-quote') return mockSync;
    return null;
  };

  const codeSegment = indexHtml.match(/\/\/\s*VIGILANTE DE PRECIO:[\s\S]*?priceObserver\.observe\([^)]+\);\s*\}/);
  assert.ok(codeSegment, 'Debe extraerse el bloque del MutationObserver');

  const runner = new Function('document', 'MutationObserver', codeSegment[0]);
  runner({ getElementById: getEl }, MockMutationObserver);

  assert.ok(observerCallback, 'Callback de MutationObserver registrado');

  // Caso 1: precio cambia a > 0 (€1.482,00)
  mockTotalOut.textContent = '€1.482,00';
  observerCallback([]);
  assert.strictEqual(mockCheckout.disabled, false, 'Checkout se desbloquea con precio > 0');
  assert.strictEqual(mockPdf.disabled, false, 'PDF se desbloquea con precio > 0');
  assert.strictEqual(mockSync.disabled, false, 'Sync se desbloquea con precio > 0');

  // Caso 2: precio vuelve a €0.00
  mockTotalOut.textContent = '€0.00';
  observerCallback([]);
  assert.strictEqual(mockCheckout.disabled, true, 'Checkout se bloquea con precio 0');
  assert.strictEqual(mockPdf.disabled, true, 'PDF se bloquea con precio 0');
  assert.strictEqual(mockSync.disabled, true, 'Sync se bloquea con precio 0');
});

