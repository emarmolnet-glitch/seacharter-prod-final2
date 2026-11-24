import '../fixture-operating-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { register } from 'node:module';
import { evaluateRoutePortRestrictions } from '../shared/port-h16-sheet.mjs';
import { buildPortRestrictionReportModel, translateH16Warning } from '../src/report-port-restrictions.mjs';

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

const DOUALA = {
  quoting_and_operations: {
    max_loa_m: 225, max_beam_m: 34.6, geared_vessel_required: false,
    operational_warnings: [
      'Requiere cálculo de ventana de marea para navegación y desatraque (Rango de marea: 0.91m).',
      'Densidad de agua reducida (1.005 t/m³): verificar calado en agua dulce (Fresh Water Draft).',
      'Navegación nocturna no permitida o restringida a criterio de capitanía.',
    ],
  },
  restrictions_and_tides: { berth_draft_m: 13.11, tidal_range_m: 0.91, water_density: 1.005, channel_draft_low_m: 6.4, channel_draft_high_m: 7.62, tidal_window_required: true, night_navigation_allowed: false },
};
const ORAN = {
  quoting_and_operations: { max_loa_m: 175, max_beam_m: 26.9, operational_warnings: [], geared_vessel_required: false },
  restrictions_and_tides: { berth_draft_m: 10.06, tidal_range_m: 0.3, water_density: 1.025, channel_draft_low_m: 23.16, channel_draft_high_m: 28, tidal_window_required: false, night_navigation_allowed: null },
};

function snapshot() {
  const evaluation = evaluateRoutePortRestrictions(
    [
      { role: 'POL', name: 'Oran (DZ)', port: { h16Sheet: ORAN } },
      { role: 'POD', name: 'Douala (CM)', port: { h16Sheet: JSON.stringify(DOUALA) } },
    ],
    { draftM: 9.91, tpc: 45, cargoTons: 30000 },
  );
  return { ...evaluation, breakEvenImpactPerMt: 14.37, baseBreakEven: 25, fixtureClauseAdvice: 'Restricciones H16: POD Douala (CM): restricción de puerto. POD Douala (CM): ventana de marea obligatoria.' };
}

const FINANCIAL_LEAK = /break-even|\$\s?\d|\/MT|TCE|margen|margin|buffer|Recorte|reduction|días|days|coste|cost/i;

test('internal model exposes vessel fit, buffer, cargo cut, $/MT impact and clauses', () => {
  const model = buildPortRestrictionReportModel(snapshot(), { audience: 'internal', lang: 'es' });
  const pod = model.ports.find((port) => port.role === 'POD');
  const text = JSON.stringify(model);
  assert.match(text, /7\.62 m \(Canal pleamar\) · bajamar 6\.40 m/);
  assert.match(text, /9\.91 m → 10\.11 m/);
  assert.equal(pod.status.critical, true);
  assert.match(pod.status.text, /calado \+2\.49 m/);
  assert.equal(model.summary.totalBuffer, '+0.50 días');
  assert.match(model.summary.cargoCut, /MT/);
  assert.equal(model.summary.breakEvenImpact, '+$14.37/MT');
  assert.ok(model.clauses.length >= 2);
  const pol = model.ports.find((port) => port.role === 'POL');
  assert.match(JSON.stringify(pol.lines), /10\.06 m \(Muelle\)/);
  assert.match(JSON.stringify(pol.lines), /175 m/);
});

test('client model keeps nautical data and conditions but strips every financial/internal value', () => {
  for (const lang of ['es', 'en']) {
    const model = buildPortRestrictionReportModel(snapshot(), { audience: 'client', lang });
    assert.equal(model.summary, undefined);
    assert.equal(model.clauses, undefined);
    model.ports.forEach((port) => {
      assert.equal(port.status, undefined);
      port.lines.forEach((line) => assert.doesNotMatch(`${line.label} ${line.value}`, FINANCIAL_LEAK));
      port.conditions.forEach((condition) => assert.doesNotMatch(condition, /\$|\/MT|break-even|buffer|días|days/i));
    });
    const text = JSON.stringify(model);
    assert.match(text, /7\.62 m/);
    assert.match(text, /225 m/);
    assert.match(text, /1\.005/);
    assert.match(text, lang === 'en' ? /Always Safely Afloat/ : /Always Safely Afloat/);
  }
});

test('H16 warnings are translated in English mode', () => {
  assert.equal(
    translateH16Warning('Navegación nocturna no permitida o restringida a criterio de capitanía.', 'en'),
    "Night navigation not permitted or restricted at the Harbour Master's discretion.",
  );
  assert.match(translateH16Warning(DOUALA.quoting_and_operations.operational_warnings[0], 'en'), /tidal range: 0\.91m/);
});

test('executive report modal renders real H16 data and censors client mode', () => {
  const data = { vesselName: 'TBN', vesselType: 'Handysize', pol: 'Oran (DZ)', pod: 'Douala (CM)', cargoQty: 30000, portRestrictions: snapshot() };
  const internal = load(renderToStaticMarkup(React.createElement(VoyageExecutiveReportModal, { voyageData: data, initialClientMode: false })));
  const internalSection = internal('#executive-port-restrictions');
  assert.equal(internalSection.attr('data-report-audience'), 'internal');
  assert.match(internalSection.text(), /10\.11 m/);
  assert.match(internalSection.text(), /\+\$14\.37\/MT/);
  assert.doesNotMatch(internal.html(), /conforme a carta náutica/);

  const client = load(renderToStaticMarkup(React.createElement(VoyageExecutiveReportModal, { voyageData: data, initialClientMode: true })));
  const clientSection = client('#executive-port-restrictions');
  assert.equal(clientSection.attr('data-report-audience'), 'client');
  assert.match(clientSection.text(), /7\.62 m \(Canal pleamar\)/);
  assert.match(clientSection.text(), /Sin navegación nocturna|No permitida/);
  assert.doesNotMatch(clientSection.text(), /\$|\/MT|break-even|buffer|Recorte|10\.11|margen/i);
});

test('report falls back to the generic text when no H16 data is available', () => {
  const html = renderToStaticMarkup(React.createElement(VoyageExecutiveReportModal, { voyageData: { pol: 'Bilbao', pod: 'Lima', cargoQty: 1000 } }));
  assert.match(html, /conforme a carta náutica/);
});
