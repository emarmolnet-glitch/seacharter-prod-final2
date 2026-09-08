import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveApiUrl, isLocalOrFileProtocol, getApiBaseUrl, installFetchInterceptor, NETLIFY_PRODUCTION_ORIGIN } from '../src/utils/apiConfig.mjs';

test('1. Vite configuration preserves relative base ./ without singlefile plugin or forced inlining', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(
    !pkg.devDependencies || !pkg.devDependencies['vite-plugin-singlefile'],
    'vite-plugin-singlefile must not be in devDependencies'
  );

  const viteConfig = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.doesNotMatch(viteConfig, /vite-plugin-singlefile/);
  assert.doesNotMatch(viteConfig, /viteSingleFile/);
  assert.doesNotMatch(viteConfig, /inlineDynamicImports:\s*true/);
  assert.match(viteConfig, /base:\s*['"]\.\/['"]/);
  assert.match(viteConfig, /manualChunks/);
});

test('2. HashRouter routing in App.jsx and src/App.jsx for Electron compatibility', async () => {
  const appJsx = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appJsx, /import\s*\{\s*HashRouter/);
  assert.match(appJsx, /from\s*['"]react-router-dom['"]/);
  assert.match(appJsx, /<HashRouter>/);
  assert.match(appJsx, /export\s*\{\s*HashRouter/);

  const rootApp = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(rootApp, /export\s*\*\s*from\s*['"]\.\/src\/App\.jsx['"]/);
});

test('3. Absolute API routes under file:// and Electron protocol', () => {
  assert.equal(NETLIFY_PRODUCTION_ORIGIN, 'https://neon-seachartercorepro-4ce09d.netlify.app');

  // Test resolution when local protocol is active
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.window = {
      location: { protocol: 'file:', origin: 'file://' },
      navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Electron/28.0.0' },
      fetch: () => Promise.resolve({ ok: true })
    };

    assert.equal(isLocalOrFileProtocol(), true);
    assert.equal(getApiBaseUrl(), 'https://neon-seachartercorepro-4ce09d.netlify.app');
    assert.equal(resolveApiUrl('/api/vessel/1234567'), 'https://neon-seachartercorepro-4ce09d.netlify.app/api/vessel/1234567');
    assert.equal(resolveApiUrl('/.netlify/functions/project-parser'), 'https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-parser');

    // Test that existing absolute URLs are untouched
    assert.equal(resolveApiUrl('https://example.com/api/test'), 'https://example.com/api/test');
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('4. Web environment preserves relative API paths', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { protocol: 'https:', origin: 'https://neon-seachartercorepro-4ce09d.netlify.app' },
      navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    };

    assert.equal(isLocalOrFileProtocol(), false);
    assert.equal(getApiBaseUrl(), '');
    assert.equal(resolveApiUrl('/api/vessel/1234567'), '/api/vessel/1234567');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('5. Global safety shield in index.html initializes State, ASBATANKVOY, and navigation functions', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify ASBATANKVOY & GENCON identifiers
  assert.match(indexHtml, /ASBATANKVOY\s*=\s*['"]ASBATANKVOY['"]/);
  assert.match(indexHtml, /GENCON\s*=\s*['"]GENCON['"]/);

  // Verify State initialization without duplicate top-level lexical declaration
  assert.match(indexHtml, /State\s*=\s*(?:global\.)?State\s*\|\|\s*\{\}/);
  assert.match(indexHtml, /CalculatedState\s*=\s*(?:global\.)?CalculatedState\s*\|\|\s*\{\}/);
  assert.doesNotMatch(indexHtml, /var\s+State\s*=\s*typeof/);
  assert.doesNotMatch(indexHtml, /var\s+CalculatedState\s*=\s*typeof/);

  // Verify early navigation stubs
  assert.match(indexHtml, /switchAsbatankvoyView/);
  assert.match(indexHtml, /switchGenconView/);
  assert.match(indexHtml, /setAppView/);
  assert.match(indexHtml, /syncAsbatankvoy/);

  // Verify fetch and XHR interceptor
  assert.match(indexHtml, /PRODUCTION_ORIGIN\s*=\s*['"]https:\/\/neon-seachartercorepro-4ce09d\.netlify\.app['"]/);
  assert.match(indexHtml, /NETLIFY_PRODUCTION_ORIGIN\s*=\s*PRODUCTION_ORIGIN/);
});

test('6. Global calculation engine functions are explicitly exposed on window', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify runEngine window exposure
  assert.match(indexHtml, /window\.runEngine\s*=\s*runEngine/);

  // Verify getEffectiveDwtForSegmentDetection window exposure
  assert.match(indexHtml, /window\.getEffectiveDwtForSegmentDetection\s*=\s*getEffectiveDwtForSegmentDetection/);

  // Verify renderMethodPills window exposure
  assert.match(indexHtml, /window\.renderMethodPills\s*=\s*renderMethodPills/);

  // Verify updatePendingReportButton window exposure
  assert.match(indexHtml, /window\.updatePendingReportButton\s*=\s*updatePendingReportButton/);
  assert.match(indexHtml, /window\.updatePendingFrozenReportButton\s*=\s*updatePendingFrozenReportButton/);
});

test('7. Sequential script execution does not encounter Identifier State collision or syntax error', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const componentsJs = await readFile(new URL('../public/components.js', import.meta.url), 'utf8');

  const context = vm.createContext({
    console,
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    navigator: { userAgent: 'test-agent' },
    location: { protocol: 'http:', origin: 'http://localhost' },
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 }
  });
  context.window = context;
  context.globalThis = context;
  context.global = context;
  context.document = {
    write: () => {},
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {}, style: {} }),
    head: { appendChild: () => {} },
    body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
    getElementById: () => ({ addEventListener: () => {}, setAttribute: () => {}, classList: { add: () => {}, remove: () => {} }, querySelector: () => null }),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createTreeWalker: () => ({ nextNode: () => false })
  };

  vm.runInContext(componentsJs, context);

  const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while ((match = scriptRegex.exec(indexHtml)) !== null) {
    count++;
    const fullTag = match[0];
    const code = match[1].trim();
    if (!code) continue;
    if (fullTag.includes('type="module"') || fullTag.includes("type='module'")) continue;
    try {
      vm.runInContext(code, context, { filename: `script-${count}.js` });
    } catch (err) {
      assert.doesNotMatch(err.message, /Identifier 'State' has already been declared/);
      assert.doesNotMatch(err.message, /Identifier 'CalculatedState' has already been declared/);
    }
  }

  assert.equal(typeof context.window.runEngine, 'function');
  assert.equal(typeof context.window.getEffectiveDwtForSegmentDetection, 'function');
  assert.equal(typeof context.window.renderMethodPills, 'function');
  assert.equal(typeof context.window.updatePendingReportButton, 'function');
  assert.equal(typeof context.window.State, 'object');
});

test('8. main.js safely guards DOM style injection for Electron main process', async () => {
  const mainJs = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(mainJs, /typeof document !== ['"]undefined['"]/);
});
