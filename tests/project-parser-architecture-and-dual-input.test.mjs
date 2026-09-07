import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

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

// ----------------------------------------------------------------------------
// 1. BLINDAJE HTTP: CORS PREFLIGHT OPTIONS Y CONTROL DE MÉTODOS
// ----------------------------------------------------------------------------

test('project-parser architecture: OPTIONS returns 204 with complete CORS headers', async () => {
  const handler = createHandler(projectParserSource, class DummyAI {});
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'OPTIONS',
  });

  const res = await handler(req);
  assert.ok(res instanceof Response, 'Debe devolver un objeto Response nativo');
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('OPTIONS'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Content-Type'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Accept'));
});

test('project-parser architecture: non-POST methods are rejected with controlled 405', async () => {
  const handler = createHandler(projectParserSource, class DummyAI {});
  const forbiddenMethods = ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD'];

  for (const method of forbiddenMethods) {
    const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', { method });
    const res = await handler(req);
    assert.ok(res instanceof Response, `Método ${method} debe devolver Response nativo`);
    assert.equal(res.status, 405, `Método ${method} debe devolver 405`);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(res.headers.get('Content-Type'), 'application/json');

    const data = await res.json();
    assert.equal(data.error, 'Method Not Allowed');
  }
});

// ----------------------------------------------------------------------------
// 2. OBJETOS NATIVOS RESPONSE EN TODAS LAS SALIDAS Y BLOQUES CATCH
// ----------------------------------------------------------------------------

test('project-parser architecture: catch block returns native Response with 500 and CORS', async () => {
  class ExplodingAI {
    getGenerativeModel() {
      return {
        generateContent: async () => {
          throw new Error('Inference runtime catastrophic failure');
        },
      };
    }
  }

  const handler = createHandler(projectParserSource, ExplodingAI);
  process.env.GEMINI_API_KEY = 'test-key';

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Mover 3 transformadores de 25 toneladas',
    }),
  });

  const res = await handler(req);
  assert.ok(res instanceof Response, 'El bloque catch debe devolver un objeto Response nativo');
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(res.headers.get('Content-Type'), 'application/json');

  const data = await res.json();
  assert.equal(data.success, false);
  assert.deepEqual(data.items, []);
  assert.ok(data.error.includes('Inference runtime catastrophic failure'));
});

test('project-parser architecture: 400 bad request returns native Response with CORS', async () => {
  const handler = createHandler(projectParserSource, class DummyAI {});
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const res = await handler(req);
  assert.ok(res instanceof Response);
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(res.headers.get('Content-Type'), 'application/json');
});

// ----------------------------------------------------------------------------
// 3. LECTURA DUAL DE ENTRADA: ÓRDENES EN TEXTO PLANO DESDE EL WIDGET DE CHAT
// ----------------------------------------------------------------------------

test('project-parser dual input: processes plain text order from conversational chat widget via JSON', async () => {
  let receivedParts = null;
  class ChatOrderMockAI {
    getGenerativeModel({ model }) {
      assert.equal(model, 'gemini-2.5-flash');
      return {
        generateContent: async (parts) => {
          receivedParts = parts;
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Maquinaria / Equipos Industriales',
                    type: 'Transformador Eléctrico 50MVA',
                    quantity: 2,
                    length: 5.5,
                    width: 2.8,
                    height: 3.4,
                    weight: 35000,
                    shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
                  },
                ],
              }),
            },
          };
        },
      };
    }
  }

  const handler = createHandler(projectParserSource, ChatOrderMockAI);
  process.env.GEMINI_API_KEY = 'test-key-chat';

  // Simulación de orden de usuario enviada desde el AgenteProyectosWidget
  const chatOrderText = 'Cargar 2 transformadores eléctricos de 35000 kg para proyecto eólico';
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: chatOrderText,
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.ok(res instanceof Response);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].type, 'Transformador Eléctrico 50MVA');
  assert.equal(data.items[0].weight, 35000);

  // Verificación de que el contenido enviado al modelo contiene la orden conversacional
  assert.ok(receivedParts);
  const prompt = receivedParts[0];
  const orderContent = receivedParts[1];
  assert.ok(typeof orderContent === 'string');
  assert.ok(orderContent.includes(chatOrderText));
  assert.ok(orderContent.includes('conversacional') || prompt.includes('conversacional'));
});

