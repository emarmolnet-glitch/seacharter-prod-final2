import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
const appJsx = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf-8');

test('1. Header parent container aligns right on mobile and spaces between on desktop', () => {
  for (const [name, content] of [['index.html', indexHtml], ['src/App.jsx', appJsx]]) {
    const headerMatch = content.match(/<header\b[^>]*class(?:Name)?="([^"]*)"/);
    assert.ok(headerMatch, `Header tag found in ${name}`);
    const classList = headerMatch[1];
    assert.match(classList, /\bjustify-end\b/, `Header has justify-end in ${name}`);
    assert.match(classList, /\bmd:justify-between\b/, `Header has md:justify-between in ${name}`);
  }
});

test('2. Left container (logo/app title) is hidden on mobile and visible on desktop', () => {
  for (const [name, content] of [['index.html', indexHtml], ['src/App.jsx', appJsx]]) {
    const leftMatch = content.match(/<div\b[^>]*class(?:Name)?="([^"]*header-left[^"]*)"/);
    assert.ok(leftMatch, `header-left container found in ${name}`);
    const classList = leftMatch[1];
    assert.match(classList, /\bhidden\b/, `header-left has hidden in ${name}`);
    assert.match(classList, /\bmd:flex\b/, `header-left has md:flex in ${name}`);
  }
});

test('3. Center container and its sub-containers are hidden on mobile and visible on desktop', () => {
  for (const [name, content] of [['index.html', indexHtml], ['src/App.jsx', appJsx]]) {
    const centerMatch = content.match(/<div\b[^>]*class(?:Name)?="([^"]*header-center[^"]*)"/);
    assert.ok(centerMatch, `header-center container found in ${name}`);
    const centerClasses = centerMatch[1];
    assert.match(centerClasses, /\bhidden\b/, `header-center has hidden in ${name}`);
    assert.match(centerClasses, /\bmd:flex\b/, `header-center has md:flex in ${name}`);

    // connection status badge container
    const statusMatch = content.match(/<div\b[^>]*id="connection-status-root"[^>]*class(?:Name)?="([^"]*)"/);
    assert.ok(statusMatch, `connection-status-root found in ${name}`);
    assert.match(statusMatch[1], /\bhidden\b/, `connection-status-root has hidden in ${name}`);

    // search container
    const searchMatch = content.match(/<div\b[^>]*id="header-vessel-search-container"[^>]*class(?:Name)?="([^"]*)"/);
    assert.ok(searchMatch, `header-vessel-search-container found in ${name}`);
    assert.match(searchMatch[1], /\bhidden\b/, `search container has hidden in ${name}`);

    // dossier ref container
    const refMatch = content.match(/<div\b[^>]*id="header-voyage-ref-container"[^>]*class(?:Name)?="([^"]*)"/);
    assert.ok(refMatch, `header-voyage-ref-container found in ${name}`);
    assert.match(refMatch[1], /\bhidden\b/, `dossier container has hidden in ${name}`);
  }
});

test('4. Right action block (MADRE, FAQ, OWN/CHR) remains permanently visible with flex', () => {
  for (const [name, content] of [['index.html', indexHtml], ['src/App.jsx', appJsx]]) {
    const rightMatch = content.match(/<div\b[^>]*class(?:Name)?="([^"]*header-actions-right[^"]*)"/);
    assert.ok(rightMatch, `header-actions-right container found in ${name}`);
    const classList = rightMatch[1];
    assert.doesNotMatch(classList, /\bhidden\b/, `header-actions-right must NOT have hidden in ${name}`);
    assert.match(classList, /\bflex\b/, `header-actions-right must have flex in ${name}`);
  }

  // index.html explicitly houses MADRE, FAQ, and OWN/CHR controls in the right container
  const headerContentMatch = indexHtml.match(/<header\b[^>]*>([\s\S]*?)<\/header>/);
  assert.ok(headerContentMatch, 'header element found in index.html');
  const headerHtml = headerContentMatch[1];

  assert.match(headerHtml, /id="madre-topbar-button"/, 'MADRE avatar button present in header');
  assert.match(headerHtml, /id="btn-open-faq-modal"/, 'FAQ button present in header');
  assert.match(headerHtml, /id="global-view-mode-switch"/, 'OWN/CHR switch present in header');
});

test('5. Responsive CSS styles ensure strict display rules for mobile and desktop', () => {
  // Mobile rules
  assert.match(indexHtml, /@media\s*\(max-width:\s*767px\)[\s\S]*?header\.app-header\s*\{\s*justify-content:\s*flex-end\s*!important;\s*\}/);
  assert.match(indexHtml, /@media\s*\(max-width:\s*767px\)[\s\S]*?header\.app-header\s+\.hidden[\s\S]*?display:\s*none\s*!important;/);
  assert.match(indexHtml, /@media\s*\(max-width:\s*767px\)[\s\S]*?header\.app-header\s*>\s*\.header-actions-right[\s\S]*?display:\s*flex\s*!important;/);

  // Desktop rules
  assert.match(indexHtml, /@media\s*\(min-width:\s*768px\)[\s\S]*?header\.app-header\s*>\s*\.header-left[\s\S]*?display:\s*flex\s*!important;/);
  assert.match(indexHtml, /@media\s*\(min-width:\s*768px\)[\s\S]*?header\.app-header\s*>\s*\.header-center[\s\S]*?display:\s*flex\s*!important;/);
});
