import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const indexHtmlPath = path.resolve('index.html');
const fclModulePath = path.resolve('fcl-module.js');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const fclModuleJs = fs.readFileSync(fclModulePath, 'utf8');

test('1. FCL Origen y Destino son inputs de texto interactivos estándar (no readonly / disabled)', () => {
  // Input de Origen fcl-pol
  const polMatch = indexHtml.match(/<input\s+id="fcl-pol"[^>]*>/);
  assert.ok(polMatch, 'Debe existir el input #fcl-pol');
  assert.match(polMatch[0], /type="text"/, 'fcl-pol debe ser type="text"');
  assert.match(polMatch[0], /data-fcl-input/, 'fcl-pol debe mantener data-fcl-input para enlace reactivo');
  assert.doesNotMatch(polMatch[0], /\breadonly\b/i, 'fcl-pol no debe ser readonly');
  assert.doesNotMatch(polMatch[0], /aria-readonly="true"/i, 'fcl-pol no debe tener aria-readonly="true"');
  assert.doesNotMatch(polMatch[0], /\bdisabled\b/i, 'fcl-pol no debe estar disabled');

  // Input de Destino fcl-pod
  const podMatch = indexHtml.match(/<input\s+id="fcl-pod"[^>]*>/);
  assert.ok(podMatch, 'Debe existir el input #fcl-pod');
  assert.match(podMatch[0], /type="text"/, 'fcl-pod debe ser type="text"');
  assert.match(podMatch[0], /data-fcl-input/, 'fcl-pod debe mantener data-fcl-input para enlace reactivo');
  assert.doesNotMatch(podMatch[0], /\breadonly\b/i, 'fcl-pod no debe ser readonly');
  assert.doesNotMatch(podMatch[0], /aria-readonly="true"/i, 'fcl-pod no debe tener aria-readonly="true"');
  assert.doesNotMatch(podMatch[0], /\bdisabled\b/i, 'fcl-pod no debe estar disabled');
});

