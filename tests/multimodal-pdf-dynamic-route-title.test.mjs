import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const fclModuleJs = fs.readFileSync(path.join(rootDir, 'fcl-module.js'), 'utf-8');

test('1. index.html y fcl-module.js exponen window.exportMultimodalClientPdf y window.generarPDF', () => {
  assert.match(indexHtml, /window\.exportMultimodalClientPdf\s*=\s*exportMultimodalClientPdf/);
  assert.match(indexHtml, /window\.generarPDF\s*=\s*exportMultimodalClientPdf/);
  assert.match(fclModuleJs, /window\.exportMultimodalClientPdf\s*=\s*exportMultimodalClientPdf/);
  assert.match(fclModuleJs, /window\.generarPDF\s*=\s*generarPDF/);
});

test('2. buildSalesQuotePdf renderiza dinámicamente el título de ruta según el modo', () => {
  const fnSliceMatch = indexHtml.match(/function buildSalesQuotePdf\(payload\) \{([\s\S]*?)\n            \}\n            async function applySaleAndGeneratePdf/);
  assert.ok(fnSliceMatch, 'Debe extraer buildSalesQuotePdf');

  const safePdfTextMatch = indexHtml.match(/function safePdfText\(value\) \{([\s\S]*?)\n            \}/);
  assert.ok(safePdfTextMatch, 'Debe extraer safePdfText');

  const formatCurrencyMatch = indexHtml.match(/function formatCurrency\(value, currency\) \{([\s\S]*?)\n            \}/);
  assert.ok(formatCurrencyMatch, 'Debe extraer formatCurrency');

  function createSandbox() {
    const linesRendered = [];
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
        linesRendered.push({ txt, x, y });
      }
      splitTextToSize(txt) {
        return [txt];
      }
      autoTable() {}
      save() {}
    }

    const runSandbox = new Function('window', 'document', 'MockJsPdf', `
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
      window.jspdf = { jsPDF: MockJsPdf };
      return { buildSalesQuotePdf };
    `);

    const mockWindow = {};
    const fakeDocument = {
      querySelector: () => null
    };

    const { buildSalesQuotePdf } = runSandbox(mockWindow, fakeDocument, MockJsPdf);
    return { buildSalesQuotePdf, linesRendered };
  }

  // AÉREO / air
  {
    const { buildSalesQuotePdf, linesRendered } = createSandbox();
    buildSalesQuotePdf({
      quoteId: 'TEST-AIR',
      mode: 'AÉREO',
      portOfLoading: 'MAD',
      portOfDischarge: 'JFK',
      totalSellAmount: 1500,
      currency: 'EUR'
    });
    const routeLine = linesRendered.find(l => l.y === 50);
    assert.ok(routeLine, 'Debe renderizar la línea de ruta en Y=50');
    assert.match(routeLine.txt, /^Ruta Aérea:\s*MAD\s*->\s*JFK/);
  }

  // air en minúsculas
  {
    const { buildSalesQuotePdf, linesRendered } = createSandbox();
    buildSalesQuotePdf({
      quoteId: 'TEST-AIR-2',
      mode: 'air',
      portOfLoading: 'BCN',
      portOfDischarge: 'MIA',
      totalSellAmount: 1600,
      currency: 'USD'
    });
    const routeLine = linesRendered.find(l => l.y === 50);
    assert.ok(routeLine);
    assert.match(routeLine.txt, /^Ruta Aérea:\s*BCN\s*->\s*MIA/);
  }

  // TERRESTRE / ground
  {
    const { buildSalesQuotePdf, linesRendered } = createSandbox();
    buildSalesQuotePdf({
      quoteId: 'TEST-GROUND',
      mode: 'TERRESTRE',
      portOfLoading: '90001',
      portOfDischarge: '94102',
      totalSellAmount: 800,
      currency: 'USD'
    });
    const routeLine = linesRendered.find(l => l.y === 50);
    assert.ok(routeLine);
    assert.match(routeLine.txt, /^Ruta Terrestre:\s*90001\s*->\s*94102/);
  }

  // ground en minúsculas / LTL Terrestre
  {
    const { buildSalesQuotePdf, linesRendered } = createSandbox();
    buildSalesQuotePdf({
      quoteId: 'TEST-GROUND-2',
      mode: 'LTL Terrestre',
      portOfLoading: 'Madrid',
      portOfDischarge: 'Valencia',
      totalSellAmount: 450,
      currency: 'EUR'
    });
    const routeLine = linesRendered.find(l => l.y === 50);
    assert.ok(routeLine);
    assert.match(routeLine.txt, /^Ruta Terrestre:\s*Madrid\s*->\s*Valencia/);
  }

  // FCL
  {
    const { buildSalesQuotePdf, linesRendered } = createSandbox();
    buildSalesQuotePdf({
      quoteId: 'TEST-FCL',
      mode: 'FCL',
      portOfLoading: 'Valencia',
      portOfDischarge: 'New York',
      totalSellAmount: 2200,
      currency: 'USD'
    });
    const routeLine = linesRendered.find(l => l.y === 50);
    assert.ok(routeLine);
    assert.match(routeLine.txt, /^Ruta Marítima:\s*Valencia\s*->\s*New York/);
  }

  // LCL
  {
    const { buildSalesQuotePdf, linesRendered } = createSandbox();
    buildSalesQuotePdf({
      quoteId: 'TEST-LCL',
      mode: 'LCL',
      portOfLoading: 'Shanghai',
      portOfDischarge: 'Barcelona',
      totalSellAmount: 1100,
      currency: 'EUR'
    });
    const routeLine = linesRendered.find(l => l.y === 50);
    assert.ok(routeLine);
    assert.match(routeLine.txt, /^Ruta Marítima:\s*Shanghai\s*->\s*Barcelona/);
  }
});

