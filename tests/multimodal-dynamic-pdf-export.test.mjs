import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('1. exportMultimodalClientPdf vincula el Modo/Incoterm al estado y tab activo', () => {
  // Debe mapear etiquetas de modalidades según la pestaña activa
  assert.match(indexHtml, /tabModalLabels\s*=\s*\{[^}]*amazon:\s*['"]Amazon FBA['"]/, 'Mapea pestaña amazon a "Amazon FBA"');
  assert.match(indexHtml, /tabModalLabels\s*=\s*\{[^}]*air:\s*['"]Aéreo['"]/, 'Mapea pestaña air a "Aéreo"');
  assert.match(indexHtml, /tabModalLabels\s*=\s*\{[^}]*ground:\s*['"]LTL Terrestre['"]/, 'Mapea pestaña ground a "LTL Terrestre"');
  assert.match(indexHtml, /activeBtn\?\.getAttribute\('data-multimodal-tab'\)/, 'Detecta el tab activo en la UI');
});

test('2. exportMultimodalClientPdf captura origen y destino específicos del tab activo', () => {
  assert.match(indexHtml, /activePol\s*=/, 'Define origen activo dinámico');
  assert.match(indexHtml, /activePod\s*=/, 'Define destino activo dinámico');
  assert.match(indexHtml, /TAB_ORIGIN_INPUT_IDS\[tabKey\]/, 'Mapea origen según pestaña activa');
  assert.match(indexHtml, /TAB_DEST_INPUT_IDS\[tabKey\]/, 'Mapea destino según pestaña activa');
  assert.match(indexHtml, /portOfLoading:\s*pol/, 'Asigna POL dinámico al payload');
  assert.match(indexHtml, /portOfDischarge:\s*pod/, 'Asigna POD dinámico al payload');
  assert.match(indexHtml, /maritimeRoute:\s*`\$\{pol\}\s*->\s*\$\{pod\}`/, 'Genera ruta dinámica');
});

test('3. exportMultimodalClientPdf utiliza la moneda y el total reactivos del panel Quick Quote', () => {
  assert.match(indexHtml, /const currentCurrency = getCurrentMultimodalCurrency\?\.()/, 'Consulta la divisa reactiva actual');
  assert.match(indexHtml, /document\.getElementById\('multimodal-quote-total'\)/, 'Lee el valor de salida del panel Quick Quote');
  assert.match(indexHtml, /totalSellAmount:\s*totalPrice/, 'Asigna el total del panel Quick Quote al totalSellAmount');
  assert.match(indexHtml, /currency,\s*proposedSellAmount:\s*totalPrice/, 'Aplica moneda y precio homogéneos en las líneas');
});

test('4. buildSalesQuotePdf usa la divisa correcta ($ o €) en el total destacado abajo a la derecha', () => {
  // No debe tener formatCurrency(payload.totalSellAmount, 'EUR') hardcodeado en la celda resumen
  assert.doesNotMatch(
    indexHtml,
    /doc\.text\(\s*formatCurrency\(payload\.totalSellAmount,\s*['"]EUR['"]\),\s*192,\s*tableEnd\s*\+\s*15/,
    'El total destacado no debe forzar siempre EUR'
  );
  assert.match(
    indexHtml,
    /const totalCurrency = payload\.currency === 'EUR' \? 'EUR' : 'USD';\s*doc\.text\(formatCurrency\(payload\.totalSellAmount,\s*totalCurrency\),\s*192,\s*tableEnd\s*\+\s*15/,
    'El total destacado debe respetar payload.currency (USD / EUR)'
  );
});

test('5. Simulación funcional de exportMultimodalClientPdf con jsPDF mock para Amazon FBA y moneda USD', () => {
  let savedFileName = '';
  let generatedPayload = null;

  class MockJsPdf {
    constructor() {
      this.lastAutoTable = { finalY: 100 };
    }
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    text(txt, x, y, opts) {
      if (typeof txt === 'string' && (txt.includes('$') || txt.includes('€'))) {
        this.renderedTotalText = txt;
      }
    }
    splitTextToSize(txt) {
      return [txt];
    }
    autoTable(opts) {
      this.tableOpts = opts;
    }
    save(filename) {
      savedFileName = filename;
    }
  }

  // Simular entorno DOM
  const mockElements = {
    'tab-btn-amazon': { getAttribute: (attr) => attr === 'data-multimodal-tab' ? 'amazon' : null, classList: { contains: () => true } },
    'amazon-origin-port': { value: 'Shenzhen / Ningbo (China)' },
    'amazon-fba-fc-code': { value: 'ONT8 - Moreno Valley, CA 92555' },
    'amazon-delivery-method': { value: 'DDP' },
    'multimodal-quote-total': { textContent: '$1,890.00' }
  };

  const fakeDocument = {
    querySelector: (selector) => {
      if (selector.includes('is-active')) {
        return mockElements['tab-btn-amazon'];
      }
      return null;
    },
    getElementById: (id) => mockElements[id] || null
  };

  // Extraer las funciones directamente desde index.html para ejecutarlas en sandbox
  const fnSliceMatch = indexHtml.match(/function buildSalesQuotePdf\(payload\) \{([\s\S]*?)\n            \}\n            async function applySaleAndGeneratePdf/);
  assert.ok(fnSliceMatch, 'Debe extraer buildSalesQuotePdf');

  const exportSliceMatch = indexHtml.match(/function exportMultimodalClientPdf\(customOptions = \{\}\) \{([\s\S]*?)\n            \}\n            function setWizardStep/);
  assert.ok(exportSliceMatch, 'Debe extraer exportMultimodalClientPdf');

  const formatCurrencyMatch = indexHtml.match(/function formatCurrency\(value, currency\) \{([\s\S]*?)\n            \}/);
  assert.ok(formatCurrencyMatch, 'Debe extraer formatCurrency');

  const safePdfTextMatch = indexHtml.match(/function safePdfText\(value\) \{([\s\S]*?)\n            \}/);
  assert.ok(safePdfTextMatch, 'Debe extraer safePdfText');

  const runSandbox = new Function('window', 'document', 'MockJsPdf', 'mockElements', `
    const el = (id) => document.getElementById(id);
    const ids = { total: 'multimodal-quote-total', legacyTotal: 'fcl-quote-total', mode: 'fcl-cargo-mode', incoterm: 'fcl-incoterm' };
    const TAB_ORIGIN_INPUT_IDS = { fcl: 'fcl-pol', lcl: 'lcl-pol', air: 'air-origin', ground: 'ground-pickup-zip', amazon: 'amazon-origin-port' };
    const TAB_DEST_INPUT_IDS = { fcl: 'fcl-pod', lcl: 'lcl-pod', air: 'air-dest', ground: 'ground-delivery-zip', amazon: 'amazon-fba-fc-code' };
    const TAB_MODE_LABELS = { fcl: 'FCL', lcl: 'LCL', air: 'AÉREO', ground: 'TERRESTRE', amazon: 'AMAZON FBA' };
    const EU_COUNTRIES = ['ES', 'FR', 'DE', 'IT', 'PT', 'NL', 'BE', 'UK', 'GB', 'IE'];

    function format(value) {
      return (Number(value) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function safePdfText(value) {
      ${safePdfTextMatch[1]}
    }
    function formatCurrency(value, currency) {
      ${formatCurrencyMatch[1]}
    }
    function buildSalesQuotePdf(payload) {
      ${fnSliceMatch[1]}
    }
    function getCurrentMultimodalCurrency() {
      return 'USD';
    }
    function getActiveMultimodalOrigin() {
      return mockElements['amazon-origin-port'].value;
    }
    function getActiveMultimodalDestination() {
      return mockElements['amazon-fba-fc-code'].value;
    }

    function exportMultimodalClientPdf(customOptions = {}) {
      ${exportSliceMatch[1]}
    }

    window.jspdf = { jsPDF: MockJsPdf };
    return { exportMultimodalClientPdf, buildSalesQuotePdf };
  `);

  const mockWindow = {};
  const { exportMultimodalClientPdf } = runSandbox(mockWindow, fakeDocument, MockJsPdf, mockElements);

  const doc = exportMultimodalClientPdf();
  assert.ok(doc, 'El documento debe haber sido generado');
  assert.ok(mockWindow.lastExportedClientQuotePdf, 'Debe registrar lastExportedClientQuotePdf');

  const exported = mockWindow.lastExportedClientQuotePdf;
  assert.equal(exported.totalPrice, 1890, 'El precio debe ser 1890 de Amazon FBA');
  assert.equal(exported.currency, 'USD', 'La moneda debe ser USD');

  // Verificar que el PDF renderizado en el mock no muestra € y usa $
  assert.match(doc.renderedTotalText, /\$1[.,]?890[.,]00/, 'El total renderizado en el PDF debe contener $');
  assert.doesNotMatch(doc.renderedTotalText, /€/, 'El total renderizado en el PDF en USD no debe contener €');
});
