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

test('the operational email style manual ships the six standard templates', () => {
  assert.match(prompt, /=== MANUAL DE ESTILO PARA EMAILS OPERATIVOS \(PLANTILLAS\) ===/);
  assert.match(prompt, /PLANTILLA 1: ACTUALIZACIÓN DE TRÁNSITO Y ETA/);
  assert.match(prompt, /PLANTILLA 2: INICIO DE OPERACIONES Y PREVISIÓN DE HORAS/);
  assert.match(prompt, /PLANTILLA 3: ALERTA DE DEMORAS \(LAYTIME WARNING\)/);
  assert.match(prompt, /PLANTILLA 4: AUDITORÍA TÉCNICA Y DUE DILIGENCE/);
  assert.match(prompt, /PLANTILLA 5: PROJECT CARGO Y MEDIOS IDÓNEOS/);
  assert.match(prompt, /PLANTILLA 6: OFERTA COMERCIAL \(RESPUESTA A SOLICITUD\)/);
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

  assert.equal(templateBodies.length, 6);
  for (const body of templateBodies) {
    // Ningún cuerpo contiene saltos de línea reales: solo la secuencia escapada \n.
    assert.match(body, /\\n/);
    const rendered = JSON.parse(`"${body.replace(/"/g, '\\"')}"`);
    assert.ok(rendered.split('\n').length > 1);
    assert.ok(rendered.includes('Estimado') || rendered.includes('Confirmamos'));
  }

  assert.match(prompt, /los saltos de línea \(\\n\) se escapan correctamente en el JSON resultante \(email_body\)/);
});

test('Core PRO extracts the DRAFT_EMAIL JSON instead of printing it in the chat', () => {
  assert.match(frontendSource, /function isDraftEmailAction\(candidate\)/);
  assert.match(frontendSource, /\|\| isDraftEmailAction\(parsed\)\) \{/);
  assert.match(frontendSource, /\|\| isDraftEmailAction\(action\)\) \{/);
});

test('the RFI protocol forces a JSON-only DRAFT_EMAIL answer', () => {
  assert.match(prompt, /=== PROTOCOLO RFI \(REQUEST FOR INFORMATION\)/);
  // La regla estricta cubre los tres disparadores operativos.
  assert.match(prompt, /cuestionario pre-arribo/);
  assert.match(prompt, /petición de plano de estiba \(Stowage Plan\)/);
  assert.match(prompt, /confirmación de readiness de carga/);
  assert.match(prompt, /PROHIBIDO responder con texto conversacional/);
  assert.match(prompt, /ÚNICAMENTE un objeto JSON válido con la acción DRAFT_EMAIL/);
  // El contrato con el modal del frontend se mantiene intacto.
  assert.match(prompt, /"email_to": "\.\.\.", "email_subject": "\.\.\.", "email_body": "\.\.\."/);
  assert.match(prompt, /No inventes campos nuevos ni renombres los existentes/);
  // El protocolo RFI vive dentro del prompt del asistente, tras la acción DRAFT_EMAIL.
  assert.ok(prompt.indexOf('"action": "DRAFT_EMAIL"') < prompt.indexOf('=== PROTOCOLO RFI'));
});

test('the RFI protocol ships the three requirement templates with escaped newlines', () => {
  const rfiSections = prompt.split(/PLANTILLA RFI-\d \(/).slice(1);
  assert.equal(rfiSections.length, 3);

  assert.match(rfiSections[0], /^AGENTE PORTUARIO — PRE-ARRIVAL\)/);
  assert.match(rfiSections[0], /Asunto: Requerimiento Operativo y Proforma PDA — MV \[vessel_name\] en \[port_name\]/);
  assert.match(rfiSections[1], /^CAPITÁN\/ARMADOR — ESTIBA\)/);
  assert.match(rfiSections[1], /Asunto: Instrucciones de Viaje y Requerimiento de Estiba — MV \[vessel_name\]/);
  assert.match(rfiSections[2], /^CLIENTE\/FLETADOR — READINESS\)/);
  assert.match(rfiSections[2], /Asunto: Confirmación de Readiness y Especificaciones de Carga/);

  for (const section of rfiSections) {
    const body = section.split('Cuerpo:\n')[1].split('\n')[0];
    // El cuerpo viaja en una sola línea con \n escapados, listo para el JSON del modal.
    assert.match(body, /\\n/);
    const rendered = JSON.parse(`"${body.replace(/"/g, '\\"')}"`);
    assert.ok(rendered.split('\n').length > 1);
    assert.match(rendered, /Rodahmar Shipping$/);
  }
});

test('the legal protocol forces a JSON-only DRAFT_EMAIL answer for LOP and LOI', () => {
  assert.match(prompt, /=== PROTOCOLO DE PLANTILLAS LEGALES \(LOP y LOI\)/);
  // La regla estricta cubre los dos disparadores legales.
  assert.match(prompt, /Carta de Protesta \(Letter of Protest \/ LOP\)/);
  assert.match(prompt, /Carta de Indemnidad \(Letter of Indemnity \/ LOI\)/);
  assert.match(prompt, /PROHIBIDO responder con texto conversacional/);
  assert.match(prompt, /ÚNICAMENTE un objeto JSON válido con la acción DRAFT_EMAIL/);
  // El protocolo legal vive dentro del prompt del asistente, tras la acción DRAFT_EMAIL.
  assert.ok(prompt.indexOf('"action": "DRAFT_EMAIL"') < prompt.indexOf('=== PROTOCOLO DE PLANTILLAS LEGALES'));
  // La redacción contractual no se suaviza ni se reformula.
  assert.match(prompt, /No suavices ni reescribas la redacción legal/);
});

test('the legal protocol ships the two LOP templates and the LOI template', () => {
  const legalSections = prompt.split(/PLANTILLA (?:LOP|LOI)-\d \(/).slice(1);
  assert.equal(legalSections.length, 3);

  assert.match(legalSections[0], /^LETTER OF PROTEST — DISCREPANCIA DE CARGA\)/);
  assert.match(legalSections[0], /Asunto: LETTER OF PROTEST - Cargo Discrepancy - MV \[vessel_name\] \/ \[port_name\]/);
  assert.match(legalSections[1], /^LETTER OF PROTEST — RETRASOS DE TERMINAL \/ LAYTIME\)/);
  assert.match(legalSections[1], /Asunto: LETTER OF PROTEST - Terminal Delays \/ Stoppages - MV \[vessel_name\]/);
  assert.match(legalSections[2], /^EMISIÓN DE LOI — DESCARGA SIN OBL\)/);
  assert.match(legalSections[2], /Asunto: LOI - Request to Discharge without Original Bills of Lading - MV \[vessel_name\]/);

  for (const section of legalSections) {
    const body = section.split('Cuerpo:\n')[1].split('\n')[0];
    // El cuerpo viaja en una sola línea con \n escapados, listo para el JSON del modal.
    assert.match(body, /\\n/);
    const rendered = JSON.parse(`"${body.replace(/"/g, '\\"')}"`);
    assert.ok(rendered.split('\n').length > 1);
    assert.match(rendered, /Dear Sirs,/);
    assert.match(rendered, /Rodahmar Shipping$/);
  }

  // La cláusula probatoria y la reserva de laytime/derechos se conservan literales.
  assert.match(legalSections[0], /strictly "weight, measure, and quality unknown"/);
  assert.match(legalSections[1], /will not count as laytime/);
  assert.match(legalSections[2], /International Group P&I Club Letter of Indemnity \(LOI\)/);
});
