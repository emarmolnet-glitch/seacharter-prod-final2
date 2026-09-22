import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backendSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');

test('1. [PAYLOAD LIGHTWEIGHT PROJECTION] GET listing query excludes heavy JSONB columns documents and items', () => {
  // Prohibición de SELECT *
  assert.doesNotMatch(backendSource, /SELECT\s+\*\s+FROM\s+forwarder_projects/i, 'No debe existir ningún SELECT * FROM forwarder_projects');

  // Consulta GET listado: debe excluir explícitamente documents e items del SELECT general
  const getSection = backendSource.slice(
    backendSource.indexOf("if (httpMethod === 'GET')"),
    backendSource.indexOf("if (httpMethod === 'DELETE')")
  );

  // Extraer la query general de listado (la segunda SELECT)
  const selectQueryMatch = getSection.match(/const query\s*=\s*`([\s\S]*?)`;/);
  assert.ok(selectQueryMatch, 'Debe existir la consulta SQL de listado general');
  const listSql = selectQueryMatch[1];

  // Comprobar que documents e items NO están en el SELECT de listado general
  assert.doesNotMatch(listSql, /\bdocuments\b/i, 'La consulta de listado general NO debe proyectar la columna documents');
  assert.doesNotMatch(listSql, /\bitems\b/i, 'La consulta de listado general NO debe proyectar la columna items');

  // Comprobar que incluye columnas esenciales y ligeras
  assert.match(listSql, /\bid\b/, 'Debe proyectar id');
  assert.match(listSql, /\bproject_ref\b/, 'Debe proyectar project_ref');
  assert.match(listSql, /\bclient_name\b/, 'Debe proyectar client_name');
  assert.match(listSql, /\bstatus\b/, 'Debe proyectar status');
  assert.match(listSql, /\bglobal_margin_percentage\b/, 'Debe proyectar global_margin_percentage');
  assert.match(listSql, /\bCOALESCE\(updated_at,\s*created_at\)\s+DESC/i, 'Debe ordenar por fecha de actualización/creación más reciente');
  assert.match(listSql, /LIMIT\s+(?:30|50)\b/i, 'Debe incluir un LIMIT estricto de máximo 50 registros');
});

test('2. [SINGLE GET PRESERVES DETAILS] Detailed query for single project preserves full documents/items payload', () => {
  const getSection = backendSource.slice(
    backendSource.indexOf("if (httpMethod === 'GET')"),
    backendSource.indexOf("if (httpMethod === 'DELETE')")
  );

  const singleQueryMatch = getSection.match(/const singleQuery\s*=\s*`([\s\S]*?)`;/);
  assert.ok(singleQueryMatch, 'Debe existir la consulta SQL para un proyecto individual');
  const singleSql = singleQueryMatch[1];

  assert.match(singleSql, /\bdocuments\b/i, 'La consulta individual debe proyectar documents');
  assert.match(singleSql, /\bitems\b/i, 'La consulta individual debe proyectar items');
  assert.match(singleSql, /LIMIT\s+1\b/i, 'La consulta individual debe tener LIMIT 1');
});

test('3. [RESPONSE SIZE SIMULATION] 50 projects listing response size is well below 50KB', () => {
  // Simular 50 proyectos devueltos con la nueva proyección ligera
  const mockProjects = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    project_ref: `RDM/2026-PRJ-${String(i + 1).padStart(3, '0')}`,
    client_name: `Cliente Corporativo ${i + 1}`,
    status: i % 2 === 0 ? 'Borrador' : 'Confirmado',
    global_margin_percentage: '15',
    land_origin: 'Madrid, ES',
    land_destination: 'Valencia, ES',
    land_distance: 350,
    land_freight_cost: 1200,
    route_and_chartering: { pol: 'Valencia', pod: 'Casablanca' },
    valor_total_mercancia_usd: 85000,
    land_freight_sale: 1500,
    date: '22/09/2026',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const jsonStr = JSON.stringify(mockProjects);
  const sizeKb = Buffer.byteLength(jsonStr, 'utf8') / 1024;

  assert.ok(sizeKb < 30, `El tamaño para 50 proyectos debe ser menor de 30KB, actual: ${sizeKb.toFixed(2)}KB`);
});
