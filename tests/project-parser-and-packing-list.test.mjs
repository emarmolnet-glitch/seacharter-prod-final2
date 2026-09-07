import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const widgetSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');
const parsePackingListSource = readFileSync(new URL('../netlify/functions/parse-packing-list.js', import.meta.url), 'utf8');

class DefaultMockGenAI {
  getGenerativeModel() {
    return {
      generateContent: async () => ({
        response: {
          text: () => JSON.stringify({
            success: true,
            items: [
              {
                category: 'Maquinaria',
                type: 'Excavadora CAT 320',
                quantity: 1,
                length: 8.9,
                width: 2.98,
                height: 3.15,
                weight: 22500,
                shipping_mode_supported: 'Breakbulk / Maquinaria Suelta'
              }
            ]
          })
        }
      })
    };
  }
}

// Helper para instanciar el handler aislando los módulos externos
function createHandler(sourceCode, mockGenAI) {
  const cleanCode = sourceCode
    .replace(/import\s+{\s*GoogleGenerativeAI\s*}\s+from\s+["']@google\/generative-ai["'];?/, '')
    .replace(/import\s+{\s*Buffer\s*}\s+from\s+["']node:buffer["'];?/, '')
    .replace(/export\s+default\s+handler;?/, '')
    .replace(/export\s+async\s+function\s+handler/, 'async function handler');

  const fn = new Function('GoogleGenerativeAI', 'Buffer', `${cleanCode}\nreturn handler;`);
  return fn(mockGenAI || DefaultMockGenAI, Buffer);
}

const projectParserHandler = createHandler(projectParserSource);
const parsePackingListHandler = createHandler(parsePackingListSource);

// ============================================================================
// BLOQUE 1: CORRECCIÓN DE ERROR 405 Y FLUJO HTTP
// ============================================================================

test('1. project-parser handles CORS preflight OPTIONS returning 204 with complete control headers', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'OPTIONS',
  });
  const res = await projectParserHandler(req);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('OPTIONS'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Content-Type'));
  assert.equal(res.headers.get('Access-Control-Max-Age'), '86400');

  // Compatible con invocación legacy de eventos AWS/Netlify
  const eventRes = await projectParserHandler({ httpMethod: 'OPTIONS' });
  assert.equal(eventRes.status, 204);
});

test('2. parse-packing-list handles CORS preflight OPTIONS returning 204 with complete control headers', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/parse-packing-list', {
    method: 'OPTIONS',
  });
  const res = await parsePackingListHandler(req);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('OPTIONS'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Content-Type'));
});

test('3. Both functions accept exclusively POST method and reject GET, PUT, DELETE with 405', async () => {
  const testMethods = ['GET', 'PUT', 'DELETE', 'PATCH'];

  for (const method of testMethods) {
    // Test project-parser
    const reqPP = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', { method });
    const resPP = await projectParserHandler(reqPP);
    assert.equal(resPP.status, 405, `project-parser: ${method} must return 405`);
    const dataPP = await resPP.json();
    assert.equal(dataPP.error, 'Method Not Allowed');
    assert.equal(resPP.headers.get('Access-Control-Allow-Origin'), '*');

    // Test parse-packing-list
    const reqPPL = new Request('https://seacharter.netlify.app/.netlify/functions/parse-packing-list', { method });
    const resPPL = await parsePackingListHandler(reqPPL);
    assert.equal(resPPL.status, 405, `parse-packing-list: ${method} must return 405`);
    const dataPPL = await resPPL.json();
    assert.equal(dataPPL.error, 'Method Not Allowed');
    assert.equal(resPPL.headers.get('Access-Control-Allow-Origin'), '*');
  }
});

test('4. Functions reject empty or missing fileBase64 with status 400 and zero items', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64: '' }),
  });
  const res = await projectParserHandler(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.deepEqual(data.items, []);
  assert.ok(data.error.includes('Base64'));
});

// ============================================================================
// BLOQUE 2: VERIFICACIÓN DEL CLIENTE FRONTEND
// ============================================================================

