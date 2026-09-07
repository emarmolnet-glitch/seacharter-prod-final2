import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');

function createHandler(sourceCode, mockGenAI) {
  const cleanCode = sourceCode
    .replace(/import\s+{\s*GoogleGenerativeAI\s*}\s+from\s+["']@google\/generative-ai["'];?/, '')
    .replace(/import\s+{\s*Buffer\s*}\s+from\s+["']node:buffer["'];?/, '')
    .replace(/export\s+default\s+handler;?/, '')
    .replace(/export\s+async\s+function\s+handler/, 'async function handler');

  const fn = new Function('GoogleGenerativeAI', 'Buffer', `${cleanCode}\nreturn handler;`);
  return fn(mockGenAI, Buffer);
}

test('project-parser: processes direct binary stream (PDF payload) correctly', async () => {
  let capturedModel = null;
  let capturedParts = null;

  class MockGenAI {
    getGenerativeModel({ model }) {
      capturedModel = model;
      return {
        generateContent: async (parts) => {
          capturedParts = parts;
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Maquinaria',
                    type: 'Grúa Móvil Telescópica Liebherr LTM 1100',
                    quantity: 1,
                    length: 14.0,
                    width: 2.75,
                    height: 4.0,
                    weight: 60000,
                    shipping_mode_supported: 'Breakbulk / Maquinaria Suelta'
                  }
                ]
              })
            }
          };
        }
      };
    }
  }

  const handler = createHandler(projectParserSource, MockGenAI);
  process.env.GEMINI_API_KEY = 'test-key-dual-binary';

  const rawPdfBuffer = Buffer.from('%PDF-1.7 binary content representation for heavy crane specifications');

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-File-Name': 'crane_specs.pdf',
    },
    body: rawPdfBuffer,
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(res.headers.get('Content-Type'), 'application/json');

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.documentMeta.name, 'crane_specs.pdf');
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].type, 'Grúa Móvil Telescópica Liebherr LTM 1100');
  assert.equal(data.items[0].weight, 60000);
  assert.equal(data.items[0].shipping_mode_supported, 'Breakbulk / Maquinaria Suelta');

  assert.equal(capturedModel, 'gemini-2.5-flash');
  assert.ok(capturedParts[1].inlineData);
  assert.equal(capturedParts[1].inlineData.mimeType, 'application/pdf');
  assert.equal(capturedParts[1].inlineData.data, rawPdfBuffer.toString('base64'));
});

test('project-parser: multilingual prompt and normalizer processes EN, FR, DE, CA, IT, PT terms', async () => {
  class MultilingualMockGenAI {
    getGenerativeModel() {
      return {
        generateContent: async (parts) => {
          // Check that prompt contains multilingual translation instructions
          const prompt = parts[0];
          assert.match(prompt, /inglés, francés, alemán, catalán, italiano, portugués/);
          assert.match(prompt, /traduce y normaliza obligatoriamente/i);

          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  // Item from German document
                  {
                    category: 'Maquinaria',
                    type: 'Pala cargadora sobre ruedas CAT 966',
                    quantity: 2,
                    length: 8.8,
                    width: 3.0,
                    height: 3.6,
                    weight: 24000,
                    shipping_mode_supported: '' // Will be deduced by contextual normalizer
                  },
                  // Item from French document
                  {
                    category: 'Vehículo',
                    type: 'Dúmper articulado Volvo A40',
                    quantity: 1,
                    length: 11.2,
                    width: 3.4,
                    height: 3.8,
                    weight: 31000,
                    shipping_mode_supported: '' // Should deduce Ro-Ro
                  },
                  // Item from Italian document
                  {
                    category: 'Mercancía Paletizada',
                    type: 'Cajas de repuestos y suministros',
                    quantity: 10,
                    length: 1.2,
                    width: 0.8,
                    height: 1.5,
                    weight: 650,
                    shipping_mode_supported: '' // Should deduce Paletizado / Suelto
                  }
                ]
              })
            }
          };
        }
      };
    }
  }

  const handler = createHandler(projectParserSource, MultilingualMockGenAI);
  process.env.GEMINI_API_KEY = 'test-key-multilingual';

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: Buffer.from('Multilingual invoice test').toString('base64'),
      fileName: 'multilingual_cargo.pdf',
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items.length, 3);

  // Verificación de deducción logística normalizada
  assert.equal(data.items[0].shipping_mode_supported, 'Breakbulk / Maquinaria Suelta');
  assert.equal(data.items[1].shipping_mode_supported, 'Ro-Ro / Vehículo Rodado');
  assert.equal(data.items[2].shipping_mode_supported, 'Paletizado / Suelto');
});

test('project-parser: cleans complex data URL base64 prefixes', async () => {
  let capturedBase64 = '';

  class MockGenAI {
    getGenerativeModel() {
      return {
        generateContent: async (parts) => {
          capturedBase64 = parts[1]?.inlineData?.data;
          return {
            response: {
              text: () => JSON.stringify({ success: true, items: [] })
            }
          };
        }
      };
    }
  }

  const handler = createHandler(projectParserSource, MockGenAI);
  process.env.GEMINI_API_KEY = 'test-key';

  const rawBytes = 'Test payload for prefix clean';
  const expectedBase64 = Buffer.from(rawBytes).toString('base64');
  const prefixedDataUrl = `data:application/pdf;base64,   ${expectedBase64}   `;

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: prefixedDataUrl,
      fileName: 'prefixed.pdf',
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(capturedBase64, expectedBase64);
});

test('project-parser: handles missing API key with native Response and 500 status', async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;

  class MockGenAI {
    getGenerativeModel() {
      return { generateContent: async () => ({}) };
    }
  }

  const handler = createHandler(projectParserSource, MockGenAI);

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: Buffer.from('test').toString('base64'),
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 500);
  assert.ok(res instanceof Response);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  const data = await res.json();
  assert.equal(data.success, false);
  assert.deepEqual(data.items, []);
  assert.ok(data.error.includes('GEMINI_API_KEY'));
});
