import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distIndexHtml = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const i18nContextJsx = readFileSync(new URL('../src/context/I18nContext.jsx', import.meta.url), 'utf8');
const appJsx = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. Base HTML remains in Spanish (<html lang="es">) to protect core calculators', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(content, /<html\s+lang="es">/, `Base html lang must be 'es' in ${name}`);
  }
});

test('2. Mutual exclusion firewall for native languages (es, en, fr) clears cookies and sets notranslate', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(content, /const NATIVE_LANGS = \['es', 'en', 'fr'\];/);
    assert.match(content, /function clearGoogTransCookie\(\)/);
    assert.match(content, /function setNotranslateProtection\(enable\)/);
    assert.match(content, /clearGoogTransCookie\(\);/);
    assert.match(content, /setNotranslateProtection\(true\);/);
    assert.match(content, /activateGoogleTranslateForSecondary\(effectiveLang\);/);
  }
});

test('3. window.changeLanguage is unified and destructive overwrite at end of file is eliminated', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    // Only one changeLanguage function definition
    const matches = content.match(/function changeLanguage\(lang\)/g);
    assert.equal(matches?.length, 1, `Must have exactly one function changeLanguage(lang) in ${name}`);
    
    // Destructive overwrite must not exist
    assert.doesNotMatch(
      content,
      /window\.changeLanguage\s*=\s*function\(val\)/,
      `Destructive window.changeLanguage = function(val) must be removed from ${name}`
    );
    assert.match(
      content,
      /window\.changeLanguage\s*=\s*changeLanguage;/,
      `window.changeLanguage = changeLanguage must be preserved in ${name}`
    );
  }
});

test('4. Smart initial detection checks navigator.language for English without flickering', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(
      content,
      /navLang\.toLowerCase\(\)\.startsWith\('en'\)\s*\?\s*'en'\s*:\s*'es'/,
      `index.html must check navigator.language startsWith('en') in ${name}`
    );
  }

  assert.match(
    i18nContextJsx,
    /navLang\.toLowerCase\(\)\.startsWith\('en'\)\s*\?\s*'en'\s*:\s*'es'/,
    "src/context/I18nContext.jsx must check navigator.language startsWith('en')"
  );

  assert.match(
    appJsx,
    /navLang\.toLowerCase\(\)\.startsWith\('en'\)\s*\?\s*'en'\s*:\s*'es'/,
    "src/App.jsx must check navigator.language startsWith('en')"
  );
});
