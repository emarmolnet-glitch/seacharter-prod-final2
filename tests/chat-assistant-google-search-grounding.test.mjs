import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chatAssistantSource = await readFile(
  new URL('../netlify/functions/chat-assistant.js', import.meta.url),
  'utf8'
);

// Stub module to import exported functions from chat-assistant.js
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

const {
  processGroundedResponse,
  CHAT_ASSISTANT_MODEL,
  searchToolDeclaration,
  executeWebSearch,
  buildSystemInstruction,
} = await import(
  `data:text/javascript;base64,${Buffer.from(stubbedModule, 'utf8').toString('base64')}`
);

test('chat-assistant initializes strictly gemini-2.5-flash with official googleSearch tools and native startChat', () => {
  assert.equal(CHAT_ASSISTANT_MODEL, 'gemini-2.5-flash');
  assert.match(chatAssistantSource, /model:\s*["']gemini-2\.5-flash["']/);
  assert.match(chatAssistantSource, /tools:\s*\[\s*\{\s*googleSearch:\s*\{\}\s*\}\s*\]/);
  assert.match(chatAssistantSource, /model\.startChat\(/);
  assert.match(chatAssistantSource, /chat\.sendMessage\(/);
});

test('buildSystemInstruction declares total internet and external source access', () => {
  const instruction = buildSystemInstruction();
  assert.match(instruction, /acceso total a internet y a fuentes externas en tiempo real/i);
  assert.match(instruction, /Google Search/i);
});

test('executeWebSearch safely handles missing or empty queries', async () => {
  const res1 = await executeWebSearch('');
  assert.match(res1, /No se especificó ninguna consulta/);
  const res2 = await executeWebSearch(null);
  assert.match(res2, /No se especificó ninguna consulta/);
});

test('processGroundedResponse extracts standard text when no grounding metadata is present', () => {
  const fakeResponse = {
    text: () => 'El buque MV Atlantic Trader se encuentra actualmente en ruta a Valencia.',
    candidates: [{ content: { parts: [{ text: 'El buque MV Atlantic Trader se encuentra actualmente en ruta a Valencia.' }] } }],
  };

  const result = processGroundedResponse(fakeResponse);
  assert.equal(result.responseText, 'El buque MV Atlantic Trader se encuentra actualmente en ruta a Valencia.');
  assert.equal(result.groundingMetadata, null);
});

test('processGroundedResponse enriches response with web sources when Google Search Grounding is used', () => {
  const fakeResponse = {
    text: () => 'El operador comercial de MV Atlantic Trader es Atlantic Navigation Co.',
    candidates: [
      {
        content: { parts: [{ text: 'El operador comercial de MV Atlantic Trader es Atlantic Navigation Co.' }] },
        groundingMetadata: {
          webSearchQueries: ['MV Atlantic Trader commercial operator'],
          groundingChunks: [
            { web: { uri: 'https://maritime-registry.org/vessels/12345', title: 'Maritime Registry - Atlantic Trader' } },
            { web: { uri: 'https://atlantic-nav.com/fleet', title: 'Atlantic Navigation Fleet' } },
            { web: { uri: 'https://maritime-registry.org/vessels/12345', title: 'Duplicate Maritime Registry' } },
          ],
        },
      },
    ],
  };

  const result = processGroundedResponse(fakeResponse);
  assert.match(result.responseText, /Atlantic Navigation Co\./);
  assert.match(result.responseText, /\*\*Fuentes consultadas en tiempo real:\*\*/);
  assert.match(result.responseText, /\[Maritime Registry - Atlantic Trader\]\(https:\/\/maritime-registry\.org\/vessels\/12345\)/);
  assert.match(result.responseText, /\[Atlantic Navigation Fleet\]\(https:\/\/atlantic-nav\.com\/fleet\)/);
  assert.equal(result.groundingMetadata.webSearchQueries[0], 'MV Atlantic Trader commercial operator');
});

test('processGroundedResponse does not duplicate links already included in response body', () => {
  const existingText = 'Consulta en https://atlantic-nav.com/fleet para más detalles de flota.';
  const fakeResponse = {
    text: () => existingText,
    candidates: [
      {
        content: { parts: [{ text: existingText }] },
        groundingMetadata: {
          webSearchQueries: ['Atlantic fleet'],
          groundingChunks: [
            { web: { uri: 'https://atlantic-nav.com/fleet', title: 'Atlantic Navigation' } },
          ],
        },
      },
    ],
  };

  const result = processGroundedResponse(fakeResponse);
  assert.equal(result.responseText, existingText);
});

test('processGroundedResponse falls back gracefully when response.text() throws', () => {
  const fakeResponse = {
    text: () => {
      throw new Error('Blocked or missing text');
    },
    candidates: [
      {
        content: {
          parts: [{ text: 'Texto recuperado de los parts del candidato.' }],
        },
      },
    ],
  };

  const result = processGroundedResponse(fakeResponse);
  assert.equal(result.responseText, 'Texto recuperado de los parts del candidato.');
});
