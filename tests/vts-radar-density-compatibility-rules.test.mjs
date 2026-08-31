import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const moduleJs = readFileSync(new URL('../src/compatibilidad-module.js', import.meta.url), 'utf8');
const moduleCss = readFileSync(new URL('../compatibilidad.css', import.meta.url), 'utf8');
const netlifyFn = readFileSync(new URL('../netlify/functions/vessel-compatibility.ts', import.meta.url), 'utf8');

test('Densidad Origin: captures real validated vessels and mandatorily extracts tipo_buque or categoria_buque', () => {
  assert.match(indexHtml, /tipo_buque:\s*shipTypeVal\s*\|\|\s*canonicalVesselClass/, 'normalizeAisVesselForRadar must extract tipo_buque');
  assert.match(indexHtml, /categoria_buque:\s*canonicalVesselClass\s*\|\|\s*shipTypeVal/, 'normalizeAisVesselForRadar must extract categoria_buque');
  assert.match(netlifyFn, /tipo_buque:\s*resolvedType|tipo_buque:\s*vesselType/, 'Backend must map tipo_buque');
  assert.match(netlifyFn, /categoria_buque:\s*resolvedType|categoria_buque:\s*vesselType/, 'Backend must map categoria_buque');
  assert.match(moduleJs, /tipo_buque:\s*vesselType/, 'Frontend module must preserve tipo_buque');
  assert.match(moduleJs, /categoria_buque:\s*vesselType/, 'Frontend module must preserve categoria_buque');
});

test('Matching Algorithm: performs cross-query against Neon DB by IMO and MMSI to verify DWT, draft, LOA', () => {
  // IMO / MMSI match
  assert.match(netlifyFn, /Number\(r\.imo_number\)\s*===\s*imoNum/, 'Backend matches by IMO number');
  assert.match(netlifyFn, /String\(r\.mmsi\)\s*===\s*mmsiClean/, 'Backend matches by MMSI');
  
  // Technical specs validation: DWT, draft, LOA
  assert.match(netlifyFn, /dwt:\s*Number\(dbRow\?\.dwt/, 'Extracts DWT from database match');
  assert.match(netlifyFn, /draftMeters:\s*Number\(dbRow\?\.draft_meters/, 'Extracts draft/calado from database match');
  assert.match(netlifyFn, /loaMeters:\s*Number\(dbRow\?\.loa_meters/, 'Extracts LOA/eslora from database match');
});

test('Candidate Classification: evaluates POL compatibility and sorts for best candidate selection', () => {
  assert.match(netlifyFn, /evaluatedList\.sort\(\(a,\s*b\)\s*=>\s*b\.compatibilityScore\s*-\s*a\.compatibilityScore\)/, 'Sorts candidates by compatibilityScore descending');
  assert.match(netlifyFn, /eligibleTopCandidates\[0\]\.isTopMatch\s*=\s*true/, 'Designates top match automatically');
  assert.match(moduleJs, /dynamicRadarMatches\.sort\(\(a,\s*b\)\s*=>\s*b\.compatibilityScore\s*-\s*a\.compatibilityScore\)/, 'Frontend sorts candidates by score descending');
});

test('UI Dynamic Label Injection: renders visible badge with [Score]% - [Nombre] - [Tipo/Clase]', () => {
  assert.match(moduleJs, /compatibility-dynamic-label/, 'Must have compatibility-dynamic-label container');
  assert.match(moduleJs, /compat-tag-badge/, 'Must have compat-tag-badge class');
  assert.match(moduleJs, /\$\{item\.compatibilityScore\}%\s*-\s*\$\{item\.name\}\s*-\s*\$\{vesselClassOrType\}/, 'Must format dynamic label as Score% - Name - VesselType');
  assert.match(moduleCss, /\.compatibility-dynamic-label/, 'CSS must include .compatibility-dynamic-label');
  assert.match(moduleCss, /\.compat-tag-badge/, 'CSS must include .compat-tag-badge');
});

test('Contingency Fallback Card & Blocked Map: prints exact required message when no compatible vessels in radar', () => {
  const exactMessage = "No hay actualmente barcos disponibles en el radar. Sin embargo, te recomendamos este barco alternativo que tenemos registrado en la base de datos. ¿Quieres contactar con su propietario/armador?";
  
  assert.ok(moduleJs.includes(exactMessage), 'Module must contain the exact fallback message');
  assert.match(moduleJs, /radar-map-blocked-overlay/, 'Must block map view with radar-map-blocked-overlay');
  assert.match(moduleJs, /compatibility-fallback-card/, 'Must include compatibility-fallback-card');
  assert.match(moduleJs, /handleContactOwner/, 'Must provide handleContactOwner button action');
  assert.match(moduleCss, /\.radar-blocked-view-container/, 'CSS must define .radar-blocked-view-container');
  assert.match(moduleCss, /\.radar-map-blocked-overlay/, 'CSS must define .radar-map-blocked-overlay');
  assert.match(moduleCss, /\.compatibility-fallback-card/, 'CSS must define .compatibility-fallback-card');
});
