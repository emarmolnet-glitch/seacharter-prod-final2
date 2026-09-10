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
  }
  globalThis.TestGoogleGenerativeAI = GoogleGenerativeAI;`,
  transpiled.split('\n').filter((line) => !line.startsWith('import ')).join('\n')
].join('\n');

const {
  AGENTE_PROYECTOS_MODEL,
  buildAgenteProyectosSystemInstruction,
  extractStructuredAction,
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
  assert.match(prompt, /REGLA DE FORMATO DE FUENTES \(BÚSQUEDA WEB\)/);
  assert.match(prompt, /NUNCA incluyas URLs crudas, enlaces HTTP, ni metadatos de redirección/);
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
  assert.doesNotMatch(data.reply, /Fuentes consultadas en tiempo real/);
  assert.doesNotMatch(data.reply, /https:\/\/balticexchange\.com/);
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

test('17. buildAgenteProyectosSystemInstruction enforces REGLA DE AUTOMATIZACIÓN DE INTERFAZ (OBLIGATORIA) and add_packing_list_item schema', () => {
  const prompt = buildAgenteProyectosSystemInstruction();
  assert.match(prompt, /REGLA DE AUTOMATIZACIÓN DE INTERFAZ \(OBLIGATORIA\):/);
  assert.match(prompt, /Si el usuario te pide añadir mercancía, dimensiones, pesos o actualizar rutas, DEBES incluir al final de tu respuesta un bloque de código JSON estándar que el sistema leerá\./);
  assert.match(prompt, /"action":\s*"add_packing_list_item"/);
  assert.match(prompt, /"type":\s*"Big Bags Cemento"/);
  assert.match(prompt, /"quantity":\s*6666/);
  assert.match(prompt, /"unitWeight":\s*1500/);
});

test('18. extractStructuredAction extracts JSON action and payload and cleans the conversational reply text', () => {
  const rawText = `He analizado tu solicitud y he agregado las piezas solicitadas a la lista de empaque.

\`\`\`json
{
  "action": "add_packing_list_item",
  "payload": {
    "category": "Mercancía General / Paletizada",
    "type": "Big Bags Cemento",
    "quantity": 6666,
    "length": 1.15,
    "width": 1.10,
    "height": 1.0,
    "unitWeight": 1500
  }
}
\`\`\``;

  const result = extractStructuredAction(rawText);
  assert.equal(result.action, 'add_packing_list_item');
  assert.equal(result.payload.type, 'Big Bags Cemento');
  assert.equal(result.payload.quantity, 6666);
  assert.equal(result.payload.length, 1.15);
  assert.equal(result.payload.width, 1.10);
  assert.equal(result.payload.height, 1.0);
  assert.equal(result.payload.unitWeight, 1500);
  assert.equal(result.cleanedText, 'He analizado tu solicitud y he agregado las piezas solicitadas a la lista de empaque.');
  assert.ok(!result.cleanedText.includes('```'));
  assert.ok(!result.cleanedText.includes('add_packing_list_item'));
});

