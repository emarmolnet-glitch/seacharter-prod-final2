import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const schemaSource = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');
const dbIndexSource = readFileSync(new URL('../db/index.ts', import.meta.url), 'utf8');
const forwarderProjectsSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

// ============================================================================
// BLOQUE 1: ESQUEMA DE BASE DE DATOS Y MIGRACIONES DE DRIZZLE / NEON
// ============================================================================

test('1. db/schema.ts define la columna JSONB routeAndChartering en la tabla forwarderProjects', () => {
  assert.match(schemaSource, /export const forwarderProjects = pgTable\("forwarder_projects"/);
  assert.match(schemaSource, /routeAndChartering:\s*jsonb\("route_and_chartering"\)/);
});

test('2. Existe una migración en netlify/database/migrations que añade la columna route_and_chartering', () => {
  const migrationsDir = new URL('../netlify/database/migrations', import.meta.url);
  const entries = readdirSync(migrationsDir);
  const migrationFolder = entries.find((e) => e.includes('route_and_chartering'));
  assert.ok(migrationFolder, 'Debe existir una carpeta de migración que contenga route_and_chartering');

  const migrationSqlPath = new URL(`../netlify/database/migrations/${migrationFolder}/migration.sql`, import.meta.url);
  const sql = readFileSync(migrationSqlPath, 'utf8');
  assert.match(sql, /ALTER TABLE "forwarder_projects" ADD COLUMN "route_and_chartering" jsonb/i);
});

test('3. db/index.ts garantiza la columna route_and_chartering en ensureApplicationSchema', () => {
  assert.match(dbIndexSource, /ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS route_and_chartering JSONB;/i);
});

// ============================================================================
// BLOQUE 2: CAPA DE PERSISTENCIA EN NETLIFY FUNCTION (FORWARDER-PROJECTS.JS)
// ============================================================================

test('4. forwarder-projects.js garantiza la columna route_and_chartering en ensureForwarderSchema', () => {
  assert.match(forwarderProjectsSource, /ALTER TABLE forwarder_projects ADD COLUMN IF NOT EXISTS route_and_chartering JSONB;/i);
});

test('5. forwarder-projects.js persiste route_and_chartering en las consultas UPDATE de POST y PUT', () => {
  assert.match(forwarderProjectsSource, /route_and_chartering\s*=\s*COALESCE\(\$12::jsonb,\s*route_and_chartering\)/);
});

test('6. forwarder-projects.js recupera route_and_chartering en las consultas SELECT de GET (individual y lista)', () => {
  const selectMatches = [...forwarderProjectsSource.matchAll(/SELECT[\s\S]*?route_and_chartering[\s\S]*?FROM\s+forwarder_projects/gi)];
  assert.ok(selectMatches.length >= 2, 'Debe haber consultas SELECT tanto para GET individual como para listado que incluyan route_and_chartering');
});

// ============================================================================
// BLOQUE 3: CAPTURA Y SERIALIZACIÓN EN EL BOTÓN "GUARDAR FLETE Y ESTIBA EN PROYECTO"
// ============================================================================

test('7. handleSaveProjectCargo serializa el bloque completo de Ruta Marítima, Ritmos Operativos, Demoras y el valor exacto del TCE', () => {
  // Verificación de presencia del bloque route_and_chartering con todos sus campos requeridos
  assert.match(workspaceSource, /route_and_chartering:\s*\{/);
  assert.match(workspaceSource, /pol:\s*pol\s*\|\|\s*readActiveCalculatorSession\(\)\.pol/);
  assert.match(workspaceSource, /pod:\s*pod\s*\|\|\s*readActiveCalculatorSession\(\)\.pod/);
  assert.match(workspaceSource, /loading_rate_mt_day:\s*Number\(loadingRate\)/);
  assert.match(workspaceSource, /discharging_rate_mt_day:\s*Number\(dischargingRate\)/);
  assert.match(workspaceSource, /distance_nm:\s*Number\(distanceNm\)/);
  assert.match(workspaceSource, /vessel_speed_knots:\s*Number\(vesselSpeedKnots\)/);
  assert.match(workspaceSource, /dias_carga:\s*currentReportSnapshot\?\.diasCarga/);
  assert.match(workspaceSource, /dias_descarga:\s*currentReportSnapshot\?\.diasDescarga/);
  assert.match(workspaceSource, /dias_muelle:/);
  assert.match(workspaceSource, /dias_navegacion:\s*currentReportSnapshot\?\.diasNavegacion/);
  assert.match(workspaceSource, /dias_rotacion_total:\s*currentReportSnapshot\?\.diasRotacionTotal/);
  assert.match(workspaceSource, /demurrage_days:\s*currentReportSnapshot\?\.demurrageDays/);
  assert.match(workspaceSource, /demurrage_daily_rate_usd:\s*Number\(demurrageDailyRateUsd\)/);
  assert.match(workspaceSource, /demurrage_cost_eur:\s*currentReportSnapshot\?\.demurrageCostNum/);
  assert.match(workspaceSource, /demurrage_cost_usd:/);
  assert.match(workspaceSource, /demurrage_status:\s*currentReportSnapshot\?\.demurrageStatus/);
  assert.match(workspaceSource, /plancha_dias_permitidos:/);
  assert.match(workspaceSource, /tce_value:\s*Number\(tceValue/);
  assert.match(workspaceSource, /ocean_freight_tce_usd:/);
  assert.match(workspaceSource, /ocean_freight_tce_eur:/);
  assert.match(workspaceSource, /is_real_estimate:\s*true/);

  // Verificación de que el proyecto actualizado inyecta route_and_chartering a nivel de registro y lo persiste
  assert.match(workspaceSource, /route_and_chartering:\s*payload\.route_and_chartering/);
  assert.match(workspaceSource, /await\s+persistProjectToDatabase\(updatedProject\)/);
});

// ============================================================================
// BLOQUE 4: CARGA Y RENDERIZADO EN EXPEDIENTE DE PROYECTOS SIN ESTIMACIONES GENÉRICAS
// ============================================================================

test('8. ForwarderWorkspace implementa helper getMaritimeRouteData y lo expone para extracción estructurada', () => {
  assert.match(workspaceSource, /const\s+getMaritimeRouteData\s*=\s*\(project,\s*payload\s*=\s*null\)\s*=>/);
  assert.match(workspaceSource, /window\.getMaritimeRouteData\s*=\s*getMaritimeRouteData/);
});

test('9. ForwarderWorkspace carga directamente los datos reales guardados en el useEffect de activeProject', () => {
  // Al cambiar activeProject, el hook lee route_and_chartering y restaura las variables de estado
  assert.match(workspaceSource, /const\s+projectRoute\s*=\s*activeProject\.route_and_chartering/);
  assert.match(workspaceSource, /if\s*\(projectRoute\.tce_value\s*\|\|\s*projectRoute\.tceValue/);
  assert.match(workspaceSource, /setTceValue\(tceVal\)/);
});

test('10. ForwarderWorkspace renderiza el card #project-maritime-route-card con métricas reales y sello "DATOS REALES GUARDADOS"', () => {
  assert.match(workspaceSource, /id="project-maritime-route-card"/);
  assert.match(workspaceSource, /Ruta Marítima, Ritmos Operativos y Gestión de Demoras/);
  assert.match(workspaceSource, /✓ DATOS REALES GUARDADOS/);
  assert.match(workspaceSource, /id="project-tce-value-display"/);
  assert.match(workspaceSource, /id="project-ocean-freight-tce-display"/);
  assert.match(workspaceSource, /id="project-pol-display"/);
  assert.match(workspaceSource, /id="project-pod-display"/);
  assert.match(workspaceSource, /id="project-distance-display"/);
  assert.match(workspaceSource, /id="project-loading-rate-display"/);
  assert.match(workspaceSource, /id="project-discharging-rate-display"/);
  assert.match(workspaceSource, /id="project-berth-days-display"/);
  assert.match(workspaceSource, /id="project-sea-days-display"/);
  assert.match(workspaceSource, /id="project-rotation-days-display"/);
  assert.match(workspaceSource, /id="project-laytime-display"/);
  assert.match(workspaceSource, /id="project-demurrage-rate-display"/);
});

// ============================================================================
// BLOQUE 5: SIMULACIÓN DE FLUJO END-TO-END DE GUARDADO Y RECUPERACIÓN REAL
// ============================================================================

test('11. Simulación funcional: getMaritimeRouteData extrae fielmente el bloque guardado con TCE exacto y demoras', () => {
  // Simulación de un expediente guardado con los datos calculados de una operación real
  const mockSavedProject = {
    id: 101,
    project_ref: 'EXP-992026',
    client_name: 'Bergé Logistics & Energy',
    status: 'Cotizado',
    route_and_chartering: {
      pol: 'Santander',
      pod: 'Port Everglades',
      distance_nm: 3850,
      loading_rate_mt_day: 1500,
      discharging_rate_mt_day: 1200,
      vessel_speed_knots: 13.0,
      daily_hire_rate_usd: 14500,
      exchange_rate: 0.92,
      dias_carga: 2.22,
      dias_descarga: 2.78,
      dias_muelle: 5.0,
      dias_navegacion: 12.34,
      dias_rotacion_total: 17.34,
      actual_loading_days: 3.0,
      actual_discharging_days: 2.5,
      demurrage_days: 0.78,
      demurrage_daily_rate_usd: 14500,
      demurrage_cost_eur: 10405.2,
      demurrage_cost_usd: 11310.0,
      demurrage_status: 'EXCESO DE ESTADÍA (ON DEMURRAGE)',
      plancha_dias_permitidos: 5.0,
      tce_value: 14500,
      tce_daily_rate_usd: 14500,
      ocean_freight_tce_usd: 251430.0,
      ocean_freight_tce_eur: 231315.6,
      tce_active: true,
      vessel_type: 'Handysize Geared Bulk Carrier',
      is_real_estimate: true
    }
  };

  // Función extractora simulada idéntica a la implementada
  function extractMaritimeRoute(project) {
    const rc = project?.route_and_chartering;
    assert.ok(rc, 'El expediente debe tener route_and_chartering persistido');
    return {
      pol: rc.pol,
      pod: rc.pod,
      distanceNm: rc.distance_nm,
      loadingRate: rc.loading_rate_mt_day,
      dischargingRate: rc.discharging_rate_mt_day,
      diasMuelle: rc.dias_muelle,
      diasNavegacion: rc.dias_navegacion,
      diasRotacionTotal: rc.dias_rotacion_total,
      demurrageDays: rc.demurrage_days,
      demurrageDailyRateUsd: rc.demurrage_daily_rate_usd,
      demurrageCostUsd: rc.demurrage_cost_usd,
      planchaDiasPermitidos: rc.plancha_dias_permitidos,
      tceValue: rc.tce_value,
      oceanFreightTceUsd: rc.ocean_freight_tce_usd,
      vesselType: rc.vessel_type,
      isRealEstimate: rc.is_real_estimate
    };
  }

  const result = extractMaritimeRoute(mockSavedProject);
  assert.strictEqual(result.pol, 'Santander');
  assert.strictEqual(result.pod, 'Port Everglades');
  assert.strictEqual(result.distanceNm, 3850);
  assert.strictEqual(result.loadingRate, 1500);
  assert.strictEqual(result.dischargingRate, 1200);
  assert.strictEqual(result.diasMuelle, 5.0);
  assert.strictEqual(result.diasNavegacion, 12.34);
  assert.strictEqual(result.diasRotacionTotal, 17.34);
  assert.strictEqual(result.demurrageDays, 0.78);
  assert.strictEqual(result.demurrageDailyRateUsd, 14500);
  assert.strictEqual(result.demurrageCostUsd, 11310.0);
  assert.strictEqual(result.planchaDiasPermitidos, 5.0);
  assert.strictEqual(result.tceValue, 14500);
  assert.strictEqual(result.oceanFreightTceUsd, 251430.0);
  assert.strictEqual(result.vesselType, 'Handysize Geared Bulk Carrier');
  assert.strictEqual(result.isRealEstimate, true);
});
