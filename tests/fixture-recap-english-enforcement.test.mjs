import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { register } from 'node:module';
import {
  formatMadreStrategicReportEnglish,
  translateCommodityToEnglish,
  isSpanishMaritimeText
} from '../src/madre-report-translator.mjs';

const loader = `
import { readFile } from 'node:fs/promises';
import ts from '${import.meta.resolve('typescript')}';
export async function load(url, context, nextLoad) {
  if (!url.endsWith('.jsx')) return nextLoad(url, context);
  const result = ts.transpileModule(await readFile(new URL(url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: url,
  });
  return { format: 'module', source: result.outputText, shortCircuit: true };
}`;
register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);
const { default: VoyageExecutiveReportModal } = await import('../src/components/VoyageExecutiveReportModal.jsx');

test('isSpanishMaritimeText identifies Spanish maritime and audit vocabulary', () => {
  assert.equal(isSpanishMaritimeText('Auditoría Estratégica Ejecutiva de MADRE para la operación Bilbao ➔ Lima'), true);
  assert.equal(isSpanishMaritimeText('El análisis financiero y operativo determina un Break-Even base de $32.50/MT'), true);
  assert.equal(isSpanishMaritimeText('Se detecta un cuello de botella relevante en el ritmo de descarga'), true);
  assert.equal(isSpanishMaritimeText('MADRE Executive Strategic Audit for voyage Bilbao to Lima (25,000 MT). Break-Even: $32.50/MT. Signed: MADRE'), false);
});

test('translateCommodityToEnglish maps Spanish commodities to professional maritime English', () => {
  assert.equal(translateCommodityToEnglish('Siderúrgico / Carga General'), 'STEEL PRODUCTS / GENERAL CARGO');
  assert.equal(translateCommodityToEnglish('Granel Sólido (Dry Bulk)'), 'DRY BULK');
  assert.equal(translateCommodityToEnglish('Cemento a Granel'), 'BULK CEMENT');
  assert.equal(translateCommodityToEnglish('Granos / Trigo'), 'GRAIN / BULK AGRICULTURAL');
  assert.equal(translateCommodityToEnglish('Chatarra'), 'SCRAP METAL');
  assert.equal(translateCommodityToEnglish('Mineral de Hierro'), 'IRON ORE / MINERAL BULK');
  assert.equal(translateCommodityToEnglish('Carbón'), 'COAL / DRY BULK');
});

test('formatMadreStrategicReportEnglish translates Spanish MADRE report into 4 professional BIMCO/GENCON sections', () => {
  const spanishReport = `Auditoría Estratégica Ejecutiva de MADRE para la operación Bilbao ➔ Lima (25.000 MT de Granel Sólido).

El análisis financiero y operativo determina un Break-Even base de $32.50/MT frente a un flete nominal de $35.00/MT (Margen neto actual: 7.1%). Flete ALL-IN GROSS: $42.00/MT (incluye JWC, lastre y comisiones); los incrementos estratégicos parten de este mínimo.

Se detecta un cuello de botella relevante en el ritmo de descarga (2.500 MT/d) que dilata la permanencia en muelle frente a los días efectivos de mar. Asimismo, la ausencia de cláusulas específicas de congestión y régimen WWD SHINC traslada incertidumbre al armador. Se recomienda formalizar la Opción B estratégica, ajustando el flete a $42.00/MT e implementando protecciones de plancha y laytime.`;

  const state = {
    pol: 'Bilbao',
    pod: 'Lima',
    cargoQty: 25000,
    commodity: 'Granel Sólido',
    breakEven: 32.50,
    allInRateGross: 42.00,
    dischargeRate: 2500,
    loadRate: 5000,
    demurrageRate: 31200,
    vesselName: 'MV NORDIC BULKER',
    vesselType: 'Geared Bulk Carrier'
  };

  const englishReport = formatMadreStrategicReportEnglish(spanishReport, state);

  assert.match(englishReport, /1\.\s*ROUTE\s*&\s*TRAFFIC:/, 'Must contain Section 1 header');
  assert.match(englishReport, /BILBAO.*LIMA/i, 'Must reference ports in Section 1');
  assert.match(englishReport, /2\.\s*VESSEL\s*DESIGNATION:/, 'Must contain Section 2 header');
  assert.match(englishReport, /MV NORDIC BULKER/i, 'Must reference vessel in Section 2');
  assert.match(englishReport, /3\.\s*CARGO\s*ANALYSIS:/, 'Must contain Section 3 header');
  assert.match(englishReport, /25,000 METRIC TONS 5% MOLOO OF DRY BULK/i, 'Must format cargo in Section 3');
  assert.match(englishReport, /WWD SHINC/i, 'Must reference WWD SHINC in Section 3');
  assert.match(englishReport, /4\.\s*FINANCIAL\s*&\s*FREIGHT\s*ANALYSIS:/, 'Must contain Section 4 header');
  assert.doesNotMatch(englishReport, /Base operational break-even/i, 'Must NOT reveal Break-Even in Section 4');
  assert.match(englishReport, /Agreed all-in freight rate fixed at USD \$42\.00\/MT \(protecting commercial net margin\)\./i, 'Must start with agreed freight in Section 4');
  assert.match(englishReport, /Option B strategic execution confirmed/i, 'Must reference Option B in Section 4');
  assert.match(englishReport, /Signed:\s*MADRE\s*$/, 'Must strictly end with Signed: MADRE');
});

