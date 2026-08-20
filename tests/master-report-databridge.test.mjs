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
