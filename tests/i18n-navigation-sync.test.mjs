import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appJsx = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const geoJsx = readFileSync(new URL('../src/components/GeographicInput.jsx', import.meta.url), 'utf8');
const dossiersJs = readFileSync(new URL('../dossiers.js', import.meta.url), 'utf8');
const i18nContextJsx = readFileSync(new URL('../src/context/I18nContext.jsx', import.meta.url), 'utf8');

test('1. index.html: switchTab translates target view before displaying and translatePage accepts scope container', () => {
  assert.match(indexHtml, /function switchTab\(tabId\)/);
  assert.match(indexHtml, /const currentLang = \(typeof localStorage !== 'undefined' && localStorage\.getItem\('seacharter_lang'\)\) \|\| 'es';/);
  assert.match(indexHtml, /translatePage\(currentLang,\s*targetView\)/);
  assert.match(indexHtml, /function translatePage\(lang\)/);
  assert.match(indexHtml, /arguments\.length > 1/);
});

test('2. src/App.jsx and src/context/I18nContext.jsx: I18nContext initialized from localStorage and provided at root', () => {
  assert.match(appJsx, /import \{ I18nContext, I18nProvider, useI18n \} from '\.\/context\/I18nContext\.jsx';/);
  assert.match(appJsx, /localStorage\.getItem\('seacharter_lang'\)/);
  assert.match(appJsx, /<I18nContext\.Provider value=\{\{ lang, setLang \}\}>/);
  assert.match(i18nContextJsx, /export const I18nContext = createContext/);
  assert.match(i18nContextJsx, /export function I18nProvider/);
});

test('3. src/components/GeographicInput.jsx: Consumes I18nContext / localStorage and renders English strings when lang is en', () => {
  assert.match(geoJsx, /useContext\(I18nContext\)/);
  assert.match(geoJsx, /const isEn = currentLang === 'en';/);
  assert.match(geoJsx, /isEn \? 'Geographic Input' : 'Input geográfico'/);
  assert.match(geoJsx, /isEn \? 'Previous Port \(Ballast\)' : 'Puerto previo \(Lastre\)'/);
  assert.match(geoJsx, /isEn \? 'Port of Loading \(POL\)' : 'Puerto de carga \(POL\)'/);
  assert.match(geoJsx, /isEn \? 'Port of Discharge \(POD\)' : 'Puerto de descarga \(POD\)'/);
});

test('4. dossiers.js: loadList and render check current language and inject English strings when active', () => {
  assert.match(dossiersJs, /const currentLang = \(typeof localStorage !== 'undefined' && localStorage\.getItem\('seacharter_lang'\)\) \|\| 'es';/);
  assert.match(dossiersJs, /const strLoading = isEn \? 'Loading files\.\.\.' : 'Cargando expedientes\.\.\.';/);
  assert.match(dossiersJs, /const strEmpty = isEn \? 'No saved dossiers' : 'No hay dossiers guardados';/);
  assert.match(dossiersJs, /const strDraft = isEn \? 'Draft' : 'Borrador';/);
  assert.match(dossiersJs, /const strOpenDossier = isEn \? 'Open Dossier' : 'Abrir Dossier';/);
});