test('3. exportMultimodalClientPdf detecta la pestaña activa del DOM para determinar el título de ruta', () => {
  const fnSliceMatch = indexHtml.match(/function buildSalesQuotePdf\(payload\) \{([\s\S]*?)\n            \}\n            async function applySaleAndGeneratePdf/);
  const exportSliceMatch = indexHtml.match(/function exportMultimodalClientPdf\(customOptions = \{\}\) \{([\s\S]*?)\n            \}\n            function setWizardStep/);
  const formatCurrencyMatch = indexHtml.match(/function formatCurrency\(value, currency\) \{([\s\S]*?)\n            \}/);
  const safePdfTextMatch = indexHtml.match(/function safePdfText\(value\) \{([\s\S]*?)\n            \}/);

  function executeExportForTab(tabKey, originVal, destVal) {
    const linesRendered = [];
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
        linesRendered.push({ txt, x, y });
      }
      splitTextToSize(txt) {
        return [txt];
      }
      autoTable() {}
      save() {}
    }

    const mockElements = {
      'fcl-pol': { value: 'Valencia Port' },
      'fcl-pod': { value: 'New York Port' },
      'air-origin': { value: 'MAD - Madrid Barajas' },
      'air-dest': { value: 'JFK - John F Kennedy' },
      'ground-pickup-zip': { value: '90001 Los Angeles' },
      'ground-delivery-zip': { value: '94102 San Francisco' },
      'multimodal-quote-total': { textContent: '2,500.00' }
    };

    const activeTabBtn = {
      getAttribute: (attr) => attr === 'data-multimodal-tab' ? tabKey : null,
      classList: { contains: () => true }
    };

    const fakeDocument = {
      querySelector: (selector) => {
        if (selector.includes('is-active')) {
          return activeTabBtn;
        }
        return null;
      },
      getElementById: (id) => mockElements[id] || null
    };

    const runSandbox = new Function('window', 'document', 'MockJsPdf', 'mockElements', `
      const el = (id) => document.getElementById(id);
      const ids = { total: 'multimodal-quote-total', legacyTotal: 'fcl-quote-total', mode: 'fcl-cargo-mode', incoterm: 'fcl-incoterm' };
      const TAB_ORIGIN_INPUT_IDS = { fcl: 'fcl-pol', lcl: 'lcl-pol', air: 'air-origin', ground: 'ground-pickup-zip', amazon: 'amazon-origin-port' };
      const TAB_DEST_INPUT_IDS = { fcl: 'fcl-pod', lcl: 'lcl-pod', air: 'air-dest', ground: 'ground-delivery-zip', amazon: 'amazon-fba-fc-code' };
      const TAB_MODE_LABELS = { fcl: 'FCL', lcl: 'LCL', air: 'AÉREO', ground: 'TERRESTRE', amazon: 'AMAZON FBA' };

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
      const getActiveMultimodalOrigin = null;
      const getActiveOriginValue = null;
      const getActiveMultimodalDestination = null;
      const getActiveDestValue = null;
      const getCurrentMultimodalCurrency = null;
      const detectOriginCurrency = null;

      function exportMultimodalClientPdf(customOptions = {}) {
        ${exportSliceMatch[1]}
      }

      window.jspdf = { jsPDF: MockJsPdf };
      return { exportMultimodalClientPdf, buildSalesQuotePdf };
    `);

    const mockWindow = {};
    const { exportMultimodalClientPdf } = runSandbox(mockWindow, fakeDocument, MockJsPdf, mockElements);
    exportMultimodalClientPdf();
    return linesRendered;
  }

  // Pestaña activa AIR
  const airLines = executeExportForTab('air');
  const airRouteLine = airLines.find(l => l.y === 50);
  assert.ok(airRouteLine, 'Debe renderizar línea de ruta para tab air');
  assert.match(airRouteLine.txt, /^Ruta Aérea:\s*MAD - Madrid Barajas\s*->\s*JFK - John F Kennedy/);

  // Pestaña activa GROUND
  const groundLines = executeExportForTab('ground');
  const groundRouteLine = groundLines.find(l => l.y === 50);
  assert.ok(groundRouteLine, 'Debe renderizar línea de ruta para tab ground');
  assert.match(groundRouteLine.txt, /^Ruta Terrestre:\s*90001 Los Angeles\s*->\s*94102 San Francisco/);

  // Pestaña activa FCL
  const fclLines = executeExportForTab('fcl');
  const fclRouteLine = fclLines.find(l => l.y === 50);
  assert.ok(fclRouteLine, 'Debe renderizar línea de ruta para tab fcl');
  assert.match(fclRouteLine.txt, /^Ruta Marítima:\s*Valencia Port\s*->\s*New York Port/);
});
