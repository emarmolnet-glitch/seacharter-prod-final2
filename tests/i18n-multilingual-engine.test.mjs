import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distIndexSource = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

test('index.html and dist/index.html contain language selector with es, en, fr options', () => {
  for (const html of [indexSource, distIndexSource]) {
    assert.match(html, /id="language-selector"/);
    assert.match(html, /value="es"[^>]*>Español/);
    assert.match(html, /value="en"[^>]*>English/);
    assert.match(html, /value="fr"[^>]*>Français/);
  }
});

test('UI_TRANSLATIONS dictionary contains accurate maritime technical terminology in ES, EN, and FR', () => {
  for (const html of [indexSource, distIndexSource]) {
    // Spanish keys to EN/FR translations
    assert.match(html, /"Puerto de Carga \(POL\)":\s*\{\s*en:\s*"Port of Loading \(POL\)"/);
    assert.match(html, /"Puerto de Descarga \(POD\)":\s*\{\s*en:\s*"Port of Discharge \(POD\)"/);
    assert.match(html, /"Días de plancha"|Laydays/);
    assert.match(html, /"Demurrage"|Surestaries/);
    assert.match(html, /"Break-Even"|Seuil de Rentabilité/);
    assert.match(html, /"Bulk Carrier"|Navire Vraquier/);

    // French maritime terms
    assert.match(html, /Port de chargement/);
    assert.match(html, /Port de déchargement/);
    assert.match(html, /Jours de planche/);
    assert.match(html, /Taux de Fret/);
    assert.match(html, /Surestaries/);
    assert.match(html, /Seuil de Rentabilité/);
    assert.match(html, /Navire Vraquier/);
  }
});

test('i18n engine manages seacharter_lang in localStorage and updates html lang attribute', () => {
  for (const html of [indexSource, distIndexSource]) {
    assert.match(html, /localStorage\.setItem\('seacharter_lang',\s*lang\)/);
    assert.match(html, /localStorage\.getItem\('seacharter_lang'\)/);
    assert.match(html, /document\.documentElement\.lang\s*=\s*/);
    assert.match(html, /function changeLanguage\(lang\)/);
    assert.match(html, /function translatePage\(lang\)/);
    assert.match(html, /window\.changeLanguage\s*=\s*changeLanguage/);
  }
});

test('FAQ modal openFaqModal triggers translatePage for active language before showing modal', () => {
  for (const html of [indexSource, distIndexSource]) {
    assert.match(html, /function openFaqModal\(\)/);
    assert.match(html, /translatePage\(currentLang\)/);
    assert.match(html, /function exportFaqToPdf\(\)/);
  }
});
