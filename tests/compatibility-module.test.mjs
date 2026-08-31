import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const moduleJs = readFileSync(new URL('../src/compatibilidad-module.js', import.meta.url), 'utf8');
const moduleCss = readFileSync(new URL('../compatibilidad.css', import.meta.url), 'utf8');
const netlifyFn = readFileSync(new URL('../netlify/functions/vessel-compatibility.ts', import.meta.url), 'utf8');

test('index.html positions COMPATIBILIDAD exactly between DECISIONES and TRACKING in PRIMARY_MODULES', () => {
  const primaryModulesIndex = indexHtml.indexOf('const PRIMARY_MODULES = [');
  const primaryModulesEnd = indexHtml.indexOf('];', primaryModulesIndex);
  const primaryModulesSlice = indexHtml.slice(primaryModulesIndex, primaryModulesEnd);

  const decisionesIndex = primaryModulesSlice.indexOf("{ id: 'decisiones', label: 'Decisiones' }");
  const compatibilidadIndex = primaryModulesSlice.indexOf("{ id: 'compatibilidad', label: 'Compatibilidad' }");
  const trackingIndex = primaryModulesSlice.indexOf("{ id: 'tracking', label: 'Tracking'");

  assert.ok(decisionesIndex !== -1, 'decisiones module must exist in PRIMARY_MODULES');
  assert.ok(compatibilidadIndex !== -1, 'compatibilidad module must exist in PRIMARY_MODULES');
  assert.ok(trackingIndex !== -1, 'tracking module must exist in PRIMARY_MODULES');

  assert.ok(decisionesIndex < compatibilidadIndex, 'compatibilidad must be placed after decisiones');
  assert.ok(compatibilidadIndex < trackingIndex, 'compatibilidad must be placed before tracking');
});

test('index.html contains view-compatibilidad section and references css and module script', () => {
  assert.match(indexHtml, /id="view-compatibilidad"/, 'index.html must have view-compatibilidad container');
  assert.match(indexHtml, /href="\.\/compatibilidad\.css"/, 'index.html must link compatibilidad.css');
  assert.match(indexHtml, /src="\.\/src\/compatibilidad-module\.js"/, 'index.html must load compatibilidad-module.js');
  assert.match(indexHtml, /if\s*\(tabId\s*===\s*'compatibilidad'\)\s*\{\s*window\.mountCompatibilityModule\?\.\(targetView\);/, 'switchTab must mount compatibilidad');
});

test('Cabecera de Carga Activa reflects commercial operation parameters', () => {
  assert.match(moduleJs, /Cement in Bulk \(Clinker\)/, 'Must include Clinker in bulk cargo');
  assert.match(moduleJs, /10000|10,000\s*MT/, 'Must include 10,000 MT volume');
  assert.match(moduleJs, /Bejaia/, 'Must include POL Bejaia');
  assert.match(moduleJs, /🇩🇿/, 'Must include Algeria flag');
  assert.match(moduleJs, /Almería|Almeria/, 'Must include POD Almería');
  assert.match(moduleJs, /🇪🇸/, 'Must include Spain flag');
  assert.match(moduleJs, /10\/15 Sep/, 'Must include Laycan 10/15 Sep');
  assert.match(moduleJs, /3,000 MT\/WW|3000/, 'Must include loading rate 3,000 MT/WW');
});

test('Bloque Izquierdo implements live radar density with strict non-commercial exclusion filter', () => {
  assert.match(moduleJs, /Radar en Vivo/i, 'Must have Radar en Vivo header');
  assert.match(moduleJs, /Densidad POL/i, 'Must have POL density context');
  assert.match(moduleJs, /Pesqueros|Remolcadores|Tugs|Recreo/i, 'Must explicitly declare strict exclusion of fishing and tugs');
  assert.match(moduleJs, /verifiedImo|IMO/i, 'Must display valid IMO');
  assert.match(moduleJs, /Posición Actual|distanciaPolNm|NM de POL/i, 'Must display POL position & distance');
  assert.match(moduleJs, /Estado Operativo|navStatus/i, 'Must display operational status');

  // Also verify backend function has strict non-commercial regex
  assert.match(netlifyFn, /STRICT_NON_COMMERCIAL_RE/, 'Backend function must have strict non-commercial filter');
  assert.match(netlifyFn, /fishing|pesquero|trawler|tug|tugboat|remolcador/i, 'Backend function must exclude fishing and tugs');
});

test('Bloque Derecho implements Neon DB vessels_master technical spec cross-reference', () => {
  assert.match(moduleJs, /Neon DB/i, 'Must reference Neon DB');
  assert.match(moduleJs, /vessels_master/i, 'Must reference vessels_master table');
  assert.match(moduleJs, /Deadweight|DWT/i, 'Must display DWT');
  assert.match(moduleJs, /Calado Máximo|draftMeters/i, 'Must display maximum draft');
  assert.match(moduleJs, /Factor de Estiba|stowageFactor/i, 'Must display stowage factor');
  assert.match(moduleJs, /vesselType/i, 'Must display vessel type');

  // Verify backend function queries vessels_master table in Neon Postgres
  assert.match(netlifyFn, /FROM vessels_master/, 'Backend function must query vessels_master table');
  assert.match(netlifyFn, /draft_meters|dwt|vessel_type|stowageFactor/, 'Backend function must select technical specs');
});

test('Bloque Inferior highlights optimal candidate with dynamic score and quick action buttons', () => {
  assert.match(moduleJs, /renderBottomTopMatchHero/, 'Must implement hero renderer for optimal candidate');
  assert.match(moduleJs, /hero-compatibility-score|compatibility-score-number/, 'Must display dynamic compatibility score');
  assert.match(moduleJs, /Justificación Técnica|technicalJustification/i, 'Must include technical justification');
  assert.match(moduleJs, /id="btn-bloquear-fletamento"/, 'Must include [ Bloquear Fletamento ] button');
  assert.match(moduleJs, /id="btn-activar-due-diligence"/, 'Must include [ Activar Due Diligence (Auditoría) ] button');
  assert.match(moduleJs, /handleLockCharter/, 'Must handle lock charter action');
  assert.match(moduleJs, /handleTriggerDueDiligence/, 'Must handle due diligence trigger action');
});

test('compatibilidad.css provides required styles and animations', () => {
  assert.match(moduleCss, /#view-compatibilidad/, 'Must define styles for #view-compatibilidad');
  assert.match(moduleCss, /\.compatibility-cargo-header/, 'Must define header styles');
  assert.match(moduleCss, /\.radar-pulse-dot|\.radarPulse/, 'Must define live radar pulse animation');
  assert.match(moduleCss, /\.compatibility-grid-two-column/, 'Must define two-column layout');
  assert.match(moduleCss, /\.btn-compat-lock/, 'Must define lock charter button styling');
  assert.match(moduleCss, /\.btn-compat-audit/, 'Must define audit button styling');
});
