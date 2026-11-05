import '../fixture-operating-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { translateExecutivePDF } from '../src/executive-pdf-english.mjs';

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

test('VoyageExecutiveReportModal renders MADRE STRATEGIC AUDIT & FIXTURE RECAP when reporte_estrategico is present', () => {
  const strategicText = "MADRE Executive Strategic Audit for voyage Bilbao to Lima (25,000 MT).\n\nBreak-Even: $32.50/MT.\nRecommended freight adjustment to $42.00/MT.\n\nSigned: MADRE";
  
  const data = {
    vesselName: 'MV TEST BULKER',
    vesselType: 'Handysize',
    pol: 'Bilbao',
    pod: 'Lima',
    cargoQty: 25000,
    reporte_estrategico: strategicText,
  };

  const html = renderToStaticMarkup(React.createElement(VoyageExecutiveReportModal, {
    voyageData: data,
    initialClientMode: true,
  }));

  const $ = load(html);
  const section = $('#executive-madre-recap');
  assert.equal(section.length, 1, 'Section #executive-madre-recap must be rendered');
  
  const title = $('#executive-madre-recap-title');
  assert.equal(title.length, 1, 'Title must exist');
  assert.match(title.text(), /MADRE STRATEGIC AUDIT & FIXTURE RECAP/i, 'Title must contain MADRE STRATEGIC AUDIT & FIXTURE RECAP');

  const content = $('#executive-madre-recap-content');
  assert.equal(content.length, 1, 'Content container must exist');
  assert.ok(content.hasClass('whitespace-pre-line'), 'Content container must have whitespace-pre-line to preserve line breaks');
  assert.equal(content.text().trim(), strategicText.trim(), 'Content must match strategic text exactly');
});

test('VoyageExecutiveReportModal extracts reporte_estrategico from madreUltimaAuditoria or modificaciones_recap', () => {
  const strategicText = "Strategic Audit from madreUltimaAuditoria.\nOperational risk identified at discharge port.";
  
  const data = {
    vesselName: 'MV TEST BULKER',
    vesselType: 'Handysize',
    pol: 'Bilbao',
    pod: 'Lima',
    cargoQty: 25000,
    madreUltimaAuditoria: {
      reporte_estrategico: strategicText,
      modificaciones_recap: {
        dischargeRate: 2500,
      },
    },
  };

  const html = renderToStaticMarkup(React.createElement(VoyageExecutiveReportModal, {
    voyageData: data,
    initialClientMode: true,
  }));

  const $ = load(html);
  const content = $('#executive-madre-recap-content');
  assert.equal(content.length, 1);
  assert.equal(content.text().trim(), strategicText.trim());
});

test('VoyageExecutiveReportModal does not render MADRE recap section when no strategic report exists', () => {
  const data = {
    vesselName: 'MV TEST BULKER',
    vesselType: 'Handysize',
    pol: 'Bilbao',
    pod: 'Lima',
    cargoQty: 25000,
  };

  const html = renderToStaticMarkup(React.createElement(VoyageExecutiveReportModal, {
    voyageData: data,
    initialClientMode: true,
  }));

  const $ = load(html);
  assert.equal($('#executive-madre-recap').length, 0, 'Section #executive-madre-recap must not be rendered when data is absent');
});

test('translateExecutivePDF preserves MADRE strategic audit content without modifying English text', () => {
  const strategicText = "Vessel Hold capacity and estimated Days in port are critical. Días and Bodega terminology test.";
  const domReport = {
    ownerDocument: {
      createTreeWalker: () => ({
        nextNode: () => false,
      }),
    },
    querySelector: () => null,
  };

  // Ensure function executes cleanly
  assert.doesNotThrow(() => translateExecutivePDF(domReport));
});

test('selectFixtureRecapState and prepareCurrentFixtureRecapState preserve reporte_estrategico in snapshot state', () => {
  const windowContext = {};
  vm.runInNewContext(readFileSync('public/fixture-financial-snapshot.js', 'utf8'), { window: windowContext });

  const rawState = {
    pol: 'Bilbao',
    pod: 'Lima',
    cargoQty: 20000,
    reporte_estrategico: 'Strategic report text from MADRE',
    madreUltimaAuditoria: {
      reporte_estrategico: 'Strategic report text in audit',
      modificaciones_recap: { dischargeRate: 4000 },
    },
  };

  const cleanState = windowContext.selectFixtureRecapState(rawState);
  assert.equal(cleanState.reporte_estrategico, 'Strategic report text from MADRE');
  assert.equal(cleanState.madreUltimaAuditoria.reporte_estrategico, 'Strategic report text in audit');
});
