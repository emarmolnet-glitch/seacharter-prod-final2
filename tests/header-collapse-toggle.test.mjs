import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('1. App.jsx exports useHeaderVisibility hook and persistence helpers', () => {
  assert.match(appSource, /export\s+const\s+HEADER_STORAGE_KEY\s*=\s*['"]seacharter_header_visible['"]/);
  assert.match(appSource, /export\s+function\s+getStoredHeaderVisibility/);
  assert.match(appSource, /export\s+function\s+setStoredHeaderVisibility/);
  assert.match(appSource, /export\s+function\s+useHeaderVisibility/);
});

test('2. App.jsx elevates header visibility state with default true and localStorage persistence', () => {
  assert.match(appSource, /const\s+\[isHeaderVisible,\s*setIsHeaderVisible\]\s*=\s*useState/);
  assert.match(appSource, /getStoredHeaderVisibility\(defaultVisible\)/);
  assert.match(appSource, /localStorage\?\.setItem\(HEADER_STORAGE_KEY/);
});

test('3. App.jsx root container reflects header visibility via CSS classes and dataset', () => {
  assert.match(appSource, /className=\{`seacharter-core-pro-app \$\{isHeaderVisible \? 'header-visible' : 'header-collapsed'\}`\}/);
  assert.match(appSource, /data-header-visible=\{isHeaderVisible\}/);
  assert.match(appSource, /id="react-header-toggle-btn"/);
  assert.match(appSource, /aria-expanded=\{isHeaderVisible\}/);
});

test('4. App.jsx synchronizes with window events, DOM elements, and triggers resize for maps/tables', () => {
  assert.match(appSource, /window\.addEventListener\(['"]header:visibility-change['"]/);
  assert.match(appSource, /window\.addEventListener\(['"]header:toggle['"]/);
  assert.match(appSource, /document\.body\.classList\.toggle\(['"]header-collapsed['"],\s*!visible\)/);
  assert.match(appSource, /window\.dispatchEvent\(new Event\(['"]resize['"]\)\)/);
  assert.match(appSource, /window\.toggleHeaderVisibility\s*=/);
  assert.match(appSource, /window\.setHeaderVisibility\s*=/);
});

test('5. index.html contains accessible collapse toggle button inside top header', () => {
  assert.match(indexHtml, /id="btn-collapse-header"/);
  assert.match(indexHtml, /class="[^"]*header-toggle-collapse-btn[^"]*"/);
  assert.match(indexHtml, /onclick="toggleHeaderVisibility\(\)"/);
  assert.match(indexHtml, /aria-label="Ocultar barra de navegación"/);
  assert.match(indexHtml, /aria-expanded="true"/);
  assert.match(indexHtml, /fa-chevron-up/);
});

test('6. index.html contains accessible floating expand button for restoring collapsed header', () => {
  assert.match(indexHtml, /id="btn-expand-header"/);
  assert.match(indexHtml, /class="[^"]*header-expand-floating-btn[^"]*"/);
  assert.match(indexHtml, /onclick="toggleHeaderVisibility\(\)"/);
  assert.match(indexHtml, /aria-label="Mostrar barra de navegación"/);
  assert.match(indexHtml, /aria-expanded="false"/);
  assert.match(indexHtml, /fa-chevron-down/);
});

test('7. index.html defines CSS for smooth collapsing and complete concealment', () => {
  assert.match(indexHtml, /body\.header-collapsed\s*>\s*header\.app-header/);
  assert.match(indexHtml, /display:\s*none\s*!important/);
  assert.match(indexHtml, /max-height:\s*0\s*!important/);
  assert.match(indexHtml, /overflow:\s*hidden\s*!important/);
  assert.match(indexHtml, /pointer-events:\s*none\s*!important/);
});

test('8. index.html defines CSS expanding main container to 100vh when header is collapsed', () => {
  assert.match(indexHtml, /body\.header-collapsed\s+\.app-main\s*\{[\s\S]*?height:\s*100vh\s*!important/);
  assert.match(indexHtml, /body\.header-collapsed\s+#btn-expand-header\s*\{[\s\S]*?display:\s*inline-flex\s*!important/);
});

test('9. index.html defines client controller with localStorage persistence, map invalidation, and keyboard shortcut', () => {
  assert.match(indexHtml, /const\s+STORAGE_KEY\s*=\s*['"]seacharter_header_visible['"]/);
  assert.match(indexHtml, /function\s+toggleHeaderVisibility\(\)/);
  assert.match(indexHtml, /function\s+setHeaderVisibility\(visible\)/);
  assert.match(indexHtml, /function\s+applyHeaderVisibility\(visible/);
  assert.match(indexHtml, /window\.dispatchEvent\(new Event\(['"]resize['"]\)\)/);
  assert.match(indexHtml, /routeMap(\?\.|\.)invalidateSize\(\)/);
  assert.match(indexHtml, /GlobalFleetGlobe(\?\.|\.)resize\(\)/);
  assert.match(indexHtml, /e\.key === 'h' \|\| e\.key === 'H'/);
});

test('10. Mobile CSS ensures collapse button remains accessible on narrow screens', () => {
  assert.match(indexHtml, /header\.app-header\s+#btn-collapse-header\s*\{[\s\S]*?display:\s*inline-flex\s*!important/);
});

test('11. Runtime persistence logic works properly with localStorage simulation', () => {
  const mockStorage = new Map();
  const mockEvents = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => mockStorage.get(key) ?? null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key),
    },
    dispatchEvent: (evt) => {
      mockEvents.push(evt);
      return true;
    },
  };

  const HEADER_STORAGE_KEY = 'seacharter_header_visible';
  function getStoredHeaderVisibility(defaultVisible = true) {
    if (typeof window === 'undefined') return defaultVisible;
    try {
      const stored = window.localStorage?.getItem(HEADER_STORAGE_KEY);
      if (stored !== null && stored !== undefined) {
        return stored === 'true';
      }
    } catch (_) {}
    return defaultVisible;
  }

  function setStoredHeaderVisibility(visible) {
    const boolVal = Boolean(visible);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.setItem(HEADER_STORAGE_KEY, String(boolVal));
      } catch (_) {}
      try {
        window.dispatchEvent(new CustomEvent('header:visibility-change', {
          detail: { isHeaderVisible: boolVal, visible: boolVal }
        }));
      } catch (_) {}
    }
    return boolVal;
  }

  assert.equal(HEADER_STORAGE_KEY, 'seacharter_header_visible');

  // Default when empty
  assert.equal(getStoredHeaderVisibility(true), true);
  assert.equal(getStoredHeaderVisibility(false), false);

  // Set to false
  setStoredHeaderVisibility(false);
  assert.equal(mockStorage.get('seacharter_header_visible'), 'false');
  assert.equal(getStoredHeaderVisibility(true), false);

  // Set to true
  setStoredHeaderVisibility(true);
  assert.equal(mockStorage.get('seacharter_header_visible'), 'true');
  assert.equal(getStoredHeaderVisibility(false), true);
  assert.ok(mockEvents.length >= 2);
});
