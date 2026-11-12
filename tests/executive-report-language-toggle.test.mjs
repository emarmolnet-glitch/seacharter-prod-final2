import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXECUTIVE_REPORT_DICTIONARY, toggleExecutiveReportLanguage } from '../src/executive-report-dictionary.mjs';

const modalComponentSource = readFileSync(
  new URL('../src/components/VoyageExecutiveReportModal.jsx', import.meta.url),
  'utf8'
);
const indexHtmlSource = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
);

test('1. EXECUTIVE_REPORT_DICTIONARY contiene todas las traducciones obligatorias requeridas', () => {
  assert.equal(EXECUTIVE_REPORT_DICTIONARY['Flete'], 'Freight');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY['Demoras'], 'Demurrage');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY['Buque / Detalles'], 'Vessel / Details');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY['Condiciones'], 'Terms & Conditions');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY['Puerto de Carga / Descarga'], 'Load Port / Discharge Port');

  assert.equal(EXECUTIVE_REPORT_DICTIONARY.en['Flete'], 'Freight');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.en['Demoras'], 'Demurrage');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.en['Buque / Detalles'], 'Vessel / Details');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.en['Condiciones'], 'Terms & Conditions');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.en['Puerto de Carga / Descarga'], 'Load Port / Discharge Port');

  assert.equal(EXECUTIVE_REPORT_DICTIONARY.es['Freight'], 'Flete');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.es['Demurrage'], 'Demoras');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.es['Vessel / Details'], 'Buque / Detalles');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.es['Terms & Conditions'], 'Condiciones');
  assert.equal(EXECUTIVE_REPORT_DICTIONARY.es['Load Port / Discharge Port'], 'Puerto de Carga / Descarga');
});

test('2. VoyageExecutiveReportModal.jsx integra selector de idioma con botones 🇪🇸 ES y 🇬🇧 EN en cabecera y pie', () => {
  assert.match(modalComponentSource, /id="report-language-toggle-group"/, 'Debe existir el grupo id="report-language-toggle-group"');
  assert.match(modalComponentSource, /id="btn-report-lang-es"/, 'Debe existir botón de idioma español');
  assert.match(modalComponentSource, /id="btn-report-lang-en"/, 'Debe existir botón de idioma inglés');
  assert.match(modalComponentSource, /id="btn-footer-report-lang-es"/, 'Debe existir botón de idioma español en pie de página');
  assert.match(modalComponentSource, /id="btn-footer-report-lang-en"/, 'Debe existir botón de idioma inglés en pie de página');
  assert.match(modalComponentSource, /🇪🇸 ES/, 'Debe contener la etiqueta 🇪🇸 ES');
  assert.match(modalComponentSource, /🇬🇧 EN/, 'Debe contener la etiqueta 🇬🇧 EN');
});

test('3. index.html define toggleExecutiveReportLanguage y EXECUTIVE_REPORT_DICTIONARY en window', () => {
  assert.match(indexHtmlSource, /window\.toggleExecutiveReportLanguage\s*=\s*toggleExecutiveReportLanguage/);
  assert.match(indexHtmlSource, /window\.EXECUTIVE_REPORT_DICTIONARY\s*=\s*EXECUTIVE_REPORT_DICTIONARY/);
  assert.match(indexHtmlSource, /'Flete':\s*'Freight'/);
  assert.match(indexHtmlSource, /'Demoras':\s*'Demurrage'/);
  assert.match(indexHtmlSource, /'Buque \/ Detalles':\s*'Vessel \/ Details'/);
  assert.match(indexHtmlSource, /'Condiciones':\s*'Terms & Conditions'/);
  assert.match(indexHtmlSource, /'Puerto de Carga \/ Descarga':\s*'Load Port \/ Discharge Port'/);
});

test('4. index.html integra selector de idioma (ES / EN) en vista previa y modal de reporte', () => {
  assert.match(indexHtmlSource, /id="report-language-toggle-group"/);
  assert.match(indexHtmlSource, /btn-report-lang-es/);
  assert.match(indexHtmlSource, /btn-report-lang-en/);
  assert.match(indexHtmlSource, /btn-footer-report-lang-es/);
  assert.match(indexHtmlSource, /btn-footer-report-lang-en/);
});

test('5. toggleExecutiveReportLanguage traduce dinámicamente etiquetas del DOM del reporte ejecutivo', () => {
  // Simular estructura DOM
  const mockElements = {
    flete: { textContent: 'Flete Sugerido (Tarifa de Venta): $45.00', nodeValue: 'Flete Sugerido (Tarifa de Venta): $45.00' },
    demoras: { textContent: 'Demoras: $12,000 / día', nodeValue: 'Demoras: $12,000 / día' },
    buque: { textContent: 'Buque / Detalles: MV Baltic Trader', nodeValue: 'Buque / Detalles: MV Baltic Trader' },
    condiciones: { textContent: 'Condiciones: GENCON 1994', nodeValue: 'Condiciones: GENCON 1994' },
    puertos: { textContent: 'Puerto de Carga / Descarga: Gijon ➔ Rotterdam', nodeValue: 'Puerto de Carga / Descarga: Gijon ➔ Rotterdam' }
  };

  const container = {
    id: 'executive-report-print-view',
    querySelectorAll: (sel) => Object.values(mockElements).map(el => ({
      closest: () => null,
      children: [],
      get textContent() { return el.textContent; },
      set textContent(v) { el.textContent = v; el.nodeValue = v; }
    }))
  };

  globalThis.document = {
    getElementById: (id) => id === 'executive-report-print-view' ? container : null,
    querySelectorAll: () => [],
    querySelector: () => null
  };
  globalThis.window = {
    currentExecutiveReportLang: 'es',
    dispatchEvent: () => true
  };

  // Alternar a inglés
  toggleExecutiveReportLanguage('en');
  assert.equal(globalThis.window.currentExecutiveReportLang, 'en');

  assert.ok(mockElements.flete.textContent.includes('Freight'), 'Debe traducir Flete a Freight');
  assert.ok(mockElements.demoras.textContent.includes('Demurrage'), 'Debe traducir Demoras a Demurrage');
  assert.ok(mockElements.buque.textContent.includes('Vessel / Details'), 'Debe traducir Buque / Detalles a Vessel / Details');
  assert.ok(mockElements.condiciones.textContent.includes('Terms & Conditions'), 'Debe traducir Condiciones a Terms & Conditions');
  assert.ok(mockElements.puertos.textContent.includes('Load Port / Discharge Port'), 'Debe traducir Puerto de Carga / Descarga a Load Port / Discharge Port');

  // Alternar de vuelta a español
  toggleExecutiveReportLanguage('es');
  assert.equal(globalThis.window.currentExecutiveReportLang, 'es');

  assert.ok(mockElements.flete.textContent.includes('Flete'), 'Debe restaurar Flete en español');
  assert.ok(mockElements.demoras.textContent.includes('Demoras'), 'Debe restaurar Demoras en español');
  assert.ok(mockElements.buque.textContent.includes('Buque / Detalles'), 'Debe restaurar Buque / Detalles en español');
  assert.ok(mockElements.condiciones.textContent.includes('Condiciones'), 'Debe restaurar Condiciones en español');
  assert.ok(mockElements.puertos.textContent.includes('Puerto de Carga / Descarga'), 'Debe restaurar Puerto de Carga / Descarga en español');
});
