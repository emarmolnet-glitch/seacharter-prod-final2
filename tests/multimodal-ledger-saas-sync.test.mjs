import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const fclModuleJs = fs.readFileSync(path.join(rootDir, 'fcl-module.js'), 'utf-8');
const databridgeHtml = fs.readFileSync(path.join(rootDir, 'public/databridge.html'), 'utf-8');
const schemaTs = fs.readFileSync(path.join(rootDir, 'db/schema.ts'), 'utf-8');
const fnMultimodalSync = fs.readFileSync(path.join(rootDir, 'netlify/functions/multimodal-sync.ts'), 'utf-8');

test('1. Botón "Sincronizar Data Bridge" está configurado con handleSyncDataBridge sin alterar el diseño UI', () => {
  // Localizar el botón en index.html
  assert.match(indexHtml, /id="btn-sync-databridge-quote"/, 'El botón btn-sync-databridge-quote debe existir en el panel Quick Quote');
  assert.match(indexHtml, /onclick="handleSyncDataBridge\(\)"/, 'El evento onclick debe llamar a handleSyncDataBridge()');
  assert.match(indexHtml, /Sincronizar Data Bridge/, 'El texto descriptivo inicial debe mantenerse intacto');

  // Preservación estricta de clases UI corporativas del botón
  assert.match(indexHtml, /class="[^"]*sc-button secondary[^"]*bg-sky-50[^"]*text-sky-700[^"]*"/, 'El botón debe preservar su estilo original sin romper el diseño UI');
});

