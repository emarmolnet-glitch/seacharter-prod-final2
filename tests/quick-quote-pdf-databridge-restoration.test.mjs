import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const panelCode = fs.readFileSync(path.join(rootDir, 'src/components/QuickQuotePanel.jsx'), 'utf-8');

test('1. Conexión de funciones PDF en QuickQuotePanel.jsx', () => {
  // Verificación de props desestructuradas
  assert.match(
    panelCode,
    /onExportPdf\s*=\s*null/,
    'Debe desestructurar onExportPdf en las props de QuickQuotePanel'
  );
  assert.match(
    panelCode,
    /onExport\s*=\s*null/,
    'Debe desestructurar onExport en las props de QuickQuotePanel'
  );
  assert.match(
    panelCode,
    /generarPDF\s*=\s*null/,
    'Debe desestructurar generarPDF en las props de QuickQuotePanel'
  );

  // Verificación de definición de handleExport
  assert.match(
    panelCode,
    /const\s+handleExport\s*=\s*useCallback\(/,
    'Debe definir el callback handleExport para exportar PDF'
  );
  assert.match(
    panelCode,
    /window\.exportMultimodalClientPdf\(\{/,
    'handleExport debe soportar delegación a window.exportMultimodalClientPdf'
  );

  // Verificación de conexión en botón JSX
  assert.match(
    panelCode,
    /<button\s+id="fcl-export-client-pdf-btn"[^>]*onClick=\{handleExport\}/s,
    'El botón fcl-export-client-pdf-btn debe tener su onClick conectado a handleExport'
  );
});

test('2. Conexión de funciones Data Bridge en QuickQuotePanel.jsx', () => {
  // Verificación de prop onSyncDataBridge
  assert.match(
    panelCode,
    /onSyncDataBridge\s*=\s*null/,
    'Debe desestructurar onSyncDataBridge en las props de QuickQuotePanel'
  );

  // Verificación de definición de handleSyncClick
  assert.match(
    panelCode,
    /const\s+handleSyncClick\s*=\s*useCallback\(/,
    'Debe definir el callback handleSyncClick'
  );
  assert.match(
    panelCode,
    /window\.handleSyncDataBridge\(\)/,
    'handleSyncClick debe soportar delegación a window.handleSyncDataBridge()'
  );

  // Verificación de conexión en botón JSX
  assert.match(
    panelCode,
    /<button\s+id="btn-sync-databridge-quote"[^>]*onClick=\{handleSyncClick\}/s,
    'El botón btn-sync-databridge-quote debe tener su onClick conectado a handleSyncClick'
  );
});

test('3. Desbloqueo tras cálculo de tarifa (sin atributos disabled residuales)', () => {
  // El botón PDF debe estar deshabilitado ÚNICAMENTE si isZeroOrNull
  assert.match(
    panelCode,
    /disabled=\{isZeroOrNull\}/,
    'fcl-export-client-pdf-btn se bloquea solo si la tarifa es cero o nula'
  );

  // El botón Data Bridge se bloquea solo si confirmed, syncing, o isZeroOrNull
  assert.match(
    panelCode,
    /disabled=\{status === 'confirmed' \|\| isSyncing \|\| isZeroOrNull\}/,
    'btn-sync-databridge-quote se habilita una vez calculada la tarifa y mientras no esté confirmado'
  );
});