test('19. handler processes add_packing_list_item response from model, setting action, payload, and clean reply', async () => {
  const simulatedText = `Listo, he incorporado la partida de Big Bags a tu Lista de Empaque.

\`\`\`json
{
  "action": "add_packing_list_item",
  "payload": {
    "category": "Mercancía General / Paletizada",
    "type": "Big Bags Cemento",
    "quantity": 6666,
    "length": 1.15,
    "width": 1.10,
    "height": 1.0,
    "unitWeight": 1500
  }
}
\`\`\``;

  const actionModule = [
    `function GoogleGenerativeAI() {
      return {
        getGenerativeModel: () => {
          return {
            startChat: () => {
              return {
                sendMessage: async () => {
                  return {
                    response: {
                      text: () => ${JSON.stringify(simulatedText)},
                      candidates: [{
                        content: {
                          parts: [{
                            text: ${JSON.stringify(simulatedText)}
                          }]
                        }
                      }]
                    }
                  };
                }
              };
            }
          };
        }
      };
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
      message: 'Añade 6666 Big Bags de cemento de 1500 kg',
      projectContext: {}
    })
  });

  const res = await fnHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.action, 'add_packing_list_item');
  assert.equal(data.intent, 'ADD_PACKING_LIST_ITEM');
  assert.equal(data.payload.type, 'Big Bags Cemento');
  assert.equal(data.payload.quantity, 6666);
  assert.equal(data.payload.unitWeight, 1500);
  assert.equal(data.reply, 'Listo, he incorporado la partida de Big Bags a tu Lista de Empaque.');
  assert.ok(!data.reply.includes('```'));
  assert.ok(!data.reply.includes('add_packing_list_item'));
});

test('20. Frontend AgenteProyectosWidget listens to add_packing_list_item and injects into setPackingList and onUpdatePayload', async () => {
  const widgetSource = await readFile(
    new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url),
    'utf8'
  );
  assert.match(widgetSource, /setPackingList/);
  assert.match(widgetSource, /actionType\s*===\s*['"]add_packing_list_item['"]\s*\|\|\s*data\.action\s*===\s*['"]add_packing_list_item['"]/);
  assert.match(widgetSource, /setPackingList\(prev\s*=>\s*\[\.\.\.\(Array\.isArray\(prev\)\s*\?\s*prev\s*:\s*\[\]\),\s*newPackingItem\]\)/);
  assert.match(widgetSource, /onUpdatePayload\(\s*\{[\s\S]*?action:\s*['"]add_packing_list_item['"]/);
});

test('21. ForwarderWorkspace connects setPackingList and handles add_packing_list_item in handleApplyProjectPayload', async () => {
  const workspaceSource = await readFile(
    new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
    'utf8'
  );
  assert.match(workspaceSource, /setPackingList=\{setCargoItems\}/);
  assert.match(workspaceSource, /payload\.action\s*===\s*['"]add_packing_list_item['"]/);
  assert.match(workspaceSource, /setCargoItems\(prev\s*=>/);
  assert.match(workspaceSource, /setIsCargoModalOpen\(true\)/);
});

test('22. buildAgenteProyectosSystemInstruction enforces update_route_rates schema with pol, pod, loadingRate, dischargeRate', () => {
  const prompt = buildAgenteProyectosSystemInstruction();
  assert.match(prompt, /Si el usuario pide actualizar puertos de carga\/descarga o ritmos operativos, emite este JSON al final de tu respuesta:/);
  assert.match(prompt, /"action":\s*"update_route_rates"/);
  assert.match(prompt, /"pol":\s*"Barcelona"/);
  assert.match(prompt, /"pod":\s*"Casablanca"/);
  assert.match(prompt, /"loadingRate":\s*1500/);
  assert.match(prompt, /"dischargeRate":\s*2000/);
});

test('23. extractStructuredAction extracts update_route_rates action and payload and cleans conversational reply', () => {
  const rawText = `He recalculado el flete y modificado los puertos y ritmos operativos solicitados.

\`\`\`json
{
  "action": "update_route_rates",
  "payload": {
    "pol": "Barcelona",
    "pod": "Casablanca",
    "loadingRate": 1500,
    "dischargeRate": 2000
  }
}
\`\`\``;

  const result = extractStructuredAction(rawText);
  assert.equal(result.action, 'update_route_rates');
  assert.equal(result.payload.pol, 'Barcelona');
  assert.equal(result.payload.pod, 'Casablanca');
  assert.equal(result.payload.loadingRate, 1500);
  assert.equal(result.payload.dischargeRate, 2000);
  assert.equal(result.cleanedText, 'He recalculado el flete y modificado los puertos y ritmos operativos solicitados.');
  assert.ok(!result.cleanedText.includes('```'));
  assert.ok(!result.cleanedText.includes('update_route_rates'));
});

test('24. handler processes update_route_rates response from model, setting action, intent, payload, and clean reply', async () => {
  const simulatedText = `He actualizado la ruta con carga en Barcelona y descarga en Casablanca a ritmos de 1500/2000 MT/día.

\`\`\`json
{
  "action": "update_route_rates",
  "payload": {
    "pol": "Barcelona",
    "pod": "Casablanca",
    "loadingRate": 1500,
    "dischargeRate": 2000
  }
}
\`\`\``;

  const actionModule = [
    `function GoogleGenerativeAI() {
      return {
        getGenerativeModel: () => {
          return {
            startChat: () => {
              return {
                sendMessage: async () => {
                  return {
                    response: {
                      text: () => ${JSON.stringify(simulatedText)},
                      candidates: [{
                        content: {
                          parts: [{
                            text: ${JSON.stringify(simulatedText)}
                          }]
                        }
                      }]
                    }
                  };
                }
              };
            }
          };
        }
      };
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
      message: 'Actualiza la ruta: carga Barcelona, descarga Casablanca, ritmos 1500 carga y 2000 descarga',
      projectContext: {}
    })
  });

  const res = await fnHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.action, 'update_route_rates');
  assert.equal(data.intent, 'UPDATE_ROUTE_RATES');
  assert.equal(data.payload.pol, 'Barcelona');
  assert.equal(data.payload.pod, 'Casablanca');
  assert.equal(data.payload.loadingRate, 1500);
  assert.equal(data.payload.dischargeRate, 2000);
  assert.equal(data.reply, 'He actualizado la ruta con carga en Barcelona y descarga en Casablanca a ritmos de 1500/2000 MT/día.');
  assert.ok(!data.reply.includes('```'));
  assert.ok(!data.reply.includes('update_route_rates'));
});

test('25. Frontend AgenteProyectosWidget listens to update_route_rates, extracts payload and invokes state setters and onUpdatePayload', async () => {
  const widgetSource = await readFile(
    new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url),
    'utf8'
  );
  assert.match(widgetSource, /setPol/);
  assert.match(widgetSource, /setPod/);
  assert.match(widgetSource, /setLoadingRate/);
  assert.match(widgetSource, /setDischargeRate/);
  assert.match(widgetSource, /actionType\s*===\s*['"]update_route_rates['"]\s*\|\|\s*data\.action\s*===\s*['"]update_route_rates['"]/);
  assert.match(widgetSource, /setPol\(pol\)/);
  assert.match(widgetSource, /setPod\(pod\)/);
  assert.match(widgetSource, /setLoadingRate\(loadingRate\)/);
  assert.match(widgetSource, /setDischargeRate\(dischargeRate\)/);
  assert.match(widgetSource, /onUpdatePayload\(\s*\{[\s\S]*?action:\s*['"]update_route_rates['"]/);
});

test('26. ForwarderWorkspace binds route setters to AgenteProyectosWidget and handles update_route_rates in handleApplyProjectPayload', async () => {
  const workspaceSource = await readFile(
    new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
    'utf8'
  );
  assert.match(workspaceSource, /setPol=\{setPol\}/);
  assert.match(workspaceSource, /setPod=\{setPod\}/);
  assert.match(workspaceSource, /setLoadingRate=\{setLoadingRate\}/);
  assert.match(workspaceSource, /setDischargeRate=\{setDischargingRate\}/);
  assert.match(workspaceSource, /payload\.action\s*===\s*['"]update_route_rates['"]/);
});

test('27. buildAgenteProyectosSystemInstruction enforces Multi-Actions array schema with add_packing_list_item and update_route_rates', () => {
  const prompt = buildAgenteProyectosSystemInstruction();
  assert.match(prompt, /Si el usuario pide realizar varias acciones en un mismo mensaje/);
  assert.match(prompt, /"actions":\s*\[/);
  assert.match(prompt, /"action":\s*"add_packing_list_item"/);
  assert.match(prompt, /"quantity":\s*3334/);
  assert.match(prompt, /"action":\s*"update_route_rates"/);
  assert.match(prompt, /"pod":\s*"Tampa"/);
});

test('28. extractStructuredAction extracts Multi-Actions array and cleans conversational text', () => {
  const rawText = `He añadido la partida de sacos y he actualizado la ruta del buque hacia Tampa.

\`\`\`json
{
  "actions": [
    {
      "action": "add_packing_list_item",
      "payload": {
        "category": "Mercancía General / Paletizada",
        "type": "Big Bags Cemento",
        "quantity": 3334,
        "length": 1.15,
        "width": 1.10,
        "height": 1.0,
        "unitWeight": 1500
      }
    },
    {
      "action": "update_route_rates",
      "payload": {
        "pol": "Barcelona",
        "pod": "Tampa",
        "loadingRate": 1500,
        "dischargeRate": 2000
      }
    }
  ]
}
\`\`\``;

  const result = extractStructuredAction(rawText);
  assert.ok(Array.isArray(result.actions));
  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0].action, 'add_packing_list_item');
  assert.equal(result.actions[0].payload.quantity, 3334);
  assert.equal(result.actions[1].action, 'update_route_rates');
  assert.equal(result.actions[1].payload.pod, 'Tampa');
  assert.equal(result.cleanedText, 'He añadido la partida de sacos y he actualizado la ruta del buque hacia Tampa.');
  assert.ok(!result.cleanedText.includes('```'));
  assert.ok(!result.cleanedText.includes('actions'));
});

test('29. extractStructuredAction wraps single action into actions array for backwards compatibility', () => {
  const rawText = `Actualizando ruta:
\`\`\`json
{
  "action": "update_route_rates",
  "payload": {
    "pol": "Bilbao",
    "pod": "Rotterdam"
  }
}
\`\`\``;

  const result = extractStructuredAction(rawText);
  assert.ok(Array.isArray(result.actions));
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].action, 'update_route_rates');
  assert.equal(result.actions[0].payload.pol, 'Bilbao');
  assert.equal(result.action, 'update_route_rates');
});

test('30. handler returns actions array in API response for Multi-Actions', async () => {
  const simulatedText = `Procesando orden combinada.

\`\`\`json
{
  "actions": [
    {
      "action": "add_packing_list_item",
      "payload": {
        "category": "Mercancía General / Paletizada",
        "type": "Big Bags Cemento",
        "quantity": 3334,
        "unitWeight": 1500
      }
    },
    {
      "action": "update_route_rates",
      "payload": {
        "pol": "Barcelona",
        "pod": "Tampa",
        "loadingRate": 1500,
        "dischargeRate": 2000
      }
    }
  ]
}
\`\`\``;

  const actionModule = [
    `function GoogleGenerativeAI() {
      return {
        getGenerativeModel: () => {
          return {
            startChat: () => {
              return {
                sendMessage: async () => {
                  return {
                    response: {
                      text: () => ${JSON.stringify(simulatedText)},
                      candidates: [{
                        content: {
                          parts: [{
                            text: ${JSON.stringify(simulatedText)}
                          }]
                        }
                      }]
                    }
                  };
                }
              };
            }
          };
        }
      };
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
      message: 'Añade 3334 big bags y pon ruta Barcelona a Tampa',
      projectContext: {}
    })
  });

  const res = await fnHandler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.actions));
  assert.equal(data.actions.length, 2);
  assert.equal(data.actions[0].action, 'add_packing_list_item');
  assert.equal(data.actions[1].action, 'update_route_rates');
  assert.equal(data.intent, 'MULTI_ACTIONS');
  assert.ok(!data.reply.includes('```'));
});

test('31. Frontend AgenteProyectosWidget iterates over actions array and sequentially executes state updates', async () => {
  const widgetSource = await readFile(
    new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url),
    'utf8'
  );
  assert.match(widgetSource, /actionsList\s*=\s*Array\.isArray\(data\.actions\)/);
  assert.match(widgetSource, /parsedAction\.actions\.map/);
  assert.match(widgetSource, /for\s*\(\s*const\s+singleAct\s+of\s+actionsList\s*\)/);
  assert.match(widgetSource, /setPackingList/);
  assert.match(widgetSource, /setPol\(pol\)/);
  assert.match(widgetSource, /setPod\(pod\)/);
});

test('32. processGroundedResponse extracts clean response.text() without concatenating web grounding URLs or metadata', () => {
  const fakeResponse = {
    text: () => "El flete spot de Rotterdam a Houston está en 42 USD/MT según Baltic Exchange.",
    candidates: [{
      content: { parts: [{ text: "El flete spot de Rotterdam a Houston está en 42 USD/MT según Baltic Exchange." }] },
      groundingMetadata: {
        webSearchQueries: ["Rotterdam to Houston freight rate"],
        groundingChunks: [
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123xyz", title: "Baltic Exchange" } },
          { web: { uri: "https://reuters.com/maritime/rates", title: "Reuters" } }
        ]
      }
    }]
  };

  const { responseText, groundingMetadata } = processGroundedResponse(fakeResponse);
  assert.equal(responseText, "El flete spot de Rotterdam a Houston está en 42 USD/MT según Baltic Exchange.");
  assert.doesNotMatch(responseText, /vertexaisearch/);
  assert.doesNotMatch(responseText, /https?:\/\//);
  assert.doesNotMatch(responseText, /Fuentes consultadas en tiempo real/);
  assert.ok(groundingMetadata);
  assert.equal(groundingMetadata.webSearchQueries[0], "Rotterdam to Houston freight rate");
});

test('33. handler injects REGLA DE FORMATO DE FUENTES into custom systemInstruction if missing', async () => {
  process.env.GEMINI_API_KEY = 'test-key-rule-check';

  const req = new Request('https://neon-seachartercorepro-4ce09d.netlify.app/.netlify/functions/project-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Consulta rápida de mercado',
      systemInstruction: 'Eres un asistente marítimo genérico.',
      projectContext: {}
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.match(globalThis.TestGoogleGenerativeAI.lastConfig.systemInstruction, /REGLA DE FORMATO DE FUENTES \(BÚSQUEDA WEB\)/);
  assert.match(globalThis.TestGoogleGenerativeAI.lastConfig.systemInstruction, /NUNCA incluyas URLs crudas, enlaces HTTP, ni metadatos de redirección/);
});


