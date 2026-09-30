import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getUILanguage, selectBestVoice, initSpeechVoices } from '../src/utils/speechVoiceHelper.mjs';

const chatAssistantSource = await readFile(
  new URL('../netlify/functions/chat-assistant.js', import.meta.url),
  'utf8'
);

const stubbedChatAssistant = [
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

const { buildSystemInstruction } = await import(
  `data:text/javascript;base64,${Buffer.from(stubbedChatAssistant).toString('base64')}`
);

const agenteProyectosSource = await readFile(
  new URL('../netlify/functions/agente-proyectos.js', import.meta.url),
  'utf8'
);

const stubbedAgenteProyectos = [
  'class GoogleGenerativeAI {}',
  agenteProyectosSource.split('\n').filter((line) => !line.startsWith('import ')).join('\n'),
].join('\n');

const { buildAgenteProyectosSystemInstruction } = await import(
  `data:text/javascript;base64,${Buffer.from(stubbedAgenteProyectos).toString('base64')}`
);

test('1. getUILanguage resolves standard BCP-47 tags based on UI state and fallbacks', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalDocument = globalThis.document;

  try {
    delete globalThis.window;
    assert.equal(getUILanguage(), 'es-ES');

    // Con mock de window y localStorage
    globalThis.window = {};
    globalThis.localStorage = {
      getItem: (key) => (key === 'seacharter_lang' ? 'en' : null)
    };
    assert.equal(getUILanguage(), 'en-US');

    globalThis.localStorage.getItem = (key) => (key === 'seacharter_lang' ? 'fr' : null);
    assert.equal(getUILanguage(), 'fr-FR');

    globalThis.localStorage.getItem = (key) => (key === 'seacharter_lang' ? 'es' : null);
    assert.equal(getUILanguage(), 'es-ES');

    globalThis.localStorage.getItem = (key) => (key === 'seacharter_lang' ? 'en-GB' : null);
    assert.equal(getUILanguage(), 'en-GB');

    // Con mock de DOM document.getElementById('language-selector')
    globalThis.localStorage.getItem = () => null;
    globalThis.document = {
      getElementById: (id) => (id === 'language-selector' ? { value: 'en' } : null)
    };
    assert.equal(getUILanguage(), 'en-US');
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
    globalThis.document = originalDocument;
  }
});

test('2. selectBestVoice filters voices by language and prioritizes natural/premium voices', () => {
  const mockVoices = [
    { name: 'Standard Spanish Male', lang: 'es-ES' },
    { name: 'Google Español de Estados Unidos', lang: 'es-US' },
    { name: 'Microsoft Helena Online (Natural) - Spanish', lang: 'es-ES' },
    { name: 'David Default English', lang: 'en-US' },
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Microsoft Jenny Natural - English (United States)', lang: 'en-US' },
    { name: 'Thomas Standard', lang: 'fr-FR' },
    { name: 'Denise Premium France', lang: 'fr-FR' },
    { name: 'Generic Italian', lang: 'it-IT' }
  ];

  const mockSynthesis = {
    getVoices: () => mockVoices
  };

  // 1. Para inglés: debe priorizar Google / Natural / Premium / Online
  const englishVoice = selectBestVoice(mockSynthesis, 'en-US');
  assert.ok(englishVoice);
  assert.ok(
    /Google|Natural|Premium|Online/i.test(englishVoice.name),
    `Selected voice ${englishVoice.name} must be a premium/natural voice`
  );

  // 2. Para francés: debe elegir Denise Premium France
  const frenchVoice = selectBestVoice(mockSynthesis, 'fr-FR');
  assert.ok(frenchVoice);
  assert.equal(frenchVoice.name, 'Denise Premium France');

  // 3. Para español: debe elegir una voz que contenga Google, Natural, Premium u Online
  const spanishVoice = selectBestVoice(mockSynthesis, 'es-ES');
  assert.ok(spanishVoice);
  assert.ok(
    /Google|Natural|Premium|Online/i.test(spanishVoice.name),
    `Selected voice ${spanishVoice.name} must contain Google, Natural, Premium or Online`
  );

  // 4. Fallback si no hay voz premium: debe devolver la primera voz disponible de ese idioma
  const nonPremiumMock = {
    getVoices: () => [
      { name: 'Basic Generic Voice 1', lang: 'de-DE' },
      { name: 'Basic Generic Voice 2', lang: 'de-DE' }
    ]
  };
  const germanVoice = selectBestVoice(nonPremiumMock, 'de-DE');
  assert.ok(germanVoice);
  assert.equal(germanVoice.name, 'Basic Generic Voice 1');

  // 5. Retorna null si el idioma no tiene voces disponibles
  assert.equal(selectBestVoice(nonPremiumMock, 'ja-JP'), null);
});

