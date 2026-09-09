import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agenteProyectosSource = await readFile(
  new URL('../netlify/functions/agente-proyectos.js', import.meta.url),
  'utf8'
);

const stubbedModule = [
  `class GoogleGenerativeAI {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }
    getGenerativeModel(config) {
      GoogleGenerativeAI.lastConfig = config;
      return {
        startChat(chatConfig) {
          GoogleGenerativeAI.lastChatConfig = chatConfig;
          return {
            sendMessage: async (userMessage) => {
              GoogleGenerativeAI.lastSentMessage = userMessage;
              return {
                response: {
                  text: () => "¡Hola! ¿En qué puedo colaborar hoy en tu proyecto marítimo?",
                  candidates: [{
                    content: { parts: [{ text: "¡Hola! ¿En qué puedo colaborar hoy en tu proyecto marítimo?" }] },
                    groundingMetadata: {
                      webSearchQueries: ["SeaCharter Core PRO"],
                      groundingChunks: [{ web: { uri: "https://seacharter.com", title: "SeaCharter" } }]
                    }
                  }]
                }
              };
            }
          };
        }
      };
    }
  }`,
  agenteProyectosSource.split('\n').filter((line) => !line.startsWith('import ')).join('\n'),
].join('\n');

const {
  AGENTE_PROYECTOS_MODEL,
  buildAgenteProyectosSystemInstruction,
  formatProjectContext,
  buildGeminiHistory,
  processGroundedResponse,
  handler,
} = await import(
  `data:text/javascript;base64,${Buffer.from(stubbedModule, 'utf8').toString('base64')}`
);

