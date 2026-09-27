import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
const distIndexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf-8');

test('1. Sidebar exists with compact 56px and expanded 220px states and toggle button', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    // Sidebar element
    assert.match(content, /id="app-navigation-sidebar"/, `Sidebar container in ${name}`);
    assert.match(content, /is-compact/, `Default compact class in ${name}`);
    assert.match(content, /style="width:\s*56px;"/, `Initial 56px width in ${name}`);

    // Toggle button
    assert.match(content, /id="btn-toggle-sidebar"/, `Toggle button in ${name}`);
    assert.match(content, /onclick="toggleSidebarExpandCollapse\(\)"/, `Toggle function in ${name}`);
    assert.match(content, /function toggleSidebarExpandCollapse/, `Toggle function definition in ${name}`);
    assert.match(content, /220px/, `Expanded 220px width in ${name}`);
  }
});

test('2. Sidebar contains all 10 module buttons + Reporte de Mercado + bottom shortcuts', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    // Primary module container
    assert.match(content, /id="primary-module-tabs"/, `Module tabs container in ${name}`);

    // Reporte de Mercado
    assert.match(content, /id="btn-market-report-nav"/, `Market report button in ${name}`);
    assert.match(content, /<span>Reporte de Mercado<\/span>/, `Market report label in ${name}`);

    // Bottom shortcuts
    assert.match(content, /id="btn-toggle-databridge"/, `Data Bridge link in ${name}`);
    assert.match(content, /id="btn-open-land-charter"/, `Land Charter link in ${name}`);
  }
});

test('3. Corporate iconography uses fine stroke SVG monocromáticos (stroke-width 1.75)', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(content, /MODULE_ICONS\s*=\s*\{/, `MODULE_ICONS dictionary in ${name}`);
    assert.match(content, /stroke-width="1\.75"/, `SVG stroke width 1.75 in ${name}`);
    assert.match(content, /fill="none"/, `Monochromatic SVG fill none in ${name}`);
  }
});

test('4. Header is simplified to single row preserving logo, bridge indicator, IMO search, voyage ref, gear menu, master report, and right actions', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    // Logo
    assert.match(content, /SeaCharter Core PRO/, `Brand name in ${name}`);
    assert.match(content, /RODAHMAR ENGINE/, `Engine subtitle in ${name}`);

    // Status bridge
    assert.match(content, /id="connection-status-root"/, `Bridge indicator in ${name}`);

    // IMO Search & Voyage Ref
    assert.match(content, /id="header-vessel-search-container"/, `IMO Search in ${name}`);
    assert.match(content, /id="header-vessel-search-input"/, `IMO input in ${name}`);
    assert.match(content, /id="header-vessel-search-btn"/, `IMO search btn in ${name}`);
    assert.match(content, /id="header-voyage-ref-container"/, `Voyage ref container in ${name}`);
    assert.match(content, /id="quick-ref"/, `Quick ref input in ${name}`);

    // Gear button and Master Executive Report
    assert.match(content, /id="advanced-modules-btn"/, `Gear button in ${name}`);
    assert.match(content, /id="advanced-modules-menu"/, `Gear dropdown menu in ${name}`);
    assert.match(content, /id="btn-master-executive-report"/, `Master report button in ${name}`);
    assert.match(content, /onclick="generarInformeMasterOnClick\(event\)"/, `Master report click handler in ${name}`);

    // Right actions
    assert.match(content, /id="new-estimation-btn"/, `New estimation btn in ${name}`);
    assert.match(content, /id="mobile-session-menu-btn"/, `Three dots menu btn in ${name}`);
    assert.match(content, /id="btn-open-faq-modal"/, `FAQ btn in ${name}`);
    assert.match(content, /id="language-selector"/, `Language selector in ${name}`);
    assert.match(content, /id="global-view-mode-switch"/, `View mode switch in ${name}`);
    assert.match(content, /id="btn-view-mode-owner"/, `OWN btn in ${name}`);
    assert.match(content, /id="btn-view-mode-charterer"/, `CHR btn in ${name}`);
    assert.match(content, /id="btn-collapse-header"/, `Header collapse btn in ${name}`);

    // CRM and LOG are not in the header
    assert.doesNotMatch(content, /id="btn-quick-crm"/, `CRM quick btn must not be in ${name}`);
    assert.doesNotMatch(content, /id="btn-quick-log"/, `LOG quick btn must not be in ${name}`);

    // CSS guarantees single row and visible dropdowns
    assert.match(content, /header\.app-header\s*\{[\s\S]*?flex-wrap:\s*nowrap\s*!important/, `Header flex nowrap in ${name}`);
    assert.match(content, /header\.app-header\s*\{[\s\S]*?overflow:\s*visible\s*!important/, `Header overflow visible in ${name}`);
  }
});

