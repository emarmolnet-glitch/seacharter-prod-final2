import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const forwarderProjectsSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');
const dbIndexSource = readFileSync(new URL('../db/index.ts', import.meta.url), 'utf8');

// ============================================================================
// BLOQUE 1: ESQUEMA DE BASE DE DATOS (ensureForwarderSchema y db/schema.ts)
// ============================================================================

test('1. ensureForwarderSchema ejecuta ALTER TABLE para valor_total_mercancia_usd y land_freight_sale', () => {
  assert.match(
    forwarderProjectsSource,
    /ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS valor_total_mercancia_usd NUMERIC;/i,
    'Debe incluir ALTER TABLE para valor_total_mercancia_usd en ensureForwarderSchema'
  );
  assert.match(
    forwarderProjectsSource,
    /ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS land_freight_sale NUMERIC;/i,
    'Debe incluir ALTER TABLE para land_freight_sale en ensureForwarderSchema'
  );
});

test('2. db/schema.ts y db/index.ts definen valor_total_mercancia_usd y land_freight_sale', () => {
  assert.match(schemaSource, /valorTotalMercanciaUsd:\s*numeric\("valor_total_mercancia_usd"\)/);
  assert.match(schemaSource, /landFreightSale:\s*numeric\("land_freight_sale"\)/);
  assert.match(dbIndexSource, /ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS valor_total_mercancia_usd NUMERIC;/i);
  assert.match(dbIndexSource, /ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS land_freight_sale NUMERIC;/i);
});

// ============================================================================
// BLOQUE 2: OPERACIONES POST (EXTRACCIÓN, INSERT, UPDATE, UPSERT)
// ============================================================================

test('3. Operaciones POST extraen valor_total_mercancia_usd y land_freight_sale del objeto data', () => {
  assert.match(
    forwarderProjectsSource,
    /const valorTotalMercanciaUsd =[\s\S]*?data\.valor_total_mercancia_usd/i,
    'POST debe extraer valor_total_mercancia_usd'
  );
  assert.match(
    forwarderProjectsSource,
    /const landFreightSale =[\s\S]*?data\.land_freight_sale/i,
    'POST debe extraer land_freight_sale'
  );
});

test('4. POST UPDATE query inyecta valor_total_mercancia_usd y land_freight_sale con parámetros posicionales', () => {
  assert.match(
    forwarderProjectsSource,
    /valor_total_mercancia_usd\s*=\s*COALESCE\(\$13,\s*valor_total_mercancia_usd\)/,
    'UPDATE en POST debe inyectar valor_total_mercancia_usd en el SET'
  );
  assert.match(
    forwarderProjectsSource,
    /land_freight_sale\s*=\s*COALESCE\(\$14,\s*land_freight_sale\)/,
    'UPDATE en POST debe inyectar land_freight_sale en el SET'
  );
});

test('5. POST INSERT y UPSERT queries inyectan valor_total_mercancia_usd y land_freight_sale', () => {
  // Query de inserción modo nuevo proyecto
  assert.match(
    forwarderProjectsSource,
    /INSERT INTO forwarder_projects \([^)]*valor_total_mercancia_usd,\s*land_freight_sale[^)]*\)[\s\S]*?VALUES \([^)]*\$7,\s*\$8\)/i,
    'INSERT y UPSERT deben incluir las columnas financieras y sus variables $7, $8'
  );
});

// ============================================================================
// BLOQUE 3: OPERACIONES PUT (EXTRACCIÓN, UPDATE, UPSERT)
// ============================================================================

test('6. Operación PUT extrae valor_total_mercancia_usd y land_freight_sale e inyecta en UPDATE y UPSERT', () => {
  const putSectionMatch = forwarderProjectsSource.match(/if \(httpMethod === 'PUT'\) \{([\s\S]*?)(?:if \(httpMethod === 'GET'\)|exports\.handler)/);
  assert.ok(putSectionMatch, 'Debe existir bloque para PUT');
  const putContent = putSectionMatch[1];

  assert.match(putContent, /data\.valor_total_mercancia_usd/i);
  assert.match(putContent, /data\.land_freight_sale/i);
  assert.match(putContent, /valor_total_mercancia_usd\s*=\s*COALESCE\(\$13,\s*valor_total_mercancia_usd\)/);
  assert.match(putContent, /land_freight_sale\s*=\s*COALESCE\(\$14,\s*land_freight_sale\)/);
  assert.match(putContent, /INSERT INTO forwarder_projects \([^)]*valor_total_mercancia_usd,\s*land_freight_sale[^)]*\)/i);
});

// ============================================================================
// BLOQUE 4: OPERACIONES GET (CONSULTAS SELECT INDIVIDUAL Y GENERAL)
// ============================================================================

test('7. Consultas SELECT en GET devuelven explícitamente valor_total_mercancia_usd y land_freight_sale', () => {
  const selectMatches = [...forwarderProjectsSource.matchAll(
    /SELECT[\s\S]*?valor_total_mercancia_usd[\s\S]*?land_freight_sale[\s\S]*?FROM\s+forwarder_projects/gi
  )];
  assert.ok(
    selectMatches.length >= 2,
    'Debe haber al menos 2 consultas SELECT (individual y general) que incluyan explícitamente valor_total_mercancia_usd y land_freight_sale'
  );
});
