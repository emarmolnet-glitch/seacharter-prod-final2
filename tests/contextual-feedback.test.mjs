import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const feedback = require('../contextual-feedback.js');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const viteConfigSource = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
const feedbackCssSource = await readFile(new URL('../assets/css/contextual-feedback.css', import.meta.url), 'utf8');
const feedbackSource = await readFile(new URL('../contextual-feedback.js', import.meta.url), 'utf8');

test('ships and mounts the contextual banner layer in production', () => {
  assert.match(indexSource, /<script src="\.\/contextual-feedback\.js\?v=20260717-global-banner"><\/script>/);
  assert.match(viteConfigSource, /"contextual-feedback\.js"/);
});

test('mounts one global help banner in the application layout', () => {
  assert.equal((indexSource.match(/id="module-help-banner"/g) || []).length, 1);
  assert.doesNotMatch(indexSource, /data-contextual-guide=/);
  const headerEnd = indexSource.indexOf('</header>');
  const bannerIndex = indexSource.indexOf('id="module-help-banner"');
  const mainIndex = indexSource.indexOf('<main class="app-main');
  assert.ok(headerEnd < bannerIndex && bannerIndex < mainIndex);
});

test('replaces the active toast and removes it after five seconds', () => {
  assert.match(feedbackSource, /region\.replaceChildren\(toast\)/);
  assert.match(feedbackSource, /globalObject\.setTimeout\(\(\) => \{[\s\S]*?toast\.remove\(\)[\s\S]*?\}, TOAST_DURATION_MS\)/);
  assert.match(feedbackCssSource, /\.contextual-toast-region\s*\{[\s\S]*?bottom: 1rem;/);
});

test('help banners have no automatic removal timer', () => {
  const bannerLifecycleStart = feedbackSource.indexOf('function getCurrentModule');
  const bannerLifecycleEnd = feedbackSource.indexOf('function hasMissingFinancialData', bannerLifecycleStart);
  const bannerLifecycleSource = feedbackSource.slice(bannerLifecycleStart, bannerLifecycleEnd);
  assert.doesNotMatch(bannerLifecycleSource, /setTimeout|clearTimeout/);
  assert.match(bannerLifecycleSource, /MutationObserver/);
  assert.match(bannerLifecycleSource, /renderModuleHelpBanner/);
  assert.match(feedbackSource, /if \(globalObject\.document\) initializeBrowserLayer\(globalObject\.document\)/);
});

test('keeps help banners visible above module content', () => {
  const bannerRule = feedbackCssSource.slice(
    feedbackCssSource.indexOf('.contextual-guide-banner {'),
    feedbackCssSource.indexOf('}', feedbackCssSource.indexOf('.contextual-guide-banner {')) + 1,
  );
  assert.match(bannerRule, /display: flex !important;/);
  assert.match(bannerRule, /z-index: 45;/);
  assert.doesNotMatch(bannerRule, /display:\s*none/);
  assert.match(feedbackCssSource, /#module-help-banner\[hidden\]\s*\{\s*display: none !important;/);
});

test('defines a guide for every requested core module', () => {
  assert.deepEqual(Object.keys(feedback.MODULE_GUIDES), [
    'map',
    'estimator',
    'gencon',
    'auditor',
    'ais',
    'matching',
  ]);
});

test('keeps dismissed guides closed through the provided storage adapter', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(feedback.isGuideClosed('map', storage), false);
  feedback.closeGuide('map', storage);
  assert.equal(feedback.isGuideClosed('map', storage), true);
  assert.equal(values.get('banner-hidden-map'), 'true');
});

test('global banner follows the active module and its local preference', () => {
  const values = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const textNode = { textContent: '' };
  const banner = {
    dataset: {},
    hidden: false,
    setAttribute(name, value) { this[name] = value; },
    querySelector: () => textNode,
  };
  const documentMock = { getElementById: () => banner };

  try {
    feedback.renderModuleHelpBanner('matching', documentMock);
    assert.equal(banner.hidden, false);
    assert.equal(banner.dataset.currentModule, 'matching');
    assert.equal(textNode.textContent, feedback.MODULE_GUIDES.matching);

    values.set('banner-hidden-matching', 'true');
    feedback.renderModuleHelpBanner('matching', documentMock);
    assert.equal(banner.hidden, true);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('blocks Data Bridge export until matching audit results exist', () => {
  assert.deepEqual(feedback.canExportMatching({ lastMatchingEngineResults: [] }), {
    allowed: false,
    message: 'Acción incorrecta: Ejecuta la auditoría antes de exportar.',
  });
  assert.deepEqual(feedback.canExportMatching({ lastMatchingEngineResults: [{ vessel: {} }] }), {
    allowed: true,
    message: 'Enviado a Data Bridge.',
  });
});

test('detects incomplete financial context without mutating form state', () => {
  const values = new Map([
    ['cargo-qty', '25000'],
    ['freight-rate', '0'],
    ['lumpsum-override', '0'],
  ]);
  const documentMock = {
    getElementById: id => ({ value: values.get(id) || '' }),
  };

  assert.equal(feedback.hasMissingFinancialData(documentMock), true);
  values.set('freight-rate', '18.75');
  assert.equal(feedback.hasMissingFinancialData(documentMock), false);
});

test('contextual toasts use the required five second lifetime', () => {
  assert.equal(feedback.TOAST_DURATION_MS, 5000);
});