test('5. Three dots menu (⋮) contains strictly session actions: Guardar Sesión, Cargar Sesión, and Salir', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const menuMatch = content.match(/<ul id="tools-dropdown-menu"[\s\S]*?<\/ul>/);
    assert.ok(menuMatch, `tools-dropdown-menu found in ${name}`);
    const menu = menuMatch[0];

    assert.match(menu, /Guardar Sesión/, `Guardar Sesión present in ${name}`);
    assert.match(menu, /Cargar Sesión/, `Cargar Sesión present in ${name}`);
    assert.match(menu, /id="load-session-btn"[^>]*onclick="loadAuditSession\(\)"/, `Cargar Sesión button calls loadAuditSession() in ${name}`);
    assert.match(menu, /Salir/, `Salir present in ${name}`);

    // Extracted items must no longer be inside tools-dropdown-menu
    assert.doesNotMatch(menu, /Reporte de Mercado/, `Reporte de Mercado extracted from menu in ${name}`);
    assert.doesNotMatch(menu, /id="btn-toggle-databridge"/, `Data Bridge extracted from menu in ${name}`);
    assert.doesNotMatch(menu, /id="btn-open-land-charter"/, `Land Charter extracted from menu in ${name}`);

    // loadAuditSession directly switches to dossiers and loads database list
    assert.match(content, /function loadAuditSession\(\)\s*\{[\s\S]*?switchTab\(['"]dossiers['"]\)/, `loadAuditSession switches to dossiers in ${name}`);
    assert.match(content, /function loadAuditSession\(\)\s*\{[\s\S]*?window\.DossierManager\?\.loadList\(\)/, `loadAuditSession reloads dossiers in ${name}`);
    assert.doesNotMatch(content, /function loadAuditSession\(\)\s*\{[\s\S]*?load-session-file-input/, `loadAuditSession does not open local file input in ${name}`);
  }
});

test('6. Joint folding in MAP view: Input Geográfico and Predictive Congestion Shield collapse simultaneously with floating button', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    // Floating restore button
    assert.match(content, /id="btn-show-route-congestion"/, `Floating restore button in ${name}`);
    assert.match(content, /Mostrar Ruta y Congestión/, `Floating button label in ${name}`);
    assert.match(content, /toggleRouteInputPanel\(false\)/, `Click restores route & congestion in ${name}`);

    // CSS rules for joint collapse
    assert.match(content, /\.map-command-shell\.input-collapsed #congestion-shield-sidebar-card/, `Congestion card collapses with input in ${name}`);

    // Controller handles both panels and floating button
    assert.match(content, /congestionCard\.classList\.toggle\('is-collapsed',\s*!isGeoInputOpen\)/, `Congestion card toggles in ${name}`);
    assert.match(content, /btnShowRoute\.classList\.toggle\('hidden',\s*isGeoInputOpen\)/, `Floating button toggles in ${name}`);
  }
});

test('7. App body container wraps sidebar and workspace content cleanly without overlapping views', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(content, /id="app-body-container"/, `app-body-container exists in ${name}`);
    assert.match(content, /class="[^"]*app-workspace-content[^"]*"/, `app-workspace-content exists in ${name}`);
    assert.match(content, /<main class="app-main/, `main remains inside app-workspace-content in ${name}`);
  }
});