test('1. Backend initializes strictly gemini-2.5-flash with official googleSearch tool and native startChat', () => {
  assert.equal(AGENTE_PROYECTOS_MODEL, 'gemini-2.5-flash');
  assert.match(agenteProyectosSource, /import\s*\{\s*GoogleGenerativeAI\s*\}\s*from\s*["']@google\/generative-ai["']/);
  assert.match(agenteProyectosSource, /model:\s*["']gemini-2\.5-flash["']/);
  assert.match(agenteProyectosSource, /tools:\s*\[\s*\{\s*googleSearch:\s*\{\}\s*\}\s*\]/);
  assert.match(agenteProyectosSource, /model\.startChat\(/);
  assert.match(agenteProyectosSource, /chat\.sendMessage\(/);
});

test('2. buildAgenteProyectosSystemInstruction includes REGLA CERO, behavioral rules, and live projectContext injection', () => {
  const sampleContext = JSON.stringify({
    items: [{ type: 'Transformador', weight: 45000 }],
    financials: { oceanFreight: 35000 },
    stowage: { executiveJustification: 'Estiba en crujía sobre tanktop reforzado' }
  });

  const prompt = buildAgenteProyectosSystemInstruction(sampleContext);

  assert.match(prompt, /Eres el Agente de Proyectos de SeaCharter Core PRO, impulsado por Gemini\./);
  assert.match(prompt, /Eres un consultor estratégico marítimo y un socio conversacional altamente inteligente\./);
  assert.match(prompt, /REGLA CERO - SALUDOS Y MENSAJES CASUALES:/);
  assert.match(prompt, /¡PROHIBIDO! No escupas desgloses financieros, costes ni datos del JSON/);
  assert.match(prompt, /1\. LIBERTAD ESTRATÉGICA Y CONVERSACIONAL:/);
  assert.match(prompt, /buscar cualquier dato en la web en tiempo real/);
  assert.match(prompt, /2\. OPINIÓN CRÍTICA Y ASESORAMIENTO:/);
  assert.match(prompt, /cruza la información con la web si es necesario, y da tu recomendación profesional como un bróker senior\./);
  assert.match(prompt, /3\. TONO NATURAL:/);
  assert.match(prompt, /CONTEXTO EN VIVO DEL PROYECTO \(USO INTERNO\):/);
  assert.match(prompt, /NUNCA expongas el JSON crudo en tu respuesta\./);
  assert.match(prompt, /Contexto actual del proyecto: \{"items":\[\{"type":"Transformador"/);
});

test('3. formatProjectContext correctly serializes string or structured object payloads', () => {
  const fromString = formatProjectContext({ projectContext: '{"custom":"data"}' });
  assert.equal(fromString, '{"custom":"data"}');

  const fromObject = formatProjectContext({
    items: [{ id: 1 }],
    financialBreakdown: { total: 1000 },
    stowagePlan: { holds: 4 }
  });
  const parsed = JSON.parse(fromObject);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.financials.total, 1000);
  assert.equal(parsed.stowage.holds, 4);
});

test('4. buildGeminiHistory normalizes conversational messages to alternating user/model roles', () => {
  const rawHistory = [
    { sender: 'user', text: 'Hola' },
    { sender: 'agent', text: '¡Hola! ¿En qué puedo ayudarte hoy?' },
    { sender: 'user', text: '¿Qué opinas de la estiba?' }
  ];

  const geminiHistory = buildGeminiHistory(rawHistory);
  // Last user turn is popped so chat.sendMessage can send the active user turn
  assert.equal(geminiHistory.length, 2);
  assert.equal(geminiHistory[0].role, 'user');
  assert.equal(geminiHistory[0].parts[0].text, 'Hola');
  assert.equal(geminiHistory[1].role, 'model');
  assert.equal(geminiHistory[1].parts[0].text, '¡Hola! ¿En qué puedo ayudarte hoy?');
});

test('5. processGroundedResponse extracts text and formats web search grounding sources', () => {
  const fakeResponse = {
    text: () => 'El precio medio del fueloil VLSFO en Rotterdam ronda los 560 USD/MT hoy.',
    candidates: [
      {
        content: { parts: [{ text: 'El precio medio del fueloil VLSFO en Rotterdam ronda los 560 USD/MT hoy.' }] },
        groundingMetadata: {
          webSearchQueries: ['Rotterdam VLSFO bunker price today'],
          groundingChunks: [
            { web: { uri: 'https://shipandbunker.com/prices/emea/nwe/nl-rtm-rotterdam', title: 'Ship & Bunker Rotterdam Prices' } },
            { web: { uri: 'https://bunkerindex.com/prices/rotterdam', title: 'Bunker Index - Rotterdam' } }
          ]
        }
      }
    ]
  };

  const { responseText, groundingMetadata } = processGroundedResponse(fakeResponse);
  assert.match(responseText, /560 USD\/MT/);
  assert.match(responseText, /Fuentes consultadas en tiempo real:/);
  assert.match(responseText, /Ship & Bunker Rotterdam Prices/);
  assert.match(responseText, /https:\/\/shipandbunker\.com/);
  assert.ok(groundingMetadata);
  assert.equal(groundingMetadata.webSearchQueries[0], 'Rotterdam VLSFO bunker price today');
});

test('6. processGroundedResponse avoids duplicate web sources if already present in body', () => {
  const uri = 'https://shipandbunker.com/prices';
  const fakeResponse = {
    text: () => `Datos de precios obtenidos de [Ship & Bunker](${uri}).`,
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            { web: { uri, title: 'Ship & Bunker' } }
          ]
        }
      }
    ]
  };

  const { responseText } = processGroundedResponse(fakeResponse);
  assert.doesNotMatch(responseText, /Fuentes consultadas en tiempo real:/);
});

test('7. handler responds to OPTIONS with 200 and CORS headers', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/agente-proyectos', {
    method: 'OPTIONS'
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('8. handler enforces route-guard if a different active module is requested without project mode', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/agente-proyectos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modulo: 'calculadora',
      isProjectMode: false,
      message: 'Hola'
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.reply, /solo opera dentro del módulo de proyectos/i);
});

test('9. handler processes conversational request using model.startChat and sendMessage', async () => {
  process.env.GEMINI_API_KEY = 'test-fake-key-123';

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/agente-proyectos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modulo: 'proyectos',
      isProjectMode: true,
      message: 'Hola, buenos días',
      projectContext: { items: [], financials: {}, stowage: {} },
      history: [
        { sender: 'user', text: 'Inicio de sesión' },
        { sender: 'agent', text: 'Bienvenido' }
      ]
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.match(data.reply, /¡Hola!/);
  assert.ok(data.groundingMetadata);
});

test('10. handler returns 500 when GEMINI_API_KEY is not configured', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGoogle = process.env.GOOGLE_API_KEY;
  const originalGenai = process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;

  try {
    const req = new Request('https://seacharter.netlify.app/.netlify/functions/agente-proyectos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isProjectMode: true,
        message: 'Hola'
      })
    });

    const res = await handler(req);
    assert.equal(res.status, 500);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /GEMINI_API_KEY no configurada/i);
  } finally {
    if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
    if (originalGoogle !== undefined) process.env.GOOGLE_API_KEY = originalGoogle;
    if (originalGenai !== undefined) process.env.GOOGLE_GENAI_API_KEY = originalGenai;
  }
});
