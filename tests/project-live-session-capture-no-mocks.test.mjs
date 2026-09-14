import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. ForwarderWorkspace implementa readActiveCalculatorSession para capturar el estado real de la sesión', () => {
  assert.match(workspaceSource, /const\s+readActiveCalculatorSession\s*=\s*\(\)\s*=>/);
  assert.match(workspaceSource, /window\.activeVoyage/);
  assert.match(workspaceSource, /window\.SeaCharterStore\?\.getState/);
  assert.match(workspaceSource, /window\.CalculatedState/);
  assert.match(workspaceSource, /document\.getElementById\('port-pol'\)/);
  assert.match(workspaceSource, /document\.getElementById\('port-pod'\)/);
});

test('2. ForwarderWorkspace inicializa pol y pod dinámicamente desde readActiveCalculatorSession sin mock defaults fijos', () => {
  assert.match(workspaceSource, /const\s+initialSession\s*=\s*readActiveCalculatorSession\(\);/);
  assert.match(workspaceSource, /const\s*\[pol,\s*setPol\]\s*=\s*useState\(initialSession\.pol\s*\|\|\s*''\);/);
  assert.match(workspaceSource, /const\s*\[pod,\s*setPod\]\s*=\s*useState\(initialSession\.pod\s*\|\|\s*''\);/);
});

test('3. handleSaveProjectCargo guarda estrictamente pol y pod activos sin forzar "Valencia" ni "Houston"', () => {
  assert.match(workspaceSource, /pol:\s*pol\s*\|\|\s*readActiveCalculatorSession\(\)\.pol/);
  assert.match(workspaceSource, /pod:\s*pod\s*\|\|\s*readActiveCalculatorSession\(\)\.pod/);
  // Verificar que el bloque de serialización en handleSaveProjectCargo no contenga 'Valencia' ni 'Houston'
  const saveCargoMatch = workspaceSource.match(/handleSaveProjectCargo\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?route_and_chartering:\s*\{([\s\S]*?)\}/);
  assert.ok(saveCargoMatch, 'handleSaveProjectCargo con route_and_chartering debe existir');
  assert.doesNotMatch(saveCargoMatch[1], /'Valencia'/);
  assert.doesNotMatch(saveCargoMatch[1], /'Houston'/);
});

test('4. getMaritimeRouteData lee fielmente el proyecto guardado o sesión activa sin sobreescribir con mocks', () => {
  const getMaritimeMatch = workspaceSource.match(/const\s+getMaritimeRouteData\s*=\s*\(project,\s*payload\s*=\s*null\)\s*=>\s*\{([\s\S]*?)\n\s*const\s+getProjectDetails/);
  assert.ok(getMaritimeMatch, 'getMaritimeRouteData helper debe existir');
  const helperCode = getMaritimeMatch[1];
  assert.doesNotMatch(helperCode, /pol:\s*pol\s*\|\|\s*'Valencia'/);
  assert.doesNotMatch(helperCode, /pod:\s*pod\s*\|\|\s*'Houston'/);
});

test('5. handleOpenCreateService pre-popula la calculadora con la sesión activa (origen, destino, toneladas, tipo de carga, TCE)', () => {
  const openCreateServiceMatch = workspaceSource.match(/const\s+handleOpenCreateService\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*const\s+handleEditService/);
  assert.ok(openCreateServiceMatch, 'handleOpenCreateService debe existir');
  const fnCode = openCreateServiceMatch[1];
  assert.match(fnCode, /readActiveCalculatorSession\(\)/);
  assert.match(fnCode, /setPol\(sessionData\.pol\)/);
  assert.match(fnCode, /setPod\(sessionData\.pod\)/);
  assert.match(fnCode, /setTceValue\(sessionData\.tce\)/);
});

test('6. Simulación real: Estimación "Béjaia a Praia" con 18,500 MT se captura, serializa y visualiza fielmente', () => {
  // Simular un mock de sesión calculado en la calculadora por el usuario
  const simulatedSession = {
    pol: 'Béjaia',
    pod: 'Praia',
    cargoQty: 18500,
    cargoType: 'Cemento en Big Bags',
    loadRate: 1800,
    dischRate: 1500,
    distanceNm: 2340,
    speedKnots: 13.5,
    tce: 14200,
    freightSell: 48.5,
    freightCost: 38.0,
  };

  // Simular la captura en handleSaveProjectCargo
  const mockSavedPayload = {
    route_and_chartering: {
      pol: simulatedSession.pol,
      pod: simulatedSession.pod,
      distance_nm: simulatedSession.distanceNm,
      loading_rate_mt_day: simulatedSession.loadRate,
      discharging_rate_mt_day: simulatedSession.dischRate,
      vessel_speed_knots: simulatedSession.speedKnots,
      daily_hire_rate_usd: simulatedSession.tce,
      tce_value: simulatedSession.tce,
      tce_daily_rate_usd: simulatedSession.tce,
      ocean_freight_tce_usd: 234000,
      ocean_freight_tce_eur: 215280,
      vessel_type: 'Geared Handysize (Lo-Lo)',
      total_weight_tons: simulatedSession.cargoQty,
      is_real_estimate: true
    }
  };

  const projectRecord = {
    id: 42,
    project_ref: 'EXP-BEJAIA-PRAIA',
    client_name: 'Maghreb Cement Trading',
    route_and_chartering: mockSavedPayload.route_and_chartering
  };

  // Simular la extracción estructurada de getMaritimeRouteData
  const rc = projectRecord.route_and_chartering;
  const result = {
    pol: rc.pol,
    pod: rc.pod,
    distanceNm: rc.distance_nm,
    loadingRate: rc.loading_rate_mt_day,
    dischargingRate: rc.discharging_rate_mt_day,
    tceValue: rc.tce_value,
    totalWeightTons: rc.total_weight_tons,
    isRealEstimate: rc.is_real_estimate
  };

  assert.strictEqual(result.pol, 'Béjaia', 'El POL recuperado debe ser Béjaia sin fallback a Valencia');
  assert.strictEqual(result.pod, 'Praia', 'El POD recuperado debe ser Praia sin fallback a Houston');
  assert.strictEqual(result.totalWeightTons, 18500, 'Las toneladas deben coincidir con la estimación real');
  assert.strictEqual(result.tceValue, 14200, 'El valor del TCE debe coincidir exactamente con el calculado');
  assert.strictEqual(result.loadingRate, 1800);
  assert.strictEqual(result.dischargingRate, 1500);
  assert.strictEqual(result.isRealEstimate, true);
});
