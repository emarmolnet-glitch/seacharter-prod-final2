import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backendSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');
const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const agenteWidgetSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');

test('1. [SEGURIDAD Y PURGA DE PAYLOAD] sanitizeDocuments elimina dataBase64 y contenido binario', async () => {
  assert.match(backendSource, /function sanitizeDocuments/, 'Debe definir sanitizeDocuments');
  assert.match(backendSource, /function sanitizeProjectItems/, 'Debe definir sanitizeProjectItems');
  assert.match(backendSource, /function sanitizeProjectResponseRow/, 'Debe definir sanitizeProjectResponseRow');

  // Cargar dinámicamente las funciones del backend
  const mod = await import('../netlify/functions/forwarder-projects.js');
  assert.ok(typeof mod.handler === 'function');
});

test('2. [SIMULACIÓN PAYLOAD > 6MB EN POST/PUT] Documentos con Base64 masivo son sanitizados a metadatos ligeros', () => {
  // Simular una cadena base64 de 7 MB
  const fakeMassiveBase64 = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + 'A'.repeat(7 * 1024 * 1024);

  // Extraer las funciones de sanitización del backend
  const extractFn = new Function(`
    ${backendSource.slice(backendSource.indexOf('function sanitizeDocuments'), backendSource.indexOf('exports.handler'))}
    return { sanitizeDocuments, sanitizeProjectItems, sanitizeProjectResponseRow };
  `);
  const { sanitizeDocuments, sanitizeProjectItems, sanitizeProjectResponseRow } = extractFn();

  const dirtyDocuments = [
    {
      id: 'doc-1',
      name: 'Packing_List_Heavy.xlsx',
      size: '7.2 MB',
      date: '21/09/2026',
      itemsCount: 50,
      dataBase64: fakeMassiveBase64,
      payload: {
        name: 'Packing_List_Heavy.xlsx',
        size: 7500000,
        itemsCount: 50,
        dataBase64: fakeMassiveBase64
      }
    }
  ];

  const cleanDocs = sanitizeDocuments(dirtyDocuments);
  assert.equal(cleanDocs.length, 1);
  assert.equal(cleanDocs[0].name, 'Packing_List_Heavy.xlsx');
  assert.equal(cleanDocs[0].itemsCount, 50);
  assert.equal(cleanDocs[0].dataBase64, undefined, 'No debe tener dataBase64 en la raíz');
  assert.equal(cleanDocs[0].payload?.dataBase64, undefined, 'No debe tener dataBase64 en payload');

  // El tamaño del JSON del documento no debe superar 500 bytes (muy lejos de los 7 MB)
  const jsonSize = Buffer.byteLength(JSON.stringify(cleanDocs));
  assert.ok(jsonSize < 500, `El tamaño debe ser mínimo (< 500 bytes), actual: ${jsonSize} bytes`);
});

test('3. [SIMULACIÓN PAYLOAD EN ITEMS] Ítems con Base64 o fileBuffer son purgados', () => {
  const extractFn = new Function(`
    ${backendSource.slice(backendSource.indexOf('function sanitizeDocuments'), backendSource.indexOf('exports.handler'))}
    return { sanitizeDocuments, sanitizeProjectItems, sanitizeProjectResponseRow };
  `);
  const { sanitizeProjectItems } = extractFn();

  const dirtyItems = [
    {
      id: 'item-1',
      description: 'Flete y Estiba',
      cost_eur: 15000,
      fileBase64: 'B'.repeat(2 * 1024 * 1024),
      payload_data: {
        cargo_items: [{ id: 'p1', type: 'Viga', weight: 5000 }],
        fileBase64: 'C'.repeat(2 * 1024 * 1024),
        documentMeta: {
          name: 'Order.pdf',
          dataBase64: 'D'.repeat(2 * 1024 * 1024)
        }
      }
    }
  ];

  const cleanItems = sanitizeProjectItems(dirtyItems);
  assert.equal(cleanItems.length, 1);
  assert.equal(cleanItems[0].fileBase64, undefined);
  assert.equal(cleanItems[0].payload_data.fileBase64, undefined);
  assert.equal(cleanItems[0].payload_data.documentMeta.dataBase64, undefined);
  assert.equal(cleanItems[0].payload_data.cargo_items.length, 1);

  const jsonSize = Buffer.byteLength(JSON.stringify(cleanItems));
  assert.ok(jsonSize < 500, `El tamaño de ítems sanitizados debe ser < 500 bytes, actual: ${jsonSize}`);
});

test('4. [OPTIMIZACIÓN GET] Consultas GET sanean filas y descartan blobs masivos heredados', () => {
  assert.match(backendSource, /const sanitizedRows = \(result\.rows \|\| \[\]\)\.map\(sanitizeProjectResponseRow\);/, 'GET debe proyectar filas sanitizadas');
  assert.match(backendSource, /sanitizeProjectResponseRow\(singleResult\.rows\[0\]\)/, 'GET individual debe retornar fila sanitizada');
});

test('5. [FRONTEND GUARDADO LIMPIO] ForwarderWorkspace y Agente no empaquetan Base64 en documentos persistidos', () => {
  assert.doesNotMatch(forwarderComponentSource, /handleSaveDocumentToProject\(\s*\{[\s\S]*?dataBase64:\s*dataBase64/, 'handleSaveDocumentToProject no debe enviar dataBase64');
  assert.doesNotMatch(agenteWidgetSource, /documentMeta\s*=\s*\{[\s\S]*?dataBase64:\s*rawDataBase64/, 'AgenteProyectosWidget no debe persistir dataBase64 en documentMeta');
});
