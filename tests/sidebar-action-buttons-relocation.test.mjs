import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
const distIndexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf-8');

test('1. Header no longer contains the 4 action buttons (Configuración, Informe Master, Añadir, Opciones)', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const headerMatch = content.match(/<header\b[^>]*>([\s\S]*?)<\/header>/);
    assert.ok(headerMatch, `Header found in ${name}`);
    const headerContent = headerMatch[1];

    // The 4 action buttons must NOT be inside the header
    assert.doesNotMatch(headerContent, /id="advanced-modules-btn"/, `Configuración (gear) removed from header in ${name}`);
    assert.doesNotMatch(headerContent, /id="advanced-modules-menu"/, `Configuración dropdown removed from header in ${name}`);
    assert.doesNotMatch(headerContent, /id="btn-master-executive-report"/, `Generar Informe Master removed from header in ${name}`);
    assert.doesNotMatch(headerContent, /id="new-estimation-btn"/, `Añadir (+) removed from header in ${name}`);
    assert.doesNotMatch(headerContent, /id="mobile-session-menu-btn"/, `Opciones/Más (3 dots) removed from header in ${name}`);
    assert.doesNotMatch(headerContent, /id="tools-dropdown-menu"/, `Session tools dropdown removed from header in ${name}`);
  }
});

test('2. Header retains exclusively Logo/Title, Connection status, Search bar and active dossier reference', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const headerMatch = content.match(/<header\b[^>]*>([\s\S]*?)<\/header>/);
    assert.ok(headerMatch, `Header found in ${name}`);
    const header = headerMatch[1];

    // Logo & Title
    assert.match(header, /SeaCharter Core PRO/, `Logo/Title present in ${name}`);
    assert.match(header, /RODAHMAR ENGINE/, `Engine subtitle present in ${name}`);

    // Indicators of connection
    assert.match(header, /id="connection-status-root"/, `Connection indicator present in ${name}`);

    // Search bar (expanded container)
    assert.match(header, /id="header-vessel-search-container"/, `Search container present in ${name}`);
    assert.match(header, /id="header-vessel-search-input"/, `Search input present in ${name}`);
    assert.match(header, /id="header-vessel-search-btn"/, `Search button present in ${name}`);

    // Active dossier / voyage reference
    assert.match(header, /id="header-voyage-ref-container"/, `Dossier ref container present in ${name}`);
    assert.match(header, /id="quick-ref"/, `Quick ref input present in ${name}`);
    assert.match(header, /Expediente:/, `Expediente badge present in ${name}`);
  }
});

test('3. Sidebar integrates Añadir (+) and Generar Informe Master below main navigation modules', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const sidebarMatch = content.match(/<aside id="app-navigation-sidebar"[\s\S]*?<\/aside>/);
    assert.ok(sidebarMatch, `Sidebar found in ${name}`);
    const sidebar = sidebarMatch[0];

    // Both action buttons exist inside the sidebar
    assert.match(sidebar, /id="new-estimation-btn"/, `Añadir (+) in sidebar in ${name}`);
    assert.match(sidebar, /id="btn-master-executive-report"/, `Generar Informe Master in sidebar in ${name}`);

    // They appear after primary-module-tabs
    const tabsIdx = sidebar.indexOf('id="primary-module-tabs"');
    const newEstIdx = sidebar.indexOf('id="new-estimation-btn"');
    const masterReportIdx = sidebar.indexOf('id="btn-master-executive-report"');
    assert.ok(tabsIdx < newEstIdx, `Añadir (+) appears after primary navigation tabs in ${name}`);
    assert.ok(tabsIdx < masterReportIdx, `Informe Master appears after primary navigation tabs in ${name}`);

    // Labels & tooltips
    assert.match(sidebar, /title="Nueva Estimación"/, `Nueva Estimación title in ${name}`);
    assert.match(sidebar, /title="Generar Informe Master"/, `Informe Master title in ${name}`);
    assert.match(sidebar, /<span>Nueva Estimación<\/span>/, `Nueva Estimación label in ${name}`);
    assert.match(sidebar, /<span>Informe Master<\/span>/, `Informe Master label in ${name}`);
  }
});

test('4. Sidebar footer groups Configuración (gear) and Opciones (3 dots) at the bottom', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    const footerMatch = content.match(/<div class="sidebar-footer[\s\S]*?<\/aside>/);
    assert.ok(footerMatch, `Sidebar footer found in ${name}`);
    const footer = footerMatch[0];

    // Gear button and menu
    assert.match(footer, /id="advanced-modules-btn"/, `Gear button in sidebar footer in ${name}`);
    assert.match(footer, /id="advanced-modules-menu"/, `Gear dropdown menu in sidebar footer in ${name}`);
    assert.match(footer, /title="Herramientas Avanzadas"/, `Gear button title in ${name}`);

    // Three dots button and menu
    assert.match(footer, /id="mobile-session-menu-btn"/, `Three dots button in sidebar footer in ${name}`);
    assert.match(footer, /id="tools-dropdown-menu"/, `Session tools menu in sidebar footer in ${name}`);
    assert.match(footer, /title="Utilidades de Sesión"/, `Three dots title in ${name}`);
    assert.match(footer, /id="load-session-file-input"/, `Hidden file input in sidebar footer in ${name}`);

    // Labels
    assert.match(footer, /<span>Configuración<\/span>/, `Configuración label in ${name}`);
    assert.match(footer, /<span>Opciones<\/span>/, `Opciones label in ${name}`);
  }
});

test('5. Operational onClick handlers and functionality are fully preserved', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(content, /id="new-estimation-btn"[^>]*onclick="window\.DossierManager\?\.requestNewEstimation\(\);\s*closeMobileSessionMenu\(\);"/, `Añadir onClick in ${name}`);
    assert.match(content, /id="btn-master-executive-report"[^>]*onclick="generarInformeMasterOnClick\(event\)"/, `Informe Master onClick in ${name}`);
    assert.match(content, /id="advanced-modules-btn"[^>]*onclick="toggleAdvancedModulesMenu\(event\)"/, `Configuración onClick in ${name}`);
    assert.match(content, /id="mobile-session-menu-btn"[^>]*onclick="toggleMobileSessionMenu\(event\)"/, `Opciones onClick in ${name}`);
  }
});

test('6. Responsive CSS keeps header minimal on small screens and supports sidebar dropdown popouts', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    // Dropdown popout from sidebar
    assert.match(content, /#app-navigation-sidebar\s+\.tools-dropdown-menu\s*\{[\s\S]*?position:\s*absolute\s*!important/, `Sidebar dropdown absolute position in ${name}`);
    assert.match(content, /#app-navigation-sidebar\s+\.tools-dropdown-menu\s*\{[\s\S]*?left:\s*calc\(100%\s*\+\s*8px\)\s*!important/, `Sidebar dropdown left-full offset in ${name}`);

    // Responsive small screen styles
    assert.match(content, /header\.app-header\s*>\s*\.header-actions-right\s*\{\s*display:\s*none\s*!important;\s*\}/, `Header actions right hidden on small screens in ${name}`);
    assert.match(content, /header\.app-header\s*>\s*\.header-left\s+\.header-app-title\s*\{\s*display:\s*none\s*!important;\s*\}/, `Header app title hidden on small screens in ${name}`);
  }
});
