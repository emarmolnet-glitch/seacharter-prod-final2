import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const drawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');
const madrePanelSource = readFileSync(new URL('../src/components/MadrePanel.jsx', import.meta.url), 'utf8');
const voiceHookSource = readFileSync(new URL('../src/hooks/useMadreVoice.js', import.meta.url), 'utf8');
const madreChatSource = readFileSync(new URL('../netlify/functions/madre-chat.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('1. Captura Dinámica del Contexto Completo: Función extractDynamicAuditContext y hasActiveDocumentOrAudit', () => {
  // Verificación de existencia y exportación
  assert.match(drawerSource, /function\s+extractDynamicAuditContext\s*\(/);
  assert.match(drawerSource, /function\s+hasActiveDocumentOrAudit\s*\(/);
  assert.match(drawerSource, /export\s*\{[\s\S]*?extractDynamicAuditContext[\s\S]*?\}/);
  assert.match(drawerSource, /export\s*\{[\s\S]*?hasActiveDocumentOrAudit[\s\S]*?\}/);

  // Verificación de extracción de los 6 campos requeridos
  assert.match(drawerSource, /documentType:\s*documentType/);
  assert.match(drawerSource, /documentName:\s*documentName/);
  assert.match(drawerSource, /fullAuditData/);
  assert.match(drawerSource, /rawDocumentText/);
  assert.match(drawerSource, /activeScreenContext/);
  assert.match(drawerSource, /userLanguage/);

  // Verificación de límite de 25.000 caracteres
  assert.match(drawerSource, /slice\(\s*0\s*,\s*25000\s*\)/);

  // Verificación de extracción completa de tablas (incluso colapsadas o con scroll)
  assert.match(drawerSource, /containerEl\.querySelectorAll\(['"]table['"]\)/);
  assert.match(drawerSource, /fullAuditData\.tablas\.push/);
});

test('2. Modo Dual y Memoria de Sesión: activeAuditContext y userFocusQuestion', () => {
  // Verificación de estado de sesión activeAuditContext
  assert.match(drawerSource, /const\s+\[activeAuditContext,\s*setActiveAuditContext\]\s*=\s*useState\(null\)/);
  assert.match(drawerSource, /activeAuditContextRef/);

  // Verificación de la etiqueta visual discreta con botón de desvinculación [x]
  assert.match(drawerSource, /Documento vinculado:/);
  assert.match(drawerSource, /setActiveAuditContext\(null\)/);

  // Verificación de captura dual de userFocusQuestion
  assert.match(drawerSource, /payload\.userFocusQuestion\s*=\s*focusQuestion/);
  assert.match(drawerSource, /payload\.scanMode\s*=\s*["']audit_critical["']/);
});

test('3. Payload hacia madre-chat.js: Envío de scanMode="audit_critical" y userLanguage solo cuando hay auditoría', () => {
  assert.match(drawerSource, /if\s*\(hasCriticalAudit\s*&&\s*effectiveAudit\)\s*\{/);
  assert.match(drawerSource, /payload\.auditPayload\s*=\s*effectiveAudit/);
  assert.match(drawerSource, /payload\.userLanguage\s*=/);

  // Backend madre-chat maneja scanMode="audit_critical"
  assert.match(madreChatSource, /scanMode\s*===\s*['"]audit_critical['"]/);
  assert.match(madreChatSource, /auditPayload/);
  assert.match(madreChatSource, /userFocusQuestion/);
});

test('4. Presentación Impecable y Voz Limpia: MarkdownMessage, CopyReportButton y voiceSummary', () => {
  // Componente de mensaje Markdown con tablas responsivas
  assert.match(drawerSource, /function\s+MarkdownMessage/);
  assert.match(drawerSource, /overflow-x-auto/);
  assert.match(drawerSource, /<table/);

  // Botón sutil "Copiar informe"
  assert.match(drawerSource, /function\s+CopyReportButton/);
  assert.match(drawerSource, /Copiar informe/);
  assert.match(drawerSource, /<CopyReportButton/);

  // useMadreVoice prioriza voiceSummary
  assert.match(voiceHookSource, /content\.voiceSummary/);
  assert.match(voiceHookSource, /export function useMadreVoice/);
  assert.match(voiceHookSource, /export async function playNeuralMotherVoice/);

  // GlobalMadreDrawer vocaliza voiceSummary
  assert.match(drawerSource, /const textToVocalize = data\.voiceSummary \|\| data\.mensaje_voz \|\| finalReply/);
});

test('5. Botones de Escaneo en Cabecera de App.jsx e index.html', () => {
  assert.match(appSource, /id="btn-madre-scan-header"/);
  assert.match(appSource, /title="Escanear y auditar pantalla con MADRE"/);

  assert.match(indexSource, /id="madre-topbar-scan-button"/);
  assert.match(indexSource, /title="Escanear pantalla con MADRE"/);
});

test('6. Re-exportación completa en MadrePanel.jsx', () => {
  assert.match(madrePanelSource, /extractDynamicAuditContext/);
  assert.match(madrePanelSource, /hasActiveDocumentOrAudit/);
  assert.match(madrePanelSource, /MarkdownMessage/);
  assert.match(madrePanelSource, /CopyReportButton/);
  assert.match(madrePanelSource, /GlobalMadreDrawer/);
  assert.match(madrePanelSource, /MadrePanel/);
});

test('7. Ajuste Quirúrgico 1: Deadline ampliado a 24000ms para scanMode="audit_critical"', () => {
  assert.match(madreChatSource, /body\?\.scanMode\s*===\s*['"]audit_critical['"]\s*\?\s*24_?000\s*:\s*AI_TIMEOUT_MS/);
});

test('8. Ajuste Quirúrgico 2: Multilenguaje en buildStrategicPayload para audit_critical', () => {
  assert.match(madreChatSource, /if\s*\(isAuditCritical\)\s*\{[\s\S]*?DIRECTIVA DE IDIOMA PARA AUDITORÍA CRÍTICA/);
  assert.match(madreChatSource, /userLanguage/);
});

test('9. Ajuste Quirúrgico 3: useMadreVoice desbloqueo de estado y audioCtx.resume()', () => {
  // Desbloqueo de isSpeaking si playNeuralMotherVoice devuelve null
  assert.match(voiceHookSource, /if\s*\(!audioInstance\)\s*\{\s*setIsSpeaking\(false\);\s*return null;\s*\}/);
  
  // Reanudación de AudioContext suspendido
  assert.match(voiceHookSource, /if\s*\(audioCtx\.state\s*===\s*['"]suspended['"]\)\s*\{\s*await\s+audioCtx\.resume\(\);\s*\}/);
});

test('10. Ajuste Quirúrgico 4: Persistencia en memoria de rawDocumentText para documentos cargados', () => {
  // GlobalMadreDrawer lee primero de memoria
  assert.match(drawerSource, /window\.State\?\.uploadedFile\?\.text/);
  assert.match(drawerSource, /window\.State\?\.rawDocumentText/);
  assert.match(drawerSource, /window\.activeDocumentText/);

  // index.html guarda en memoria tras procesar documentos
  assert.match(indexSource, /State\.rawDocumentText\s*=\s*finalPdfText/);
  assert.match(indexSource, /window\.activeDocumentText\s*=\s*finalPdfText/);
  assert.match(indexSource, /State\.rawDocumentText\s*=\s*finalSyncedText/);
});