test('5. AgenteProyectosWidget uses POST, application/json, and clean Base64 in fetch call', () => {
  assert.match(widgetSource, /method:\s*['"]POST['"]/);
  assert.match(widgetSource, /['"]Content-Type['"]:\s*['"]application\/json['"]/);
  assert.match(widgetSource, /cleanBase64\s*=[\s\S]*?split\(','\)\[1\]/);
  assert.match(widgetSource, /body:\s*JSON\.stringify\(\s*\{[\s\S]*?fileBase64:\s*cleanBase64/);
});

test('6. AgenteProyectosWidget has ZERO hardcoded fallback items (no fake desalination/cargo items)', () => {
  assert.ok(!widgetSource.includes("weight: '30000'"), 'Prohibido usar peso fijo 30000 en widget');
  assert.ok(!widgetSource.includes("40' Open Top"), 'Prohibido usar 40\' Open Top hardcoded en widget');
  assert.ok(!widgetSource.includes("Carga de "), 'Prohibido inventar Carga de en widget');
  assert.match(widgetSource, /formattedItems\s*=\s*\(data\.success\s*&&\s*Array\.isArray\(data\.items\)\)\s*\?\s*data\.items\s*:\s*\[\]/);
});

test('7. ForwarderWorkspace uses POST, application/json, and clean Base64 in handleFileUpload', () => {
  assert.match(workspaceSource, /const\s+cleanBase64\s*=/);
  assert.match(workspaceSource, /method:\s*['"]POST['"]/);
  assert.match(workspaceSource, /['"]Content-Type['"]:\s*['"]application\/json['"]/);
  assert.match(workspaceSource, /fileBase64:\s*cleanBase64/);
});

// ============================================================================
// BLOQUE 3: INTELIGENCIA LOGÍSTICA GEMINI 2.5 FLASH Y CERO DATOS PREGRABADOS
// ============================================================================

test('8. Function prompts enforce 3-phase filtering (Header, Body, Footer)', () => {
  for (const src of [projectParserSource, parsePackingListSource]) {
    assert.match(src, /ENCABEZADO/);
    assert.match(src, /Identifica e ignora por completo los metadatos/);
    assert.match(src, /CUERPO DEL DOCUMENTO/);
    assert.match(src, /PIE DE PÁGINA/);
    assert.match(src, /Identifica e ignora los totales globales/);
  }
});

test('9. Function prompts specify model gemini-2.5-flash and all transport modes', () => {
  for (const src of [projectParserSource, parsePackingListSource]) {
    assert.match(src, /gemini-2\.5-flash/);
    assert.match(src, /shipping_mode_supported/);
    assert.match(src, /Paletizado \/ Suelto/);
    assert.match(src, /Contenedor 20'\/40'/);
    assert.match(src, /Plataforma \/ Flat Rack/);
    assert.match(src, /Breakbulk \/ Maquinaria Suelta/);
    assert.match(src, /Ro-Ro \/ Vehículo Rodado/);
  }
});

test('10. Functions forbid averaging dimensions or unit weights across items', () => {
  for (const src of [projectParserSource, parsePackingListSource]) {
    assert.match(src, /NUNCA los promedies/);
    assert.match(src, /ESTÁ ESTRICTAMENTE PROHIBIDO unificar o promediar pesos/);
  }
});

test('11. CERO DATOS PREGRABADOS: Functions return empty list [] on error or empty documents', async () => {
  for (const src of [projectParserSource, parsePackingListSource]) {
    assert.ok(!src.includes('Bastidor Desalación'), 'Prohibido incluir bastidores desalación por defecto');
    assert.ok(!src.includes('116350'), 'Prohibido incluir pesos totales fijos');
    assert.match(src, /items:\s*\[\]/);
  }

  // Handler execution with error in AI model returns items: []
  const failingGenAI = class FailingAI {
    getGenerativeModel() {
      return {
        generateContent: async () => {
          throw new Error('Simulated Gemini API failure');
        }
      };
    }
  };
  const failingHandler = createHandler(projectParserSource, failingGenAI);
  process.env.GEMINI_API_KEY = 'test-key';
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: Buffer.from('dummy file content').toString('base64'),
      fileName: 'test.pdf'
    }),
  });
  const res = await failingHandler(req);
  assert.equal(res.status, 500);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.deepEqual(data.items, [], 'Items must be strictly [] when an error occurs, zero fake data');
});

test('12. End-to-end execution parses valid items with exact logistics properties', async () => {
  const mockGenAI = class MockGenAI {
    getGenerativeModel({ model }) {
      assert.equal(model, 'gemini-2.5-flash');
      return {
        generateContent: async (contentParts) => {
          assert.ok(contentParts.length >= 2);
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Equipos de Proceso',
                    type: 'Bastidor Ósmosis Inversa SWRO',
                    quantity: 2,
                    length: 6.0,
                    width: 2.45,
                    height: 2.6,
                    weight: 8500,
                    shipping_mode_supported: 'Breakbulk / Maquinaria Suelta'
                  },
                  {
                    category: 'Vehículo',
                    type: 'Cabeza Tractora Volvo FH16',
                    quantity: 1,
                    length: 6.8,
                    width: 2.5,
                    height: 3.8,
                    weight: 9200,
                    shipping_mode_supported: 'Ro-Ro / Vehículo Rodado'
                  }
                ]
              })
            }
          };
        }
      };
    }
  };

  const handler = createHandler(projectParserSource, mockGenAI);
  process.env.GEMINI_API_KEY = 'test-key';

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 dummy').toString('base64'),
      fileName: 'packing_list.pdf'
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items.length, 2);

  const item1 = data.items[0];
  assert.equal(item1.category, 'Equipos de Proceso');
  assert.equal(item1.type, 'Bastidor Ósmosis Inversa SWRO');
  assert.equal(item1.quantity, 2);
  assert.equal(item1.length, 6.0);
  assert.equal(item1.width, 2.45);
  assert.equal(item1.height, 2.6);
  assert.equal(item1.weight, 8500);
  assert.equal(item1.shipping_mode_supported, 'Breakbulk / Maquinaria Suelta');

  const item2 = data.items[1];
  assert.equal(item2.category, 'Vehículo');
  assert.equal(item2.shipping_mode_supported, 'Ro-Ro / Vehículo Rodado');
  assert.equal(item2.weight, 9200);
});
