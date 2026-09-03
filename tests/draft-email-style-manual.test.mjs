import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

// chat-assistant.js es ESM con extensión .js y depende del SDK de Gemini: se importa
// con las dependencias sustituidas por stubs porque aquí solo se audita el prompt.
const stubbedModule = [
  'const GoogleGenerativeAI = class {};',
  "const CHAT_INTENTS = { GENERAL: 'PREGUNTA_GENERAL', SIMULATION: 'SIMULACION_FLETE' };",
  'const classifyChatIntent = () => CHAT_INTENTS.GENERAL;',
  'const buildCalculatorAutofillAction = () => null;',
  'const normalizeChatHistory = (historial) => historial || [];',
  "const DATA_BRIDGE_SYSTEM_PROMPT = '';",
  'const DATA_BRIDGE_TOOLS = [];',
  'const executeDataBridgeTool = () => {};',
  'const WEATHER_TOOLS = [];',
  'const executeWeatherTool = () => {};',
  backendSource.split('\n').filter((line) => !line.startsWith('import ')).join('\n'),
].join('\n');

const { buildSystemInstruction } = await import(
  `data:text/javascript;base64,${Buffer.from(stubbedModule, 'utf8').toString('base64')}`
);

const prompt = buildSystemInstruction({}, [], 'PREGUNTA_GENERAL');

test('the master prompt defines DRAFT_EMAIL as an executable action', () => {
  assert.match(prompt, /"action": "DRAFT_EMAIL"/);
  assert.match(prompt, /"email_to"/);
  assert.match(prompt, /"email_subject"/);
  assert.match(prompt, /"email_body"/);
});

test('the operational email style manual ships the five standard templates', () => {
  assert.match(prompt, /=== MANUAL DE ESTILO PARA EMAILS OPERATIVOS \(PLANTILLAS\) ===/);
  assert.match(prompt, /PLANTILLA 1: ACTUALIZACIÓN DE TRÁNSITO Y ETA/);
  assert.match(prompt, /PLANTILLA 2: INICIO DE OPERACIONES Y PREVISIÓN DE HORAS/);
  assert.match(prompt, /PLANTILLA 3: ALERTA DE DEMORAS \(LAYTIME WARNING\)/);
  assert.match(prompt, /PLANTILLA 4: AUDITORÍA TÉCNICA Y DUE DILIGENCE/);
  assert.match(prompt, /PLANTILLA 5: PROJECT CARGO Y MEDIOS IDÓNEOS/);
  // Las fuentes operativas de los campos entre corchetes quedan declaradas.
  assert.match(prompt, /voyages_tracking, telemetría AIS, calculadora PDA o motor Project Cargo/);
  assert.match(prompt, /nunca se envíe un correo con corchetes vacíos/);
  // El manual va inmediatamente debajo de la definición de la acción DRAFT_EMAIL.
  assert.ok(prompt.indexOf('"action": "DRAFT_EMAIL"') < prompt.indexOf('=== MANUAL DE ESTILO PARA EMAILS OPERATIVOS'));
});

test('template bodies carry escaped newlines so email_body stays valid JSON', () => {
  const templateBodies = prompt
    .split(/PLANTILLA \d+: /)
    .slice(1)
    .map((section) => section.split('Cuerpo:\n')[1].split('\n')[0]);

  assert.equal(templateBodies.length, 5);
  for (const body of templateBodies) {
    // Ningún cuerpo contiene saltos de línea reales: solo la secuencia escapada \n.
    assert.match(body, /\\n/);
    const rendered = JSON.parse(`"${body.replace(/"/g, '\\"')}"`);
    assert.ok(rendered.split('\n').length > 1);
    assert.ok(rendered.includes('Estimados') || rendered.includes('Confirmamos'));
  }

  assert.match(prompt, /los saltos de línea \(\\n\) se escapan correctamente en el JSON resultante \(email_body\)/);
});

test('Core PRO extracts the DRAFT_EMAIL JSON instead of printing it in the chat', () => {
  assert.match(frontendSource, /function isDraftEmailAction\(candidate\)/);
  assert.match(frontendSource, /\|\| isDraftEmailAction\(parsed\)\) \{/);
  assert.match(frontendSource, /\|\| isDraftEmailAction\(action\)\) \{/);
});
