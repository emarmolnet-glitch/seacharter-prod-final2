import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Master Report payload uses the Data Bridge AI contract', () => {
  const start = source.indexOf('function recopilarDatosParaInformeMaster');
  const end = source.indexOf('function getDataBridgeMasterReportEndpoint', start);
  const payloadSource = source.slice(start, end);

  assert.match(payloadSource, /CalculationData:\s*\{/);
  assert.match(payloadSource, /MarketData:\s*\{/);
  assert.match(payloadSource, /UserContext:\s*\{/);
  assert.match(payloadSource, /Operational: data\.operational/);
  assert.match(payloadSource, /puerto_carga: data\.operational\.pol/);
  assert.match(payloadSource, /puerto_descarga: data\.operational\.pod/);
});

test('Master Report posts to the configurable cerebro-ia endpoint', () => {
  assert.match(source, /VITE_DATA_BRIDGE_AI_URL/);
  assert.match(source, /\.netlify\/functions\/cerebro-ia/);

  const start = source.indexOf('async function generarInformeMasterOnClick');
  const end = source.indexOf('async function generateMasterExecutiveReport', start);
  const handlerSource = source.slice(start, end);

  assert.match(handlerSource, /fetch\(getDataBridgeMasterReportEndpoint\(\), \{/);
  assert.match(handlerSource, /method: 'POST'/);
  assert.match(handlerSource, /body: JSON\.stringify\(datos\)/);
  assert.match(handlerSource, /respuesta\.json\(\)/);
  assert.match(handlerSource, /renderMasterReportPreview\(extractDataBridgeMasterReport\(resultado\)\)/);
  assert.match(handlerSource, /AbortController/);
  assert.doesNotMatch(handlerSource, /fetch\('\/api\/generar-informe'/);
});

test('Master Report option 3 opens the assistant report without validation or Data Bridge', () => {
  const chooserStart = source.indexOf('function chooseMasterReportMode');
  const chooserEnd = source.indexOf('function hasValidMasterCalculatorData', chooserStart);
  const chooserSource = source.slice(chooserStart, chooserEnd);
  assert.match(chooserSource, /3 = Informe del Asistente \/ IA/);
  assert.match(chooserSource, /normalized === '3'/);
  assert.match(chooserSource, /return 'assistant'/);

  const handlerStart = source.indexOf('async function generarInformeMasterOnClick');
  const handlerEnd = source.indexOf('async function generateMasterExecutiveReport', handlerStart);
  const handlerSource = source.slice(handlerStart, handlerEnd);
  const assistantBranch = handlerSource.indexOf("if (reportMode === 'assistant')");
  const validationCall = handlerSource.indexOf('validarInformeMaster(reportMode)');
  const dataBridgeFetch = handlerSource.indexOf('fetch(getDataBridgeMasterReportEndpoint()');

  assert.ok(assistantBranch >= 0, 'option 3 has a dedicated assistant branch');
  assert.ok(assistantBranch < validationCall, 'assistant report opens before mandatory-module validation');
  assert.ok(validationCall < dataBridgeFetch, 'standard and strict reports remain validated before Data Bridge');
  assert.match(handlerSource.slice(assistantBranch, validationCall), /renderMasterReportPreview\(gatherMasterAuditData\(\)\)/);
  assert.match(handlerSource.slice(assistantBranch, validationCall), /return true/);
});

test('Addendum validation only applies to standard and strict reports', () => {
  const validationStart = source.indexOf('function validarInformeMaster');
  const validationEnd = source.indexOf('function recopilarDatosParaInformeMaster', validationStart);
  const validationSource = source.slice(validationStart, validationEnd);

  assert.match(validationSource, /reportMode !== 'assistant' && !hasValidMasterLegalAudit\(\)/);
});

test('Master Report removes Markdown markers before preview, printing, and PDF export', () => {
  const formatterStart = source.indexOf('function formatMasterReportMarkdownText');
  const formatterEnd = source.indexOf('function sanitizeDataBridgeMasterReport', formatterStart);
  const formatterSource = source.slice(formatterStart, formatterEnd);

  assert.match(formatterSource, /#\{1,6\}/);
  assert.match(formatterSource, /master-markdown-heading/);
  assert.match(formatterSource, /toUpperCase\(\)/);
  assert.match(formatterSource, /<strong>\$1<\/strong>/);
  assert.match(formatterSource, /replace\(\/\\\*\\\*\/g, ''\)/);

  const sanitizerStart = source.indexOf('function sanitizeDataBridgeMasterReport');
  const sanitizerEnd = source.indexOf('function extractDataBridgeMasterReport', sanitizerStart);
  const sanitizerSource = source.slice(sanitizerStart, sanitizerEnd);
  assert.match(sanitizerSource, /formatMasterReportMarkdownText\(report\)/);
  assert.match(sanitizerSource, /cleanMasterReportMarkdown\(template\.content\)/);

  const previewStart = source.indexOf('function renderMasterReportPreview');
  const previewEnd = source.indexOf('async function exportarInformeMasterPDF', previewStart);
  const previewSource = source.slice(previewStart, previewEnd);
  assert.match(previewSource, /cleanMasterReportMarkdown\(wrapper\.querySelector\('#informe-master-container'\)\)/);
});
