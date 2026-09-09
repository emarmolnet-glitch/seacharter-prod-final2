import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');
const forwarderProjectsSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');

function createProjectParserHandler(sourceCode) {
  class MockGenAI {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: {
            text: () => JSON.stringify({ success: true, items: [] })
          }
        })
      };
    }
  }

  const cleanCode = sourceCode
    .replace(/import\s+{\s*GoogleGenerativeAI\s*}\s+from\s+["']@google\/generative-ai["'];?/, '')
    .replace(/import\s+{\s*Buffer\s*}\s+from\s+["']node:buffer["'];?/, '')
    .replace(/export\s+default\s+handler;?/, '')
    .replace(/export\s+async\s+function\s+handler/, 'async function handler');

  const fn = new Function('GoogleGenerativeAI', 'Buffer', `${cleanCode}\nreturn handler;`);
  return fn(MockGenAI, Buffer);
}

// ============================================================================
// BLOQUE 1: VERIFICACIÓN DE PROJECT-PARSER.JS
// ============================================================================

test('1. project-parser.js prompt defines and demands operational parameters (pol, pod, loadingRate, dischargingRate)', () => {
  // Exige la extracción de parámetros operativos en las instrucciones del prompt
  assert.match(projectParserSource, /EXTRACCI[ÓO]N DIRECTA DE PAR[ÁA]METROS OPERATIVOS/i);
  assert.match(projectParserSource, /pol:.*Puerto de origen/i);
  assert.match(projectParserSource, /pod:.*Puerto de destino/i);
  assert.match(projectParserSource, /loadingRate:.*Ritmo operativo de carga/i);
  assert.match(projectParserSource, /dischargingRate:.*Ritmo operativo de descarga/i);

  // Esquema JSON esperado en el prompt incluye explícitamente pol, pod, loadingRate y dischargingRate
  assert.match(projectParserSource, /"pol":\s*"[^"]+"/);
  assert.match(projectParserSource, /"pod":\s*"[^"]+"/);
  assert.match(projectParserSource, /"loadingRate":\s*\d+/);
  assert.match(projectParserSource, /"dischargingRate":\s*\d+/);
});

test('2. project-parser.js parseOperationalRate supports plurals (ritmos, tasas, rates) and flexible phrasing', () => {
  const handler = createProjectParserHandler(projectParserSource);
  const parseRate = handler.parseOperationalRate;

  assert.equal(typeof parseRate, 'function', 'parseOperationalRate must be exported on handler');

  // Pruebas con plural "ritmos"
  assert.equal(parseRate('ritmos de carga 1500', 'load'), 1500);
  assert.equal(parseRate('ritmos carga: 1600 mt/dia', 'load'), 1600);
  assert.equal(parseRate('ritmos de descarga 1200', 'discharge'), 1200);
  assert.equal(parseRate('ritmos descarga: 1400', 'discharge'), 1400);

  // Pruebas con "ritmos: carga 1800, descarga 1300"
  assert.equal(parseRate('ritmos: carga 1800, descarga 1300', 'load'), 1800);
  assert.equal(parseRate('ritmos: carga 1800, descarga 1300', 'discharge'), 1300);

  // Pruebas con "ritmos 2000 / 1500" o "ritmos: 2000 / 1500"
  assert.equal(parseRate('ritmos: 2000 / 1500', 'load'), 2000);
  assert.equal(parseRate('ritmos: 2000 / 1500', 'discharge'), 1500);

  // Pruebas con números y unidades flexibles
  assert.equal(parseRate('1750 t/d de carga', 'load'), 1750);
  assert.equal(parseRate('1100 mt/d de descarga', 'discharge'), 1100);
  assert.equal(parseRate('tasas de carga de 2200 t/dia', 'load'), 2200);
  assert.equal(parseRate('loading rates: 2500', 'load'), 2500);
  assert.equal(parseRate('discharging rates: 1900', 'discharge'), 1900);
});

test('3. project-parser.js does not block POL/POD extraction when using plurals like "ritmos"', () => {
  // Regex lookaheads and sanitization must allow "ritmos" without blocking
  assert.match(projectParserSource, /\\britmos\?\\b/);
  assert.match(projectParserSource, /'ritmos'/);
});

// ============================================================================
// BLOQUE 2: VERIFICACIÓN DE FORWARDER-PROJECTS.JS
// ============================================================================

test('4. forwarder-projects.js defines CORS headers and handles OPTIONS preflight returning 204', async () => {
  assert.match(forwarderProjectsSource, /'Access-Control-Allow-Origin':\s*'\*'/);
  assert.match(forwarderProjectsSource, /'Access-Control-Allow-Methods':/);
  assert.match(forwarderProjectsSource, /httpMethod === ['"]OPTIONS['"]/);
  assert.match(forwarderProjectsSource, /statusCode:\s*204/);

  // Simular llamada OPTIONS
  const mod = await import('../netlify/functions/forwarder-projects.js');
  const handler = mod.handler || mod.default;

  const res = await handler({ httpMethod: 'OPTIONS' });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(res.body, '');
});

test('5. forwarder-projects.js INSERT query explicitly saves status and global_margin_percentage from payload', () => {
  // En MODO CREACIÓN (INSERT), se leen status y global_margin_percentage del payload
  assert.match(forwarderProjectsSource, /const\s*\{\s*client_name[^}]*status[^}]*global_margin_percentage[^}]*\}\s*=\s*data/);

  // La consulta INSERT incluye status y global_margin_percentage con parámetros posicionales
  assert.match(forwarderProjectsSource, /INSERT INTO forwarder_projects\s*\(\s*project_ref,\s*client_name,\s*status,\s*global_margin_percentage,\s*documents,\s*items\s*\)\s*VALUES\s*\(\s*\$1,\s*\$2,\s*\$3,\s*\$4,\s*\$5::jsonb,\s*\$6::jsonb\s*\)/i);
});

test('6. forwarder-projects.js UPDATE queries explicitly save status and global_margin_percentage from payload', () => {
  // En MODO ACTUALIZACIÓN (POST y PUT), se actualizan explícitamente status y global_margin_percentage
  const updateMatches = [...forwarderProjectsSource.matchAll(/UPDATE forwarder_projects[\s\S]*?status\s*=\s*COALESCE\(\$6,\s*status\)[\s\S]*?global_margin_percentage\s*=\s*COALESCE\(\$7,\s*global_margin_percentage\)[\s\S]*?WHERE\s+id\s*=\s*\$4\s+OR\s+project_ref\s*=\s*\$5/gi)];
  assert.ok(updateMatches.length >= 2, 'Debe haber consultas UPDATE tanto para POST como para PUT que preserven y guarden status y margen');
});