test('2. Definición y disponibilidad de handleSyncDataBridge en index.html y fcl-module.js', () => {
  assert.match(indexHtml, /async\s+function\s+handleSyncDataBridge\s*\(/, 'index.html debe implementar la función handleSyncDataBridge');
  assert.match(indexHtml, /window\.handleSyncDataBridge\s*=\s*handleSyncDataBridge/, 'handleSyncDataBridge debe estar expuesta en window');
  assert.match(fclModuleJs, /handleSyncDataBridge/, 'fcl-module.js debe exponer handleSyncDataBridge');
});

test('3. handleSyncDataBridge extrae el estado completo de la cotización: modalidad, costes y fee estándar de $50', () => {
  // Modalidad (active tab)
  assert.match(indexHtml, /activeBtn\?\.getAttribute\(['"]data-multimodal-tab['"]\)/, 'Debe detectar el tab activo actual');
  assert.match(indexHtml, /FCL Marítimo/, 'Debe mapear la modalidad FCL Marítimo');

  // Venta agencia (total Quick Quote)
  assert.match(indexHtml, /quickQuoteTotal/, 'Debe capturar el total de venta de Quick Quote');

  // Coste API (coste base antes del margen o simulado descontando margen)
  assert.match(indexHtml, /baseCost/, 'Debe calcular el coste base antes del margen');
  assert.match(indexHtml, /quickQuoteTotal\s*\/\s*1\.15/, 'Debe simular el coste base restando el margen comercial si no está disponible');

  // Fee plataforma SaaS fijado en 50.00
  assert.match(indexHtml, /fee_plataforma:\s*50\.00/, 'Debe fijar el fee de plataforma SaaS en 50.00');

  // Referencia temporal y estado Cotizado
  assert.match(indexHtml, /referencia:\s*`RDM-MM-\${Math\.floor\(Math\.random\(\)\s*\*\s*10000\)}`/, 'Debe autogenerar referencia con patrón RDM-MM-XXXX');
  assert.match(indexHtml, /estado:\s*['"]Cotizado['"]/, 'El estado debe ser Cotizado');
});

test('4. Envío de datos vía fetch POST al endpoint /api/multimodal/sync', () => {
  assert.match(indexHtml, /fetch\(\s*['"]\/api\/multimodal\/sync['"]\s*,\s*\{\s*method:\s*['"]POST['"]/, 'Debe ejecutar fetch POST a /api/multimodal/sync');
});

test('5. Feedback visual de sincronización: texto temporal "✅ Sincronizado" y notificación toast', () => {
  assert.match(indexHtml, /✅ Sincronizado/, 'Debe mostrar texto "✅ Sincronizado" tras el fetch exitoso');
  assert.match(indexHtml, /window\.showToast/, 'Debe emitir notificación toast para feedback al usuario');
  assert.match(indexHtml, /multimodal:synced/, 'Debe disparar evento multimodal:synced para notificar a la aplicación');
});

test('6. Backend Netlify Function: /api/multimodal/sync procesa y persiste operaciones en Ledger SaaS', () => {
  assert.match(fnMultimodalSync, /path:\s*\[[^\]]*['"]\/api\/multimodal\/sync['"]/, 'Ruta de la función configurada para /api/multimodal/sync');
  assert.match(fnMultimodalSync, /referencia/, 'Maneja campo referencia');
  assert.match(fnMultimodalSync, /modalidad/, 'Maneja campo modalidad');
  assert.match(fnMultimodalSync, /coste_api/, 'Maneja campo coste_api');
  assert.match(fnMultimodalSync, /venta_agencia/, 'Maneja campo venta_agencia');
  assert.match(fnMultimodalSync, /fee_plataforma/, 'Maneja campo fee_plataforma con valor por defecto');
  assert.match(fnMultimodalSync, /estado/, 'Maneja campo estado');
  assert.match(fnMultimodalSync, /multimodal_operations/, 'Inserta en la tabla multimodal_operations');
});

test('7. Esquema Drizzle y Migración PostgreSQL para tabla multimodal_operations (Ledger SaaS)', () => {
  assert.match(schemaTs, /export\s+const\s+multimodalOperations\s*=\s*pgTable\(\s*["']multimodal_operations["']/, 'db/schema.ts debe definir la tabla multimodalOperations');
  assert.match(schemaTs, /varchar\(\s*["']referencia["']/, 'Debe incluir columna referencia');
  assert.match(schemaTs, /varchar\(\s*["']modalidad["']/, 'Debe incluir columna modalidad');
  assert.match(schemaTs, /numeric\(\s*["']coste_api["']/, 'Debe incluir columna coste_api');
  assert.match(schemaTs, /numeric\(\s*["']venta_agencia["']/, 'Debe incluir columna venta_agencia');
  assert.match(schemaTs, /numeric\(\s*["']fee_plataforma["']/, 'Debe incluir columna fee_plataforma');
  assert.match(schemaTs, /varchar\(\s*["']estado["']/, 'Debe incluir columna estado');

  // Verificar archivo de migración en netlify/database/migrations
  const migrationsDir = path.join(rootDir, 'netlify/database/migrations');
  const migrationEntries = fs.readdirSync(migrationsDir);
  const multimodalMigration = migrationEntries.find((entry) => entry.includes('multimodal_operations'));
  assert.ok(multimodalMigration, 'Debe existir una carpeta de migración generada por Drizzle Kit para multimodal_operations');

  const migrationSqlPath = path.join(migrationsDir, multimodalMigration, 'migration.sql');
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf-8');
  assert.match(migrationSql, /CREATE TABLE "multimodal_operations"/, 'El archivo SQL de migración debe crear la tabla multimodal_operations');
});

test('8. Data Bridge incluye panel y receptor para "Registro de Operaciones Multimodal (Ledger SaaS)"', () => {
  assert.match(databridgeHtml, /Registro de Operaciones Multimodal \(Ledger SaaS\)/, 'databridge.html debe incluir el título del Registro de Operaciones Multimodal');
  assert.match(databridgeHtml, /id="multimodal-ledger-panel"/, 'databridge.html debe contener el panel multimodal-ledger-panel');
  assert.match(databridgeHtml, /MULTIMODAL_LEDGER_SYNC/, 'databridge.html debe escuchar eventos de sincronización del Ledger');
  assert.match(databridgeHtml, /refreshMultimodalLedger/, 'databridge.html debe tener la función de refresco del Ledger SaaS');
});

test('9. Validación del contrato de respuesta y persistencia en /api/multimodal/sync', () => {
  assert.match(fnMultimodalSync, /export\s+default\s+async\s*\(/, 'Debe exportar el handler por defecto');
  assert.match(fnMultimodalSync, /req\.method\s*===\s*["']POST["']/, 'Maneja peticiones POST');
  assert.match(fnMultimodalSync, /req\.method\s*===\s*["']GET["']/, 'Maneja peticiones GET para consultar operaciones');
  assert.match(fnMultimodalSync, /fee_plataforma/, 'Incluye fee_plataforma');
  assert.match(fnMultimodalSync, /ensureApplicationSchema/, 'Garantiza la existencia del esquema de base de datos');
  assert.match(fnMultimodalSync, /status:\s*201/, 'Devuelve status 201 en la creación');
  assert.match(fnMultimodalSync, /success:\s*true/, 'Devuelve success true');
});


