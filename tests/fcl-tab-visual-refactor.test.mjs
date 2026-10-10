import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const fclModuleJs = fs.readFileSync(path.join(rootDir, 'fcl-module.js'), 'utf-8');

test('1. Deprecación del wizard: fcl-stepper y contenedores de pasos 1, 2 y 3 eliminados de #mm-tab-fcl', () => {
  // Localizar el contenido de #mm-tab-fcl
  const fclTabMatch = indexHtml.match(/<div\s+id="mm-tab-fcl"[\s\S]*?<\/div>\s*<\/div>\s*<!-- =+ -->\s*<!-- PESTAÑA 2: LCL/);
  assert.ok(fclTabMatch, 'Debe encontrarse el contenedor #mm-tab-fcl');
  const fclTabContent = fclTabMatch[0];

  // No debe contener el stepper ni wizard steps dentro de #mm-tab-fcl
  assert.doesNotMatch(fclTabContent, /<nav\s+class="fcl-stepper"/, 'No debe existir nav.fcl-stepper en la pestaña FCL');
  assert.doesNotMatch(fclTabContent, /data-fcl-step="1"/, 'No debe existir paso 1 del wizard');
  assert.doesNotMatch(fclTabContent, /data-fcl-step="2"/, 'No debe existir paso 2 del wizard');
  assert.doesNotMatch(fclTabContent, /data-fcl-step="3"/, 'No debe existir paso 3 del wizard');
  assert.doesNotMatch(fclTabContent, /class="[^"]*\bfcl-wizard-step\b[^"]*"/, 'No debe existir la clase fcl-wizard-step');
});

test('2. Estructura de UI clonada de LCL: bloque .fcl-overview-grid en #mm-tab-fcl', () => {
  const fclTabMatch = indexHtml.match(/<div\s+id="mm-tab-fcl"[\s\S]*?<\/div>\s*<\/div>\s*<!-- =+ -->\s*<!-- PESTAÑA 2: LCL/);
  const fclTabContent = fclTabMatch[0];

  assert.match(fclTabContent, /<div\s+class="fcl-overview-grid"/, 'Debe contener el contenedor CSS Grid .fcl-overview-grid');

  // Tarjeta 01 (Izquierda): Ruta Marítima FCL (Origen, Destino, Incoterm)
  assert.match(fclTabContent, /<span\s+class="fcl-card-label">01<\/span>/, 'Tarjeta 01 debe tener label 01');
  assert.match(fclTabContent, /<h3>Ruta Marítima FCL<\/h3>/, 'Tarjeta 01 debe tener título Ruta Marítima FCL');
  assert.match(fclTabContent, /id="fcl-pol"/, 'Tarjeta 01 debe contener input fcl-pol');
  assert.match(fclTabContent, /id="fcl-pod"/, 'Tarjeta 01 debe contener input fcl-pod');
  assert.match(fclTabContent, /id="fcl-incoterm"/, 'Tarjeta 01 debe contener selector fcl-incoterm');

  // Tarjeta 02 (Derecha): Selector de tipo de Equipo/Contenedor y cantidad
  assert.match(fclTabContent, /<span\s+class="fcl-card-label">02<\/span>/, 'Tarjeta 02 debe tener label 02');
  assert.match(fclTabContent, /<h3>Equipo y Cantidad FCL<\/h3>/, 'Tarjeta 02 debe tener título de Equipo');
  assert.match(fclTabContent, /id="fcl-equipment-rows"/, 'Tarjeta 02 debe contener el stack de equipos fcl-equipment-rows');
  assert.match(fclTabContent, /id="fcl-add-equipment"/, 'Tarjeta 02 debe contener el botón de añadir equipo');
});

test('3. Acordeón nativo (<details> y <summary>) para Ajustes Avanzados debajo de las tarjetas', () => {
  const fclTabMatch = indexHtml.match(/<div\s+id="mm-tab-fcl"[\s\S]*?<\/div>\s*<\/div>\s*<!-- =+ -->\s*<!-- PESTAÑA 2: LCL/);
  const fclTabContent = fclTabMatch[0];

  // Acordeón nativo details y summary
  assert.match(fclTabContent, /<details\s+id="fcl-advanced-details"[^>]*class="[^"]*fcl-advanced-details[^"]*"/, 'Debe existir details con clase fcl-advanced-details');
  assert.match(fclTabContent, /<summary[^>]*>/, 'Debe existir summary dentro del details');
  assert.match(fclTabContent, /Ajustes Avanzados/i, 'Summary debe titularse Ajustes Avanzados');

  // Campos secundarios dentro del acordeón
  // Días libres de Demoras
  assert.match(fclTabContent, /id="dem-free-days"/, 'Debe contener días libres dem-free-days');
  assert.match(fclTabContent, /id="dem-used-days"/, 'Debe contener días utilizados dem-used-days');

  // BAF/ETS
  assert.match(fclTabContent, /id="fcl-baf"/, 'Debe contener recargo BAF');
  assert.match(fclTabContent, /id="fcl-emissions"/, 'Debe contener recargo emisiones/ETS');

  // Módulo de Auditoría Naviera IA
  assert.match(fclTabContent, /id="carrier-offer-parse"/, 'Debe contener botón de extracción IA');
  assert.match(fclTabContent, /id="carrier-offer-file"/, 'Debe contener dropzone de archivo de carrier');
  assert.match(fclTabContent, /id="carrier-offer-lines"/, 'Debe contener tabla de líneas de oferta');
});

test('4. Ajuste JS: no hay llamadas obligatorias ni errores al buscar los pasos del antiguo wizard', () => {
  // setWizardStep adaptado para compatibilidad sin arrojar error al no encontrar wizard steps
  assert.match(indexHtml, /function\s+setWizardStep\s*\(/, 'setWizardStep debe seguir definida como fallback seguro');
  assert.match(indexHtml, /function\s+bindWizard\s*\(/, 'bindWizard debe existir sin provocar errores');

  // fcl-module.js lee cantidad de equipo dinámicamente
  assert.match(fclModuleJs, /data-equipment-qty/, 'fcl-module.js lee data-equipment-qty');
});
