import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const projectChatSource = await readFile(
  new URL('../netlify/functions/project-chat.ts', import.meta.url),
  'utf8'
);
const netlifyTomlSource = await readFile(
  new URL('../netlify.toml', import.meta.url),
  'utf8'
);

// Transpile TypeScript to valid ES module JavaScript
const transpiled = ts.transpileModule(projectChatSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

// Stub GoogleGenerativeAI to test execution in Node without live API calls
const stubbedModule = [
  `class GoogleGenerativeAI {
    constructor(apiKey, requestOptions) {
      this.apiKey = apiKey;
      this.requestOptions = requestOptions;
      GoogleGenerativeAI.lastApiKey = apiKey;
    }
    getGenerativeModel(config, requestOptions) {
      GoogleGenerativeAI.lastConfig = config;
      GoogleGenerativeAI.lastModelRequestOptions = requestOptions;
      return {
        startChat(chatConfig) {
          GoogleGenerativeAI.lastChatConfig = chatConfig;
          return {
            sendMessage: async (userMessage) => {
              GoogleGenerativeAI.lastSentMessage = userMessage;
              return {
                response: {
                  text: () => "Como consultor estratégico marítimo, el análisis del proyecto muestra viabilidad óptima.",
                  candidates: [{
                    content: { parts: [{ text: "Como consultor estratégico marítimo, el análisis del proyecto muestra viabilidad óptima." }] },
                    groundingMetadata: {
                      webSearchQueries: ["fletes marítimos actuales"],
                      groundingChunks: [{ web: { uri: "https://balticexchange.com", title: "Baltic Exchange" } }]
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
  transpiled.split('\n').filter((line) => !line.startsWith('import ')).join('\n')
].join('\n');

const {
  AGENTE_PROYECTOS_MODEL,
  buildAgenteProyectosSystemInstruction,
  formatProjectContext,
  buildGeminiHistory,
  processGroundedResponse,
  extractFileParts,
  handler,
} = await import(
  `data:text/javascript;base64,${Buffer.from(stubbedModule, 'utf8').toString('base64')}`
);

test('1. project-chat initializes gemini-2.5-flash exclusively with official googleSearch tool and no functionDeclarations', () => {
  assert.equal(AGENTE_PROYECTOS_MODEL, 'gemini-2.5-flash');
  assert.match(projectChatSource, /model:\s*AGENTE_PROYECTOS_MODEL/);
  assert.match(projectChatSource, /tools:\s*\[\s*\{\s*googleSearch:\s*\{\}\s*\}\s*\]/);
  assert.doesNotMatch(projectChatSource, /functionDeclarations/);
  assert.match(projectChatSource, /ACCIONES DE CONTROL DE FORMULARIO DEL PROYECTO/);
  assert.match(projectChatSource, /json-action/);
  assert.match(projectChatSource, /"action":\s*"update_form"/);
});

test('2. project-chat routing: netlify.toml redirects /api/project-chat and /project-chat to /.netlify/functions/project-chat', () => {
  assert.match(
    netlifyTomlSource,
    /from\s*=\s*["']\/api\/project-chat["'][\s\S]*?to\s*=\s*["']\/\.netlify\/functions\/project-chat["']/
  );
  assert.match(
    netlifyTomlSource,
    /from\s*=\s*["']\/project-chat["'][\s\S]*?to\s*=\s*["']\/\.netlify\/functions\/project-chat["']/
  );
});

test('3. buildAgenteProyectosSystemInstruction establishes strategic consultant persona and injects projectContext', () => {
  const context = JSON.stringify({
    items: [{ name: 'Turbina', weight: 80000 }],
    financials: { margin: 18 }
  });
  const prompt = buildAgenteProyectosSystemInstruction(context);

  assert.match(prompt, /consultor estratégico marítimo/);
  assert.match(prompt, /REGLA CERO - SALUDOS Y MENSAJES CASUALES/);
  assert.match(prompt, /1\. LIBERTAD ESTRATÉGICA Y CONVERSACIONAL/);
  assert.match(prompt, /2\. OPINIÓN CRÍTICA Y ASESORAMIENTO/);
  assert.match(prompt, /3\. TONO NATURAL/);
  assert.match(prompt, /Contexto actual del proyecto: \{"items":\[\{"name":"Turbina"/);
});

test('4. formatProjectContext handles object, string, or fallback properties', () => {
  const str = formatProjectContext({ projectContext: '{"test":123}' });
  assert.equal(str, '{"test":123}');

  const obj = formatProjectContext({ projectContext: { mode: 'fcl' } });
  assert.equal(obj, '{"mode":"fcl"}');

  const fallback = formatProjectContext({ items: [1], financials: { eur: 50 } });
  const parsed = JSON.parse(fallback);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.financials.eur, 50);
});

test('5. extractFileParts handles Base64 with or without data URL header', () => {
  const withHeader = {
    fileBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    fileName: 'diagram.png'
  };
  const parts1 = extractFileParts(withHeader);
  assert.ok(parts1.length >= 1);
  assert.equal(parts1[0].inlineData.mimeType, 'image/png');
  assert.ok(parts1[0].inlineData.data.startsWith('iVBORw'));

  const withoutHeader = {
    fileBase64: 'JVBERi0xLjQKJUZha2VQZGY=',
    fileName: 'plan.pdf',
    mimeType: 'application/pdf'
  };
  const parts2 = extractFileParts(withoutHeader);
  assert.ok(parts2.length >= 1);
  assert.equal(parts2[0].inlineData.mimeType, 'application/pdf');
  assert.equal(parts2[0].inlineData.data, 'JVBERi0xLjQKJUZha2VQZGY=');
});

test('6. extractFileParts returns empty array when file field is empty, null, or undefined', () => {
  assert.deepEqual(extractFileParts({}), []);
  assert.deepEqual(extractFileParts({ fileBase64: '' }), []);
  assert.deepEqual(extractFileParts({ file: null }), []);
  assert.deepEqual(extractFileParts({ attachment: undefined }), []);
});

test('7. extractFileParts decodes text/csv files into readable text for the model', () => {
  const csvContent = 'Item,Weight,Volume\nTransformador,45000,60';
  const base64Csv = Buffer.from(csvContent).toString('base64');
  const parts = extractFileParts({
    fileBase64: base64Csv,
    fileName: 'cargas.csv',
    mimeType: 'text/csv'
  });

  assert.ok(parts.length >= 1);
  assert.match(parts[0].text, /Transformador,45000,60/);
});

test('8. handler processes plain text message without attached file and returns 200', async () => {
  process.env.GEMINI_API_KEY = 'test-key-chat-1';

  const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '¿Cuál es la mejor estrategia para negociar este flete?',
      projectContext: { items: [], financials: { freight: 50000 } }
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.match(data.reply, /consultor estratégico marítimo/);
  assert.match(data.reply, /Fuentes consultadas en tiempo real/);
  assert.equal(data.intent, 'PROJECT_CONSULTANT');
});

test('9. handler processes unified message with both text and attached file and returns 200', async () => {
  process.env.GEMINI_API_KEY = 'test-key-chat-2';

  const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Analiza este croquis y confirma la sujeción de la carga',
      fileBase64: 'JVBERi0xLjQKJUZha2VQZGY=',
      fileName: 'croquis_estiba.pdf',
      mimeType: 'application/pdf',
      projectContext: { stowage: { method: 'lashing' } }
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.reply);
});

test('10. handler avoids strict file validation: runs normally when file is empty string or null', async () => {
  process.env.GEMINI_API_KEY = 'test-key-chat-3';

  const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Revisa los márgenes de beneficio',
      fileBase64: '',
      file: null,
      projectContext: '{"financials":{"margin":20}}'
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.reply);
});

test('11. handler responds to OPTIONS preflight with 200 and complete CORS headers', async () => {
  const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
    method: 'OPTIONS'
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('OPTIONS'));
});

test('12. handler rejects non-POST requests with 405 Method Not Allowed', async () => {
  const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
    method: 'GET'
  });

  const res = await handler(req);
  assert.equal(res.status, 405);
  const data = await res.json();
  assert.equal(data.error, 'Method Not Allowed');
});

test('13. handler returns 500 when no GEMINI_API_KEY is configured', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGoogle = process.env.GOOGLE_API_KEY;
  const originalGenai = process.env.GOOGLE_GENAI_API_KEY;
  const originalGateway = process.env.NETLIFY_AI_GATEWAY_KEY;

  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.NETLIFY_AI_GATEWAY_KEY;

  try {
    const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola' })
    });

    const res = await handler(req);
    assert.equal(res.status, 500);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /GEMINI_API_KEY no configurada/);
  } finally {
    if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
    if (originalGoogle !== undefined) process.env.GOOGLE_API_KEY = originalGoogle;
    if (originalGenai !== undefined) process.env.GOOGLE_GENAI_API_KEY = originalGenai;
    if (originalGateway !== undefined) process.env.NETLIFY_AI_GATEWAY_KEY = originalGateway;
  }
});

test('14. handler parses structured json-action block when model suggests form updates', async () => {
  process.env.GEMINI_API_KEY = 'test-key-chat-action';

  const simulatedText = "Excelente decisión. He configurado la ruta de Bilbao a Veracruz para 5000 MT de cemento.\\n\\n```json-action\\n{\\n  \\\"action\\\": \\\"update_form\\\",\\n  \\\"data\\\": {\\n    \\\"quantityMT\\\": 5000,\\n    \\\"portOfLoading\\\": \\\"Bilbao\\\",\\n    \\\"portOfDischarge\\\": \\\"Veracruz\\\",\\n    \\\"loadingRate\\\": 1500,\\n    \\\"dischargeRate\\\": 1200,\\n    \\\"cargoDescription\\\": \\\"Cemento en big bags\\\"\\n  }\\n}\\n```";

  const actionModule = [
    `class GoogleGenerativeAI {
      constructor(apiKey, requestOptions) {
        this.apiKey = apiKey;
      }
      getGenerativeModel(config, requestOptions) {
        return {
          startChat(chatConfig) {
            return {
              sendMessage: async () => ({
                response: {
                  text: () => "${simulatedText}",
                  candidates: [{
                    content: {
                      parts: [{
                        text: "${simulatedText}"
                      }]
                    }
                  }]
                }
              })
            };
          }
        };
      }
    }`,
    transpiled.split('\n').filter((line) => !line.startsWith('import ')).join('\n')
  ].join('\n');

  const { handler: fnHandler } = await import(
    `data:text/javascript;base64,${Buffer.from(actionModule, 'utf8').toString('base64')}`
  );

  const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Pon POL Bilbao, POD Veracruz, 5000 MT de cemento en big bags, ritmo de carga 1500 y descarga 1200',
      projectContext: {}
    })
  });

  const res = await fnHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.intent, 'UPDATE_PROJECT_FORM');
  assert.equal(data.action, 'update_form');
  assert.equal(data.payload.portOfLoading, 'Bilbao');
  assert.equal(data.payload.portOfDischarge, 'Veracruz');
  assert.equal(data.payload.quantityMT, 5000);
  assert.equal(data.payload.loadingRate, 1500);
  assert.equal(data.payload.dischargeRate, 1200);
});