test('prepareCurrentFixtureRecapState forces lang: en and translates reporte_estrategico', () => {
  const windowContext = {
    getCurrentFixtureRecapState: () => ({
      pol: 'Bilbao',
      pod: 'Callao',
      cargoQty: 30000,
      vesselName: 'MV ATLANTIC',
      vesselType: 'Handysize',
      breakEven: 28.50,
      allInRateGross: 39.00,
      loadRate: 5000,
      dischargeRate: 2200,
      demurrageRate: 28000,
    })
  };
  vm.runInNewContext(fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8'), { window: windowContext });

  const spanishAudit = {
    reporte_estrategico: 'Auditoría Estratégica Ejecutiva de MADRE para la operación Bilbao ➔ Callao (30.000 MT de Cemento a Granel). Se recomienda Opción B.',
    modificaciones_recap: { allInRateGross: 39.00 }
  };

  const prepared = windowContext.prepareCurrentFixtureRecapState({
    ...spanishAudit.modificaciones_recap,
    madreUltimaAuditoria: spanishAudit,
    reporte_estrategico: spanishAudit.reporte_estrategico
  }, { lang: 'en' });

  assert.equal(prepared.lang, 'en');
  assert.equal(prepared.language, 'en');
  assert.match(prepared.reporte_estrategico, /1\.\s*ROUTE\s*&\s*TRAFFIC:/);
  assert.match(prepared.reporte_estrategico, /4\.\s*FINANCIAL\s*&\s*FREIGHT\s*ANALYSIS:/);
  assert.match(prepared.reporte_estrategico, /Signed:\s*MADRE/);
  assert.match(prepared.madreUltimaAuditoria.reporte_estrategico, /Signed:\s*MADRE/);
});

test('buildFixtureRecapHTMLTemplate excludes Section 5 (internal MADRE audit) from commercial recap', () => {
  const htmlContent = fs.readFileSync('index.html', 'utf8');
  const start = htmlContent.indexOf('function resolveFixtureRecapOperations(');
  const end = htmlContent.indexOf('window.buildFixtureRecapHTMLTemplate =', start);
  const code = htmlContent.slice(start, end);

  const windowContext = {};
  vm.runInNewContext(fs.readFileSync('public/fixture-financial-snapshot.js', 'utf8'), { window: windowContext });

  const render = new Function('state', 'window', `${code}; return buildFixtureRecapHTMLTemplate(state);`);
  const html = render({
    pol: 'Rotterdam',
    pod: 'Houston',
    cargoQty: 45000,
    commodity: 'Siderúrgico / Carga General',
    vesselName: 'MV GLOBAL PRO',
    allInRateGross: 45.00,
    breakEven: 34.00,
    loadRate: 6000,
    dischargeRate: 3000,
    reporte_estrategico: 'Auditoría Estratégica Ejecutiva de MADRE para la operación Rotterdam ➔ Houston (45.000 MT). Flete ALL-IN GROSS: $45.00/MT.'
  }, windowContext);

  assert.doesNotMatch(html, /5\.\s*MADRE STRATEGIC AUDIT/);
  assert.doesNotMatch(html, /MADRE STRATEGIC AUDIT &amp; RECOMMENDATIONS/);
  assert.match(html, /END OF FIRM FIXTURE RECAP - RODAHMAR SHIPPING SL/);
});

test('VoyageExecutiveReportModal forces English translation of Spanish MADRE strategic report', () => {
  const spanishText = `Auditoría Estratégica Ejecutiva de MADRE para la operación Bilbao ➔ Lima (25.000 MT de Granel Sólido).
Break-Even base de $32.50/MT frente a flete nominal de $35.00/MT. Se recomienda Opción B con flete a $42.00/MT.`;

  const data = {
    vesselName: 'MV PACIFIC STAR',
    vesselType: 'Handysize',
    pol: 'Bilbao',
    pod: 'Lima',
    cargoQty: 25000,
    commodity: 'Granel Sólido',
    breakEven: 32.50,
    allInRateGross: 42.00,
    reporte_estrategico: spanishText,
    lang: 'en'
  };

  const html = renderToStaticMarkup(React.createElement(VoyageExecutiveReportModal, {
    voyageData: data,
    initialClientMode: true,
    initialLanguage: 'en'
  }));

  const $ = load(html);
  const content = $('#executive-madre-recap-content').text();

  assert.match(content, /1\.\s*ROUTE\s*&\s*TRAFFIC:/);
  assert.match(content, /2\.\s*VESSEL\s*DESIGNATION:/);
  assert.match(content, /3\.\s*CARGO\s*ANALYSIS:/);
  assert.match(content, /4\.\s*FINANCIAL\s*&\s*FREIGHT\s*ANALYSIS:/);
  assert.match(content, /Signed:\s*MADRE/);
  assert.doesNotMatch(content, /Auditoría Estratégica Ejecutiva/);
});
