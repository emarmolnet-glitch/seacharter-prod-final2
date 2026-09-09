import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  searchTavily,
  searchSerpApi,
  searchBrave,
  searchCommercialWeb,
  isCommercialEntitiesQuery,
} from '../netlify/functions/_shared/web-search.mjs';

const chatAssistantSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const cerebroSource = await readFile(new URL('../netlify/functions/cerebro-ia.js', import.meta.url), 'utf8');

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
  'const searchTavily = async () => "";',
  'const searchSerpApi = async () => "";',
  'const searchBrave = async () => "";',
  chatAssistantSource.split('\n').filter((line) => !line.startsWith('import ')).join('\n'),
].join('\n');

const { buildSystemInstruction, buildGeminiHistory } = await import(
  `data:text/javascript;base64,${Buffer.from(stubbedModule, 'utf8').toString('base64')}`
);

test('chat-assistant imports web search providers from _shared/web-search.mjs', () => {
  assert.match(chatAssistantSource, /import\s*\{\s*searchTavily,\s*searchSerpApi,\s*searchBrave\s*\}\s*from\s*"\.\/_shared\/web-search\.mjs";/);
  assert.equal(typeof searchTavily, 'function');
  assert.equal(typeof searchSerpApi, 'function');
  assert.equal(typeof searchBrave, 'function');
  assert.equal(typeof searchCommercialWeb, 'function');
});

test('isCommercialEntitiesQuery detects inquiries for armadores, dueños, consignatarios, agentes and commercial operators', () => {
  assert.equal(isCommercialEntitiesQuery('¿Quién es el armador del MV Oslo?'), true);
  assert.equal(isCommercialEntitiesQuery('Busca los dueños del barco'), true);
  assert.equal(isCommercialEntitiesQuery('Necesito el consignatario en el puerto de Algeciras'), true);
  assert.equal(isCommercialEntitiesQuery('Dime los agentes marítimos para este embarque'), true);
  assert.equal(isCommercialEntitiesQuery('Localiza el commercial operator del granelero'), true);
  assert.equal(isCommercialEntitiesQuery('Contacto del chartering desk'), true);
  assert.equal(isCommercialEntitiesQuery('¿Cuál es la distancia entre Valencia y Rotterdam?'), false);
  assert.equal(isCommercialEntitiesQuery('Calcula el flete para 15000 MT'), false);
});

test('buildSystemInstruction incorporates commercial intelligence rules and ignores Registered Owner', () => {
  const instruction = buildSystemInstruction({}, [], 'PREGUNTA_GENERAL');

  assert.match(instruction, /Inteligencia Comercial y Operadores/);
  assert.match(instruction, /IGNORAR 'Registered Owner'/);
  assert.match(instruction, /BUSCAR Y PRIORIZAR 'Commercial Operator' \/ 'Disponent Owner'/);
  assert.match(instruction, /BUSCAR 'Chartering Desk'/);
  assert.match(instruction, /CONSIGNATARIOS Y AGENTES PORTUARIOS/);
});

test('buildGeminiHistory formats conversation history with strictly alternating roles ending in model', () => {
  const history = [
    { role: 'user', content: '¿Quién es el armador del buque BBC Pearl?' },
    { role: 'assistant', content: 'El operador comercial es BBC Chartering.' },
    { role: 'user', content: '[RESULTADOS DE BÚSQUEDA WEB EN TIEMPO REAL - INTELIGENCIA COMERCIAL / ARMADORES / CONSIGNATARIOS]: BBC Chartering GmbH' },
    { role: 'assistant', content: 'Información comercial web recopilada y verificada.' },
  ];

  const geminiHistory = buildGeminiHistory(history);
  assert.equal(geminiHistory.length, 4);
  assert.equal(geminiHistory[0].role, 'user');
  assert.equal(geminiHistory[1].role, 'model');
  assert.equal(geminiHistory[2].role, 'user');
  assert.equal(geminiHistory[3].role, 'model');
  assert.match(geminiHistory[2].parts[0].text, /RESULTADOS DE BÚSQUEDA WEB/);
});

test('chat-assistant triggers conditional web search and injects into history', () => {
  assert.match(chatAssistantSource, /if\s*\(isCommercialEntitiesQuery\(mensaje\)\)/);
  assert.match(chatAssistantSource, /webSearchResult\s*=\s*await searchCommercialWeb\(mensaje\)/);
  assert.match(chatAssistantSource, /\[RESULTADOS DE BÚSQUEDA WEB EN TIEMPO REAL - INTELIGENCIA COMERCIAL \/ ARMADORES \/ CONSIGNATARIOS\]/);
  assert.match(chatAssistantSource, /const chatHistory = buildGeminiHistory\(normalizedHistory\)/);
  assert.match(chatAssistantSource, /model\.startChat\(chatHistory\.length > 0 \? \{ history: chatHistory \} : undefined\)/);
});

test('GOLDEN RULE: Cerebro.ia structure and endpoints remain completely untouched and parallel', () => {
  assert.match(cerebroSource, /https:\/\/calm-shortbread-55bcfc\.netlify\.app\/\.netlify\/functions\/cerebro-ia/);
  assert.match(cerebroSource, /export default async function proxyRequest/);
});