test('3. initSpeechVoices registers onvoiceschanged handler for asynchronous voice loading', () => {
  let changedHandler = null;
  let loadedTriggered = false;

  const mockSynthesis = {
    getVoices: () => [{ name: 'Voice 1', lang: 'en-US' }],
    set onvoiceschanged(fn) {
      changedHandler = fn;
    },
    get onvoiceschanged() {
      return changedHandler;
    }
  };

  initSpeechVoices(mockSynthesis, () => {
    loadedTriggered = true;
  });

  assert.ok(loadedTriggered, 'Initial voices should trigger callback');
  assert.ok(typeof changedHandler === 'function', 'onvoiceschanged handler must be registered');

  let asyncTriggered = false;
  initSpeechVoices(mockSynthesis, () => {
    asyncTriggered = true;
  });
  changedHandler();
  assert.ok(asyncTriggered, 'Invoking onvoiceschanged must refresh and trigger callback');
});

test('4. chat-assistant buildSystemInstruction injects the exact dynamic UI language instruction', () => {
  const enInstruction = buildSystemInstruction({}, [], 'GENERAL', 'en-US');
  assert.match(
    enInstruction,
    /IMPORTANT: The user interface is currently set to en-US\. You MUST generate your entire response strictly in en-US\. Do not use Spanish unless en-US is Spanish\./
  );

  const frInstruction = buildSystemInstruction({}, [], 'GENERAL', 'fr-FR');
  assert.match(
    frInstruction,
    /IMPORTANT: The user interface is currently set to fr-FR\. You MUST generate your entire response strictly in fr-FR\. Do not use Spanish unless fr-FR is Spanish\./
  );

  const esInstruction = buildSystemInstruction({}, [], 'GENERAL', 'es-ES');
  assert.match(
    esInstruction,
    /IMPORTANT: The user interface is currently set to es-ES\. You MUST generate your entire response strictly in es-ES\. Do not use Spanish unless es-ES is Spanish\./
  );

  // Contexto con uiLanguage sin parámetro directo
  const contextInstruction = buildSystemInstruction({ uiLanguage: 'de-DE' }, [], 'GENERAL');
  assert.match(
    contextInstruction,
    /IMPORTANT: The user interface is currently set to de-DE\. You MUST generate your entire response strictly in de-DE\. Do not use Spanish unless de-DE is Spanish\./
  );
});

test('5. agente-proyectos buildAgenteProyectosSystemInstruction injects the exact dynamic UI language instruction', () => {
  const enPrompt = buildAgenteProyectosSystemInstruction('{}', 'en-US');
  assert.match(
    enPrompt,
    /IMPORTANT: The user interface is currently set to en-US\. You MUST generate your entire response strictly in en-US\. Do not use Spanish unless en-US is Spanish\./
  );

  const frPrompt = buildAgenteProyectosSystemInstruction('{}', 'fr-FR');
  assert.match(
    frPrompt,
    /IMPORTANT: The user interface is currently set to fr-FR\. You MUST generate your entire response strictly in fr-FR\. Do not use Spanish unless fr-FR is Spanish\./
  );
});

test('6. Frontend source codes correctly bind uiLanguage to payloads and speech utterance', async () => {
  const seaAssistantSource = await readFile(new URL('/opt/build/repo/src/sea-assistant-entry.js', import.meta.url), 'utf8');
  const agenteWidgetSource = await readFile(new URL('/opt/build/repo/src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');

  // Sea Assistant Entry
  assert.match(seaAssistantSource, /const uiLanguage = getUILanguage\(\);/);
  assert.match(seaAssistantSource, /sanitizedPayload\.uiLanguage = uiLanguage;/);
  assert.match(seaAssistantSource, /utterance\.lang = uiLang;/);
  assert.match(seaAssistantSource, /const selectedVoice = selectBestVoice\(speechSynthesis, uiLang\);/);
  assert.match(seaAssistantSource, /utterance\.voice = selectedVoice;/);
  assert.match(seaAssistantSource, /initSpeechVoices\(speechSynthesis\);/);

  // Agente Proyectos Widget
  assert.match(agenteWidgetSource, /const uiLanguage = getUILanguage\(\);/);
  assert.match(agenteWidgetSource, /IMPORTANT: The user interface is currently set to \$\{uiLanguage\}/);
  assert.match(agenteWidgetSource, /utterance\.lang = uiLang;/);
  assert.match(agenteWidgetSource, /const selectedVoice = selectBestVoice\(window\.speechSynthesis, uiLang\);/);
  assert.match(agenteWidgetSource, /utterance\.voice = selectedVoice;/);
  assert.match(agenteWidgetSource, /initSpeechVoices\(window\.speechSynthesis\);/);
});
