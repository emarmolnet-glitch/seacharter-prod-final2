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
  return fn(mockGenAI || class DummyAI {}, Buffer);
}

// Generador de buffer DOCX mínimo y válido usando jszip (dependencia de mammoth)
async function createValidDocxBuffer(textContent) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>'
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    '<w:p><w:r><w:t>' + textContent + '</w:t></w:r></w:p>' +
    '</w:body>' +
    '</w:document>'
  );
  return await zip.generateAsync({ type: 'nodebuffer' });
}

// Generador de buffer XLSX con SheetJS
function createValidXlsxBuffer(sheetName, rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('extractTextFromSpreadsheet successfully extracts clean CSV text from XLSX workbook', async () => {
  const handler = createHandler(projectParserSource);
  assert.equal(typeof handler.extractTextFromSpreadsheet, 'function');

  const rows = [
    ['Item', 'Descripcion', 'Cantidad', 'Peso Unitario (kg)', 'Modo Transporte'],
    ['1', 'Modulo Habitacional Offshore', '2', '28000', 'Breakbulk / Maquinaria Suelta'],
    ['2', 'Generador Diesel Caterpillar', '1', '14500', 'Breakbulk / Maquinaria Suelta']
  ];
  const xlsxBuf = createValidXlsxBuffer('Manifiesto_Carga', rows);

  const extractedText = await handler.extractTextFromSpreadsheet(xlsxBuf);
  assert.ok(typeof extractedText === 'string');
  assert.ok(extractedText.includes('[Hoja Excel: Manifiesto_Carga]'));
  assert.ok(extractedText.includes('Modulo Habitacional Offshore'));
  assert.ok(extractedText.includes('28000'));
  assert.ok(extractedText.includes('Generador Diesel Caterpillar'));
});

test('extractTextFromWord successfully extracts clean text from valid DOCX document', async () => {
  const handler = createHandler(projectParserSource);
  assert.equal(typeof handler.extractTextFromWord, 'function');

  const rawText = 'Especificaciones de embarque: 4 transformadores de potencia 65000 kg para proyecto fotovoltaico.';
  const docxBuf = await createValidDocxBuffer(rawText);

  const extractedText = await handler.extractTextFromWord(docxBuf);
  assert.ok(typeof extractedText === 'string');
  assert.ok(extractedText.includes('Especificaciones de embarque'));
  assert.ok(extractedText.includes('transformadores de potencia'));
  assert.ok(extractedText.includes('65000 kg'));
});

test('HTTP handler end-to-end: extracts XLSX spreadsheet and passes clean text to Gemini without raw binary bytes', async () => {
  let capturedModel = '';
  let capturedContentParts = null;

  class MockGeminiAI {
    getGenerativeModel({ model }) {
      capturedModel = model;
      return {
        generateContent: async (parts) => {
          capturedContentParts = parts;
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Maquinaria / Equipos Industriales',
                    type: 'Modulo Habitacional Offshore',
                    quantity: 2,
                    length: 12.0,
                    width: 3.5,
                    height: 3.2,
                    weight: 28000,
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

  const handler = createHandler(projectParserSource, MockGeminiAI);
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  const rows = [
    ['Item', 'Descripcion', 'Cantidad', 'Largo (m)', 'Ancho (m)', 'Alto (m)', 'Peso (kg)', 'Modo'],
    ['1', 'Modulo Habitacional Offshore', '2', '12', '3.5', '3.2', '28000', 'Breakbulk']
  ];
  const xlsxBuf = createValidXlsxBuffer('Carga_Proyecto', rows);
  const base64 = xlsxBuf.toString('base64');

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: base64,
      fileName: 'lista_empaque_equipos.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].type, 'Modulo Habitacional Offshore');
  assert.equal(data.items[0].weight, 28000);

  // Verificar que el modelo usado fue estrictamente gemini-2.5-flash
  assert.equal(capturedModel, 'gemini-2.5-flash');

  // Verificar que contentParts contiene texto limpio y NO inlineData binario
  assert.equal(capturedContentParts.length, 2);
  const promptPart = capturedContentParts[0];
  const textContentPart = capturedContentParts[1];
  assert.ok(typeof promptPart === 'string');
  assert.ok(typeof textContentPart === 'string');
  assert.ok(textContentPart.includes('Contenido de la hoja de cálculo de carga (lista_empaque_equipos.xlsx):'));
  assert.ok(textContentPart.includes('[Hoja Excel: Carga_Proyecto]'));
  assert.ok(textContentPart.includes('Modulo Habitacional Offshore'));
  // No debe haber bytes de archivo ZIP/PK binarios
  assert.ok(!textContentPart.startsWith('PK\x03\x04'));
});

test('HTTP handler end-to-end: extracts DOCX document and passes clean text to Gemini without raw binary bytes', async () => {
  let capturedModel = '';
  let capturedContentParts = null;

  class MockGeminiAI {
    getGenerativeModel({ model }) {
      capturedModel = model;
      return {
        generateContent: async (parts) => {
          capturedContentParts = parts;
          return {
            response: {
              text: () => JSON.stringify({
                success: true,
                items: [
                  {
                    category: 'Maquinaria / Equipos Industriales',
                    type: 'Transformador de Potencia 65MVA',
                    quantity: 4,
                    length: 6.5,
                    width: 3.2,
                    height: 3.8,
                    weight: 65000,
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

  const handler = createHandler(projectParserSource, MockGeminiAI);
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  const docText = 'Orden de embarque: 4 transformadores de potencia 65MVA con peso unitario 65000 kg para planta solar.';
  const docxBuf = await createValidDocxBuffer(docText);
  const base64 = docxBuf.toString('base64');

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: base64,
      fileName: 'orden_embarque.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].type, 'Transformador de Potencia 65MVA');

  // Verificar que el modelo usado fue estrictamente gemini-2.5-flash
  assert.equal(capturedModel, 'gemini-2.5-flash');

  // Verificar que contentParts contiene texto limpio y NO inlineData binario
  assert.equal(capturedContentParts.length, 2);
  const textContentPart = capturedContentParts[1];
  assert.ok(typeof textContentPart === 'string');
  assert.ok(textContentPart.includes('Contenido del documento Word de carga (orden_embarque.docx):'));
  assert.ok(textContentPart.includes(docText));
  assert.ok(!textContentPart.startsWith('PK\x03\x04'));
});