test('project-parser dual input: processes plain text order sent with instruction field or direct text/plain', async () => {
  let receivedDirectText = null;
  class DirectTextMockAI {
    getGenerativeModel() {
      return {
        generateContent: async (parts) => {
          receivedDirectText = parts[1];
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Mercancía Ensacada / Dry Bulk',
                    type: 'Big Bags de Cemento',
                    quantity: 100,
                    length: 1.0,
                    width: 1.0,
                    height: 1.2,
                    weight: 1000,
                    shipping_mode_supported: 'Big Bags / Granel',
                  },
                ],
              }),
            },
          };
        },
      };
    }
  }

  const handler = createHandler(projectParserSource, DirectTextMockAI);
  process.env.GEMINI_API_KEY = 'test-key-direct-text';

  const orderString = 'Enviar 100 big bags de cemento de 1000 kg cada uno';
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: orderString,
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items[0].category, 'Mercancía Ensacada / Dry Bulk');
  assert.ok(receivedDirectText.includes(orderString));
});

// ----------------------------------------------------------------------------
// 4. LECTURA DUAL DE ENTRADA: FICHEROS ADJUNTOS OFFICE (EXCEL / WORD)
// ----------------------------------------------------------------------------

test('project-parser dual input: extracts and processes Excel spreadsheet (.xlsx)', async () => {
  let capturedOfficeContent = null;
  class ExcelMockAI {
    getGenerativeModel() {
      return {
        generateContent: async (parts) => {
          capturedOfficeContent = parts[1];
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Maquinaria / Equipos Industriales',
                    type: 'Turbina de Gas Siemens',
                    quantity: 1,
                    length: 10.5,
                    width: 3.2,
                    height: 3.6,
                    weight: 55000,
                    shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
                  },
                ],
              }),
            },
          };
        },
      };
    }
  }

  const handler = createHandler(projectParserSource, ExcelMockAI);
  process.env.GEMINI_API_KEY = 'test-key-excel';

  // Generación de un buffer Excel real (.xlsx) con SheetJS
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Item', 'Descripción', 'Cantidad', 'Dimensiones (m)', 'Peso Unitario (kg)', 'Modo Transporte'],
    ['1', 'Turbina de Gas Siemens SGT-800', '1', '10.5 x 3.2 x 3.6', '55000', 'Breakbulk'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Equipos');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const excelBase64 = excelBuffer.toString('base64');

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: excelBase64,
      fileName: 'manifest_equipos.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items[0].type, 'Turbina de Gas Siemens');
  assert.equal(data.items[0].weight, 55000);

  // Asegurar que se extrajo el contenido de la hoja Excel como texto estructurado
  assert.ok(typeof capturedOfficeContent === 'string');
  assert.ok(capturedOfficeContent.includes('Turbina de Gas Siemens'));
  assert.ok(capturedOfficeContent.includes('55000'));
});

test('project-parser dual input: extracts and processes Word document (.docx)', async () => {
  let capturedWordContent = null;
  class WordMockAI {
    getGenerativeModel() {
      return {
        generateContent: async (parts) => {
          capturedWordContent = parts[1];
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Estructura Metálica',
                    type: 'Vigas de Acero HEB 600',
                    quantity: 15,
                    length: 12.0,
                    width: 0.3,
                    height: 0.6,
                    weight: 2500,
                    shipping_mode_supported: 'Breakbulk / Maquinaria Suelta',
                  },
                ],
              }),
            },
          };
        },
      };
    }
  }

  const handler = createHandler(projectParserSource, WordMockAI);
  process.env.GEMINI_API_KEY = 'test-key-word';

  // Archivo simulado .docx
  const dummyDocxBuffer = Buffer.from('Vigas de Acero Estructural HEB 600 - Longitud 12m - Peso 2500kg');
  const docxBase64 = dummyDocxBuffer.toString('base64');

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: docxBase64,
      fileName: 'especificaciones_vigas.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items[0].type, 'Vigas de Acero HEB 600');
  assert.equal(data.items[0].category, 'Estructura Metálica');
  assert.ok(typeof capturedWordContent === 'string');
});

