import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SPEECH_LANG_MAP,
  mapLanguageToBcp47,
  getSpeechRecognitionLanguage,
  getUILanguage
} from '../src/utils/speechVoiceHelper.mjs';

const seaAssistantSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const agenteWidgetSource = await readFile(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');

test('1. SPEECH_LANG_MAP contains exact BCP-47 mappings for all 9 supported selector languages', () => {
  const expectedMappings = {
    es: 'es-ES',
    en: 'en-US',
    fr: 'fr-FR',
    ar: 'ar-SA',
    pt: 'pt-PT',
    de: 'de-DE',
    it: 'it-IT',
    tr: 'tr-TR',
    zh: 'zh-CN',
  };

  for (const [code, bcp47] of Object.entries(expectedMappings)) {
    assert.equal(
      SPEECH_LANG_MAP[code],
      bcp47,
      `SPEECH_LANG_MAP must map '${code}' to '${bcp47}'`
    );
    assert.equal(
      mapLanguageToBcp47(code),
      bcp47,
      `mapLanguageToBcp47 must map '${code}' to '${bcp47}'`
    );
  }
});

test('2. mapLanguageToBcp47 handles AUTO mode by detecting browser language or falling back to en-US', () => {
  const originalNavigator = globalThis.navigator;

  try {
    // Mode AUTO with browser language set to French ('fr-FR')
    globalThis.navigator = { language: 'fr-FR' };
    assert.equal(mapLanguageToBcp47('auto'), 'fr-FR');

    // Mode AUTO with browser language set to Spanish ('es')
    globalThis.navigator = { language: 'es' };
    assert.equal(mapLanguageToBcp47('auto'), 'es-ES');

    // Mode AUTO with browser language set to Arabic ('ar')
    globalThis.navigator = { language: 'ar' };
    assert.equal(mapLanguageToBcp47('auto'), 'ar-SA');

    // Mode AUTO with no navigator or unknown language falls back safely to 'en-US'
    delete globalThis.navigator;
    assert.equal(mapLanguageToBcp47('auto'), 'en-US');

    globalThis.navigator = { language: '' };
    assert.equal(mapLanguageToBcp47('auto'), 'en-US');
  } finally {
    globalThis.navigator = originalNavigator;
  }
});

test('3. getSpeechRecognitionLanguage reactively resolves live language changes from DOM or localStorage', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;

  try {
    globalThis.window = {};

    // Initial state: Spanish
    globalThis.document = {
      getElementById: (id) => (id === 'language-selector' ? { value: 'es' } : null),
      documentElement: { lang: 'es' }
    };
    globalThis.localStorage = {
      getItem: (key) => (key === 'seacharter_lang' ? 'es' : null)
    };
    assert.equal(getSpeechRecognitionLanguage(), 'es-ES');

    // User switches to French in sidebar selector
    globalThis.document.getElementById = (id) => (id === 'language-selector' ? { value: 'fr' } : null);
    globalThis.localStorage.getItem = (key) => (key === 'seacharter_lang' ? 'fr' : null);
    assert.equal(getSpeechRecognitionLanguage(), 'fr-FR');

    // User switches to English
    globalThis.document.getElementById = (id) => (id === 'language-selector' ? { value: 'en' } : null);
    globalThis.localStorage.getItem = (key) => (key === 'seacharter_lang' ? 'en' : null);
    assert.equal(getSpeechRecognitionLanguage(), 'en-US');

    // User switches to German
    globalThis.document.getElementById = (id) => (id === 'language-selector' ? { value: 'de' } : null);
    globalThis.localStorage.getItem = (key) => (key === 'seacharter_lang' ? 'de' : null);
    assert.equal(getSpeechRecognitionLanguage(), 'de-DE');

    // User switches to Chinese
    globalThis.document.getElementById = (id) => (id === 'language-selector' ? { value: 'zh' } : null);
    globalThis.localStorage.getItem = (key) => (key === 'seacharter_lang' ? 'zh' : null);
    assert.equal(getSpeechRecognitionLanguage(), 'zh-CN');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.localStorage = originalLocalStorage;
  }
});

test('4. AgenteProyectosWidget dynamically assigns recognition.lang before start()', () => {
  assert.match(
    agenteWidgetSource,
    /getSpeechRecognitionLanguage/,
    'Widget must import and reference getSpeechRecognitionLanguage'
  );
  assert.match(
    agenteWidgetSource,
    /recognitionRef\.current\.lang\s*=\s*getSpeechRecognitionLanguage\(\);[\s\S]*?recognitionRef\.current\.start\(\);/,
    'Widget must assign recognitionRef.current.lang immediately before recognitionRef.current.start()'
  );
});

test('5. SeaCharter Assistant (sea-assistant-entry.js) dynamically assigns recognition.lang before start()', () => {
  assert.match(
    seaAssistantSource,
    /getSpeechRecognitionLanguage/,
    'Sea assistant must import and export getSpeechRecognitionLanguage'
  );
  assert.match(
    seaAssistantSource,
    /recognition\.lang\s*=\s*getSpeechRecognitionLanguage\(\);[\s\S]*?recognition\.start\(\);/,
    'Sea assistant must assign recognition.lang immediately before recognition.start()'
  );
});