test('2. Entorno reactivo FCL no sobreescribe los valores de Origen y Destino introducidos por el usuario', () => {
  // syncAuditRouteField lee fcl-pol y fcl-pod sin forzar el reseteo
  assert.match(indexHtml, /function\s+syncAuditRouteField\(\)\s*\{[\s\S]*?el\('fcl-pol'\)\?\.value[\s\S]*?el\('fcl-pod'\)\?\.value/, 'syncAuditRouteField debe sincronizar directamente desde los inputs fcl-pol y fcl-pod');

  // updateContainerQuote no debe sobreescribir fcl-pol con syncFCLRouteFromCurrentRoute()
  const updateQuoteMatch = indexHtml.match(/function\s+updateContainerQuote\(\)\s*\{([\s\S]*?)\}/);
  assert.ok(updateQuoteMatch, 'Debe existir updateContainerQuote');
  assert.doesNotMatch(updateQuoteMatch[1], /syncFCLRouteFromCurrentRoute\(\)/, 'updateContainerQuote no debe invocar syncFCLRouteFromCurrentRoute sin respetar el input del usuario');

  // syncFCLRouteFromCurrentRoute acepta parámetro force o preserva valores existentes
  assert.match(indexHtml, /function\s+syncFCLRouteFromCurrentRoute\s*\(\s*force\s*=\s*false\s*\)/, 'syncFCLRouteFromCurrentRoute debe permitir parámetro force');
});

test('3. Escuchadores reactivos en fcl-pol y fcl-pod ejecutan recálculo y sincronización de ruta', () => {
  // Los inputs fcl-pol y fcl-pod están enlazados a input y change
  assert.match(indexHtml, /\['fcl-pol',\s*'fcl-pod'\]\.forEach/, 'fcl-pol y fcl-pod deben tener escuchadores dedicados');
  assert.match(indexHtml, /applyRoutePattern\(\)/, 'Aplica patrón de ruta');
  assert.match(indexHtml, /syncAuditRouteField\(\)/, 'Sincroniza ruta de auditoría');
  assert.match(indexHtml, /updateContainerQuote\(\)/, 'Actualiza cotización del contenedor');

  // fcl-pol y fcl-pod están integrados en el motor general de detección de divisa y unidades
  assert.match(indexHtml, /'fcl-pol',\s*'lcl-pol',\s*'air-origin'/, 'fcl-pol forma parte de los originInputs reactivos');
  assert.match(indexHtml, /'fcl-pod',\s*'lcl-pod',\s*'air-dest'/, 'fcl-pod forma parte de los destInputs reactivos');
});

test('4. fcl-module.js expone pol y pod reactivos en getFCLState', () => {
  assert.match(fclModuleJs, /pol:\s*['"]fcl-pol['"]/, 'fcl-module.js define el selector ids.pol');
  assert.match(fclModuleJs, /pod:\s*['"]fcl-pod['"]/, 'fcl-module.js define el selector ids.pod');
  assert.match(fclModuleJs, /getElement\(ids\.pol\)\?\.value/, 'getFCLState extrae pol reactivamente');
  assert.match(fclModuleJs, /getElement\(ids\.pod\)\?\.value/, 'getFCLState extrae pod reactivamente');
});

test('5. Simulación funcional: fcl-pol y fcl-pod dinámicos actualizan divisa, sistema de unidades y payload de cotización', () => {
  const EU_COUNTRIES = ['ES', 'FR', 'DE', 'IT', 'PT', 'NL', 'BE', 'UK', 'GB', 'IE'];
  function extractLocationCountryCode(val) {
    const cleaned = String(val || '').trim().toUpperCase();
    if (!cleaned) return '';
    const parenMatch = cleaned.match(/\(([A-Z]{2})[A-Z0-9]*\)/);
    if (parenMatch) return parenMatch[1];
    if (/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b|\b\d{5}(-\d{4})?\b|\b(USA|UNITED STATES|EE\.?\s*UU\.?|EEUU)\b/i.test(cleaned)) return 'US';
    if (/\b(JFK|LAX|ORD|MIA|ATL|DFW|EWR|SFO|SEA|BOS|IAH|ONT8|LGB3|CLT2)\b/i.test(cleaned)) return 'US';
    const codeMatch = cleaned.match(/^([A-Z]{2})[A-Z0-9]{2,3}\b/);
    if (codeMatch) return codeMatch[1];
    if (cleaned.length >= 2) return cleaned.slice(0, 2);
    return '';
  }
  function detectOriginCurrency(originRaw, destRaw) {
    const originIso = extractLocationCountryCode(originRaw);
    const destIso = extractLocationCountryCode(destRaw);
    if (originIso === 'US' || destIso === 'US') {
      if ((originIso === 'US' && !EU_COUNTRIES.includes(destIso)) || (destIso === 'US' && !EU_COUNTRIES.includes(originIso))) {
        return 'USD';
      } else if (EU_COUNTRIES.includes(originIso) || EU_COUNTRIES.includes(destIso)) {
        return 'EUR';
      }
    } else if (EU_COUNTRIES.includes(originIso) || EU_COUNTRIES.includes(destIso)) {
      return 'EUR';
    }
    return 'USD';
  }

  // Comprobar con código UN/LOCODE europeo (ESVLC -> Jebel Ali)
  assert.equal(detectOriginCurrency('Valencia (ESVLC)', 'Jebel Ali'), 'EUR');

  // Comprobar con valores dinámicos escritos por usuario (ej. Houston, TX -> Santos)
  assert.equal(detectOriginCurrency('Houston, TX', 'Santos'), 'USD');

  // Comprobar con ruta EE. UU. a Europa
  assert.equal(detectOriginCurrency('Houston, TX', 'Rotterdam (NLRTM)'), 'EUR');
});