test('15. Frontend AgenteProyectosWidget intercepts json-action block, extracts payload, triggers onUpdatePayload, and displays clean text', async () => {
  const widgetSource = await readFile(
    new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url),
    'utf8'
  );
  assert.match(widgetSource, /const\s+jsonActionRegex\s*=\s*\/```\(\?:json-action\|json\)\?/);
  assert.match(widgetSource, /const\s+cleanReply\s*=\s*rawReply\.replace\(jsonActionRegex,\s*['"]['"]\)\.trim\(\);/);
  assert.match(widgetSource, /setMessages\(\s*prev\s*=>\s*\[\.\.\.prev,\s*\{\s*sender:\s*['"]agent['"],\s*text:\s*userDisplayReply\s*\}\]/);
  assert.match(widgetSource, /onUpdatePayload\(\s*\{[\s\S]*?action:\s*['"]update_form['"]/);
  assert.match(widgetSource, /pol:\s*actionData\.portOfLoading/);
  assert.match(widgetSource, /pod:\s*actionData\.portOfDischarge/);
});

test('16. ForwarderWorkspace handleApplyProjectPayload consumes updateProjectForm args and updates state visually', async () => {
  const workspaceSource = await readFile(
    new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
    'utf8'
  );
  assert.match(workspaceSource, /payload\.pol\s*\|\|\s*payload\.portOfLoading/);
  assert.match(workspaceSource, /payload\.pod\s*\|\|\s*payload\.portOfDischarge/);
  assert.match(workspaceSource, /payload\.dischargingRate\s*\|\|\s*payload\.dischargeRate/);
  assert.match(workspaceSource, /payload\.cargoDescription\s*\|\|\s*payload\.quantityMT/);
  assert.match(workspaceSource, /setCargoItems\(\[newItem\]\)/);
});
