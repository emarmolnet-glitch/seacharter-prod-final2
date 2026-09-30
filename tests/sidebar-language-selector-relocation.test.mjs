import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getUILanguage, selectBestVoice } from '../src/utils/speechVoiceHelper.mjs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distIndexHtml = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

test('1. Language selector is removed from top bar / header', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const headerMatch = content.match(/<header\b[\s\S]*?<\/header>/);
    assert.ok(headerMatch, `Header must exist in ${name}`);
    const headerHtml = headerMatch[0];

    assert.doesNotMatch(
      headerHtml,
      /id="language-selector"/,
      `Language selector must be removed from header in ${name}`
    );
    assert.doesNotMatch(
      headerHtml,
      /<!-- Selector de Idioma -->/,
      `Language selector comment/container must be removed from header in ${name}`
    );
  }
});

test('2. Language selector is inserted in the left sidebar exactly above Data Bridge', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const sidebarFooterMatch = content.match(/<div class="sidebar-footer[\s\S]*?<\/aside>/);
    assert.ok(sidebarFooterMatch, `Sidebar footer must exist in ${name}`);
    const footerHtml = sidebarFooterMatch[0];

    // Check presence of language selector button and dropdown inside sidebar footer
    assert.match(
      footerHtml,
      /id="sidebar-language-container"/,
      `Sidebar language container must be in sidebar footer in ${name}`
    );
    assert.match(
      footerHtml,
      /id="btn-sidebar-language"/,
      `Sidebar language toggle button must exist in ${name}`
    );
    assert.match(
      footerHtml,
      /id="sidebar-language-dropdown"/,
      `Sidebar language dropdown menu must exist in ${name}`
    );

    // Verify ordering: Language selector appears BEFORE Data Bridge
    const langIndex = footerHtml.indexOf('id="sidebar-language-container"');
    const dataBridgeIndex = footerHtml.indexOf('id="btn-toggle-databridge"');
    assert.ok(langIndex !== -1, `Language selector found in ${name}`);
    assert.ok(dataBridgeIndex !== -1, `Data Bridge link found in ${name}`);
    assert.ok(
      langIndex < dataBridgeIndex,
      `Language selector must be positioned BEFORE Data Bridge in ${name}`
    );
  }
});

test('3. Compact button design matches sidebar items with globe icon and 10 language options matching Land Charter', () => {
  const expectedLanguages = [
    { code: 'auto', label: 'AUTO' },
    { code: 'es', label: 'ES - Español' },
    { code: 'en', label: 'EN - English' },
    { code: 'fr', label: 'FR - Français' },
    { code: 'ar', label: 'AR - العربية' },
    { code: 'pt', label: 'PT - Portuguese' },
    { code: 'de', label: 'DE - German' },
    { code: 'it', label: 'IT - Italian' },
    { code: 'tr', label: 'TR - Turkish' },
    { code: 'zh', label: 'ZH - 中文' },
  ];

  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(
      content,
      /id="btn-sidebar-language"[\s\S]*?class="[^"]*sidebar-nav-item[^"]*"/,
      `Language button uses sidebar-nav-item styling in ${name}`
    );
    assert.match(
      content,
      /id="sidebar-active-lang-badge"/,
      `Active language badge exists in ${name}`
    );
    assert.match(
      content,
      /onclick="toggleSidebarLanguageDropdown\(event\)"/,
      `Click triggers dropdown toggle in ${name}`
    );

    // Verify each expected language option in sidebar dropdown
    for (const lang of expectedLanguages) {
      assert.match(
        content,
        new RegExp(`onclick="selectSidebarLanguage\\('${lang.code}'\\)"`),
        `Option ${lang.code} (${lang.label}) exists in dropdown in ${name}`
      );
    }
  }
});

test('4. State and global bindings are preserved when changing language', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(
      content,
      /function updateSidebarLanguageUI\(lang\)/,
      `updateSidebarLanguageUI function exists in ${name}`
    );
    assert.match(
      content,
      /function selectSidebarLanguage\(lang\)/,
      `selectSidebarLanguage function exists in ${name}`
    );
    assert.match(
      content,
      /function changeLanguage\(lang\)/,
      `changeLanguage function exists in ${name}`
    );
    assert.match(
      content,
      /localStorage\.setItem\('seacharter_lang',\s*lang\)/,
      `changeLanguage persists to localStorage in ${name}`
    );
    assert.match(
      content,
      /translatePage\(/,
      `changeLanguage triggers translatePage in ${name}`
    );
  }
});

test('5. getUILanguage properly resolves new language codes (ar, pt, de, it, tr, zh) to standard BCP-47 tags', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  try {
    globalThis.window = {};
    const testCases = [
      { input: 'ar', expected: 'ar-SA' },
      { input: 'pt', expected: 'pt-PT' },
      { input: 'de', expected: 'de-DE' },
      { input: 'it', expected: 'it-IT' },
      { input: 'tr', expected: 'tr-TR' },
      { input: 'zh', expected: 'zh-CN' },
      { input: 'es', expected: 'es-ES' },
      { input: 'en', expected: 'en-US' },
      { input: 'fr', expected: 'fr-FR' },
    ];

    for (const { input, expected } of testCases) {
      globalThis.localStorage = {
        getItem: (key) => (key === 'seacharter_lang' ? input : null),
      };
      assert.equal(getUILanguage(), expected, `Language code ${input} must resolve to ${expected}`);
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  }
});

test('6. selectBestVoice matches compatible prefix for languages (e.g. pt-BR for Portuguese) and safely handles errors without throwing', () => {
  const mockVoices = [
    { name: 'Luciana Portuguese Brazil', lang: 'pt-BR' },
    { name: 'Maged Arabic Online', lang: 'ar-SA' },
    { name: 'Kavita Turkish Natural', lang: 'tr-TR' },
    { name: 'Xiaoxiao Chinese Natural', lang: 'zh-CN' },
    { name: 'Conchita Spanish Natural', lang: 'es-ES' },
  ];

  const mockSynthesis = {
    getVoices: () => mockVoices,
  };

  // pt-PT target should match pt-BR prefix
  const ptVoice = selectBestVoice(mockSynthesis, 'pt-PT');
  assert.ok(ptVoice, 'Should find voice matching pt prefix');
  assert.equal(ptVoice.name, 'Luciana Portuguese Brazil');

  // ar-SA target should match Arabic voice
  const arVoice = selectBestVoice(mockSynthesis, 'ar-SA');
  assert.ok(arVoice, 'Should find Arabic voice');
  assert.equal(arVoice.name, 'Maged Arabic Online');

  // zh-CN target should match Chinese voice
  const zhVoice = selectBestVoice(mockSynthesis, 'zh-CN');
  assert.ok(zhVoice, 'Should find Chinese voice');
  assert.equal(zhVoice.name, 'Xiaoxiao Chinese Natural');

  // Missing voice returns null gracefully
  const missingVoice = selectBestVoice(mockSynthesis, 'ja-JP');
  assert.equal(missingVoice, null, 'Should return null when no voice available');

  // Faulty instance throwing error does not break app
  const throwingSynthesis = {
    getVoices: () => {
      throw new Error('Speech synthesis error');
    },
  };
  assert.doesNotThrow(() => {
    const result = selectBestVoice(throwingSynthesis, 'es-ES');
    assert.equal(result, null);
  }, 'Should not throw on synthesis error');
});
