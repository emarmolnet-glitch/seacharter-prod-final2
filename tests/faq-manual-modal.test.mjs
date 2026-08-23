import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distIndexSource = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

test('index.html and dist/index.html contain top-bar FAQ button and openFaqModal function', () => {
  for (const html of [indexSource, distIndexSource]) {
    // Header access button
    assert.match(html, /id="btn-open-faq-modal"/);
    assert.match(html, /onclick="openFaqModal\(\)"/);
    assert.match(html, /<span>FAQ<\/span>/);

    // JS functions
    assert.match(html, /function openFaqModal\(\)/);
    assert.match(html, /function closeFaqModal\(\)/);
    assert.match(html, /function exportFaqToPdf\(\)/);
    assert.match(html, /window\.openFaqModal = openFaqModal/);
  }
});

test('FAQ modal matches the Data Bridge help layout and required Core PRO guides', () => {
  for (const html of [indexSource, distIndexSource]) {
    // Modal container and two-column shell
    assert.match(html, /id="faq-modal"[^>]*items-start/);
    assert.match(html, /id="faq-modal"[^>]*pt-20/);
    assert.match(html, /id="faq-modal"[^>]*z-\[100\]/);
    assert.match(html, /id="faq-manual-content"/);
    assert.match(html, /h-\[85vh\]/);
    assert.match(html, /w-\[90vw\]/);
    assert.match(html, /rounded-2xl/);
    assert.match(html, /shadow-2xl/);
    assert.match(html, /w-\[30%\]/);
    assert.match(html, /w-\[70%\]/);
    assert.match(html, /id="btn-export-faq-pdf"/);
    assert.match(html, /onclick="exportFaqToPdf\(\)"/);

    // Sidebar and content header
    assert.match(html, /SEACHARTER CORE PRO/);
    assert.match(html, /bg-\[#0f172a\]/);
    assert.match(html, /CENTRO DE AYUDA/);
    assert.match(html, /<h1[^>]*>FAQ y Guía de Uso<\/h1>/);
    assert.match(html, /overflow-y-auto bg-white/);

    // Required cards and accent palette
    assert.match(html, /id="faq-step-tce"[^>]*border border-slate-200 rounded-xl p-6 mb-6/);
    assert.match(html, /Calculadora TCE/);
    assert.match(html, /Búnker/);
    assert.match(html, /Mapa Globe\.gl/);
    assert.match(html, /Riesgos portuarios/);
    assert.match(html, />BDI</);
    assert.match(html, />CBAM</);
    assert.match(html, /w-12 h-12 rounded-xl flex[^>]*bg-teal-50 text-teal-600">01/);
    assert.match(html, /w-12 h-12 rounded-xl flex[^>]*bg-indigo-50 text-indigo-600">02/);
    assert.match(html, /w-12 h-12 rounded-xl flex[^>]*bg-amber-50 text-amber-600">03/);

    // PDF filename
    assert.match(html, /SeaCharter_Core_PRO_Manual\.pdf/);
  }
});
