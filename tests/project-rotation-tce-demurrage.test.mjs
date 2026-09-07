import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProjectInstruction } from '../src/utils/agenteProyectosParser.mjs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');

function createHandler(sourceCode, mockGenAI) {
  const cleanCode = sourceCode
    .replace(/import\s+{\s*GoogleGenerativeAI\s*}\s+from\s+["']@google\/generative-ai["'];?/, '')
    .replace(/import\s+{\s*Buffer\s*}\s+from\s+["']node:buffer["'];?/, '')
    .replace(/export\s+default\s+handler;?/, '')
    .replace(/export\s+async\s+function\s+handler/, 'async function handler');

  const fn = new Function('GoogleGenerativeAI', 'Buffer', `${cleanCode}\nreturn handler;`);
  return fn(mockGenAI, Buffer);
}

const mockGenAI = class {
  getGenerativeModel() {
    return {
      generateContent: async () => ({
        response: { text: () => JSON.stringify({ success: true, items: [] }) }
      })
    };
  }
};

const handler = createHandler(projectParserSource, mockGenAI);

// ============================================================================
// 1. INCORPORACIÓN DE POL, POD Y RITMOS DE CARGA/DESCARGA EN INTERFAZ Y BACKEND
// ============================================================================

test('1. Interfaz y controladores backend definen e integran campos para POL, POD, Ritmo de Carga y Ritmo de Descarga', () => {
  // Verificación en frontend (ForwarderWorkspace.jsx)
  assert.match(workspaceSource, /const\s*\[pol,\s*setPol\]\s*=\s*useState/);
  assert.match(workspaceSource, /const\s*\[pod,\s*setPod\]\s*=\s*useState/);
  assert.match(workspaceSource, /const\s*\[loadingRate,\s*setLoadingRate\]\s*=\s*useState/);
  assert.match(workspaceSource, /const\s*\[dischargingRate,\s*setDischargingRate\]\s*=\s*useState/);

  // Campos de entrada en la interfaz
  assert.match(workspaceSource, /id="input-pol"/);
  assert.match(workspaceSource, /id="input-pod"/);
  assert.match(workspaceSource, /id="input-loading-rate"/);
  assert.match(workspaceSource, /id="input-discharging-rate"/);

  // Verificación en backend (project-parser.js)
  assert.ok(typeof handler.calculatePortDistanceNm === 'function');
  assert.ok(typeof handler.calculateRotationAndTce === 'function');
  assert.ok(typeof handler.calculateDemurrage === 'function');
  assert.ok(handler.WORLD_PORTS);
  assert.ok(handler.WORLD_PORTS.valencia);
  assert.ok(handler.WORLD_PORTS.houston);
});

// ============================================================================
// 2. MOTOR DE CÁLCULO DINÁMICO DE ROTACIÓN Y FLETE (TCE)
// ============================================================================

test('2. calculateRotationAndTce calcula estrictamente D_total y el Flete Marítimo (TCE)', () => {
  const params = {
    totalWeightTons: 5000,        // 5.000 MT
    loadingRateMtDay: 1250,       // 1.250 MT/día => Días Carga = 5000 / 1250 = 4.0 días
    dischargingRateMtDay: 1000,    // 1.000 MT/día => Días Descarga = 5000 / 1000 = 5.0 días
    distanceNm: 2880,             // 2.880 NM
    serviceSpeedKnots: 12.0,      // 12 nudos => Días Navegación = 2880 / (12 * 24) = 10.0 días
    vesselDailyRateUsd: 11500,    // 11.500 USD/día
    exchangeRateUsdToEur: 0.92,   // 0.92 USD/EUR
    pol: 'Valencia',
    pod: 'Houston'
  };

  const rotation = handler.calculateRotationAndTce(params);

  // Verificación matemática estricta de días
  assert.strictEqual(rotation.loadingDays, 4.0, 'Días de Carga = Peso / Ritmo Carga');
  assert.strictEqual(rotation.dischargingDays, 5.0, 'Días de Descarga = Peso / Ritmo Descarga');
  assert.strictEqual(rotation.navigationDays, 10.0, 'Días de Navegación = Distancia / (Velocidad * 24)');
  assert.strictEqual(rotation.totalRotationDays, 19.0, 'D_total = D_carga + D_descarga + D_navegacion');

  // Flete Marítimo (TCE) estrictamente: D_total * Tarifa Diaria (USD/día) * Tipo de Cambio
  // 19 días * 11.500 USD/día = 218.500 USD
  // 218.500 USD * 0.92 = 201.020 EUR
  assert.strictEqual(rotation.oceanFreightTceUsd, 218500);
  assert.strictEqual(rotation.oceanFreightTceEur, 201020);
});

test('3. evaluateCharteringModel y calculateFinancialBreakdown aplican la rotación y flete TCE dinámicos', () => {
  const items = [
    {
      id: 'item-massive-1',
      type: 'Tuberías de Acero de Gran Diámetro',
      quantity: 50,
      weight: 120000, // 50 * 120 t = 6.000 t (>= 40t)
      length: 12.0,
      width: 2.5,
      height: 2.5,
      category: 'Maquinaria / Equipos Industriales',
      shipping_mode_supported: 'Heavy Lift / Breakbulk'
    }
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const options = {
    pol: 'Bilbao',
    pod: 'Rotterdam',
    loadingRate: 1500,        // 6000 / 1500 = 4.0 días de carga
    dischargingRate: 1200,    // 6000 / 1200 = 5.0 días de descarga
    distanceNm: 750,          // 750 NM
    serviceSpeed: 12.5,       // 750 / (12.5 * 24) = 2.5 días navegación
    dailyHireRate: 10000,     // 10.000 USD/día
    exchangeRate: 0.90,       // 0.90 USD/EUR
  };

  const assessment = handler.evaluateCharteringModel(orderTotals, items, options);

  assert.strictEqual(assessment.isFullCharter, true);
  assert.strictEqual(assessment.rotationBreakdown.pol, 'Bilbao');
  assert.strictEqual(assessment.rotationBreakdown.pod, 'Rotterdam');
  assert.strictEqual(assessment.rotationBreakdown.loadingDays, 4.0);
  assert.strictEqual(assessment.rotationBreakdown.dischargingDays, 5.0);
  assert.strictEqual(assessment.rotationBreakdown.navigationDays, 2.5);
  assert.strictEqual(assessment.rotationBreakdown.totalRotationDays, 11.5);

  // 11.5 días * 10.000 USD * 0.90 = 103.500 EUR
  assert.strictEqual(assessment.rotationBreakdown.oceanFreightTceEur, 103500);

  const profile = handler.buildOperationalProfile(items, orderTotals);
  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, assessment, profile, options);

  assert.strictEqual(breakdown.oceanFreight.subtotal, 103500, 'Ocean freight subtotal must match strict rotation TCE');
  assert.strictEqual(breakdown.subtotals.oceanFreight, 103500);
});

// ============================================================================
// 3. CÁLCULO Y GESTIÓN DE DEMORAS (DEMURRAGE)
// ============================================================================

test('4. calculateDemurrage computa 0 demoras si la operativa está dentro de los plazos estimados', () => {
  const result = handler.calculateDemurrage({
    allowedLoadingDays: 4.0,
    allowedDischargingDays: 5.0,
    actualLoadingDays: 3.5,     // Menor que permitido
    actualDischargingDays: 4.8,  // Menor que permitido
    demurrageRateDailyUsd: 12000,
    exchangeRateUsdToEur: 0.92
  });

  assert.strictEqual(result.hasDemurrage, false);
  assert.strictEqual(result.demurrageDays, 0);
  assert.strictEqual(result.totalPenaltyEur, 0);
  assert.strictEqual(result.status, 'DENTRO DE PLANCHA (ON SCHEDULE)');
});

test('5. calculateDemurrage computa penalizaciones automáticas cuando los tiempos en muelle superan los plazos', () => {
  const result = handler.calculateDemurrage({
    allowedLoadingDays: 4.0,
    allowedDischargingDays: 5.0,
    actualLoadingDays: 6.0,     // 6.0 - 4.0 = 2.0 días de demora en carga
    actualDischargingDays: 6.5,  // 6.5 - 5.0 = 1.5 días de demora en descarga
    demurrageRateDailyUsd: 10000,
    exchangeRateUsdToEur: 0.92
  });

  assert.strictEqual(result.hasDemurrage, true);
  assert.strictEqual(result.loadingDemurrageDays, 2.0);
  assert.strictEqual(result.dischargingDemurrageDays, 1.5);
  assert.strictEqual(result.demurrageDays, 3.5); // Total 3.5 días de demora

  // 3.5 días * 10.000 USD/día = 35.000 USD * 0.92 = 32.200 EUR
  assert.strictEqual(result.totalPenaltyUsd, 35000);
  assert.strictEqual(result.totalPenaltyEur, 32200);
  assert.strictEqual(result.status, 'EXCESO DE ESTADÍA (ON DEMURRAGE)');
});

test('6. Demoras se integran automáticamente en calculateFinancialBreakdown como sobrecoste portuario', () => {
  const items = [
    {
      id: 'bulk-demurrage-1',
      category: 'Mercancía Ensacada / Dry Bulk',
      type: 'Big Bags de Cemento',
      quantity: 5000, // 5000 MT
      weight: 1000,
      length: 1.0,
      width: 1.0,
      height: 1.2,
      shipping_mode_supported: 'Big Bags / Granel'
    }
  ];

  const orderTotals = handler.calculateOrderTotals(items);
  const optionsWithDemurrage = {
    loadingRate: 1250,          // 5000 / 1250 = 4.0 días permitidos
    dischargingRate: 1000,      // 5000 / 1000 = 5.0 días permitidos
    actualLoadingDays: 6.0,     // +2.0 días exceso en POL
    actualDischargingDays: 7.0, // +2.0 días exceso en POD => Total 4.0 días demora
    dailyHireRate: 12000,
    demurrageRate: 12000,       // 12.000 USD/día
    exchangeRate: 0.92,
  };

  const assessment = handler.evaluateCharteringModel(orderTotals, items, optionsWithDemurrage);
  assert.strictEqual(assessment.rotationBreakdown.demurrage.hasDemurrage, true);
  assert.strictEqual(assessment.rotationBreakdown.demurrage.demurrageDays, 4.0);

  // 4 días * 12.000 USD * 0.92 = 44.160 EUR
  assert.strictEqual(assessment.rotationBreakdown.demurrage.totalPenaltyEur, 44160);

  const profile = handler.buildOperationalProfile(items, orderTotals);
  const breakdown = handler.calculateFinancialBreakdown(items, orderTotals, assessment, profile, optionsWithDemurrage);

  const demurrageItem = breakdown.fobAndPortOperations.items.find(it => it.concept.includes('Demoras'));
  assert.ok(demurrageItem, 'FOB/Port Operations must include Demurrage penalty item');
  assert.strictEqual(demurrageItem.amount, 44160);
  assert.strictEqual(demurrageItem.status, 'EXCESO DE ESTADÍA (ON DEMURRAGE)');

  // Invariante de coherencia All-In: totalCostAllIn = oceanFreight + fobAndPortOperations
  assert.strictEqual(
    breakdown.totalCostAllIn,
    Math.round((breakdown.subtotals.oceanFreight + breakdown.subtotals.fobAndPortOperations) * 100) / 100
  );
});

// ============================================================================
// 4. PARSEO DE COMANDOS EN AGENTE DE PROYECTOS (LENGUAJE NATURAL)
// ============================================================================

test('7. parseProjectInstruction extrae dinámicamente POL, POD, ritmos operativos y demoras', () => {
  const text = 'POL Valencia POD Houston ritmo de carga 1400 ritmo de descarga 1100 demoras 3 dias';
  const result = parseProjectInstruction(text);

  assert.strictEqual(result.payload.pol, 'Valencia');
  assert.strictEqual(result.payload.pod, 'Houston');
  assert.strictEqual(result.payload.loadingRate, 1400);
  assert.strictEqual(result.payload.dischargingRate, 1100);
  assert.strictEqual(result.payload.demurrageDays, 3);
  assert.ok(result.detectedActions.length >= 4);
});

// ============================================================================
// 5. SINCRONIZACIÓN Y REPORTE EJECUTIVO EN FORWARDERWORKSPACE
// ============================================================================

test('8. ForwarderWorkspace sincroniza ruta, ritmos, rotación y demoras en el Reporte Ejecutivo', () => {
  // Verificación de campos en el reporte ejecutivo
  assert.match(workspaceSource, /Ruta Marítima/);
  assert.match(workspaceSource, /Ritmos Carga \/ Descarga/);
  assert.match(workspaceSource, /Rotación Buque \(D_total\)/);
  assert.match(workspaceSource, /Gestión de Demoras/);

  // Verificación de renderizado de la fila de demoras en la tabla financiera
  assert.match(workspaceSource, /activeReport\.demurrageDays\s*>\s*0/);
  assert.match(workspaceSource, /Demoras y Sobrecostes de Muelle \(Demurrage\)/);

  // Verificación de la persistencia de los parámetros de ruta en payload_data
  assert.match(workspaceSource, /route_and_chartering:\s*\{/);
  assert.match(workspaceSource, /loading_rate_mt_day/);
  assert.match(workspaceSource, /discharging_rate_mt_day/);
  assert.match(workspaceSource, /dias_rotacion_total/);
  assert.match(workspaceSource, /demurrage_days/);
});

// ============================================================================
// 6. EJECUCIÓN END-TO-END HTTP EN PROJECT-PARSER
// ============================================================================

test('9. HTTP POST a project-parser devuelve el modelo de rotación paramétrica y liquidación de demoras', async () => {
  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pol: 'Valencia',
      pod: 'Houston',
      loadingRate: 1500,
      dischargingRate: 1200,
      actualLoadingDays: 5.5,
      actualDischargingDays: 6.0,
      distanceNm: 4850,
      items: [
        {
          id: 'pipe-batch-1',
          category: 'Maquinaria / Equipos Industriales',
          type: 'Módulos de Planta Desaladora',
          quantity: 20,
          weight: 150000, // 20 * 150t = 3000t
          length: 12.0,
          width: 3.0,
          height: 3.0,
          shipping_mode_supported: 'Heavy Lift / Breakbulk'
        }
      ]
    }),
  });

  const res = await handler(req);
  assert.strictEqual(res.status, 200);

  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(data.charteringAssessment);
  assert.strictEqual(data.charteringAssessment.isFullCharter, true);

  const rot = data.charteringAssessment.rotationBreakdown;
  assert.ok(rot);
  assert.strictEqual(rot.pol, 'Valencia');
  assert.strictEqual(rot.pod, 'Houston');
  assert.ok(rot.totalRotationDays > 0);
  assert.ok(rot.oceanFreightTceEur > 0);

  // Demoras
  assert.ok(rot.demurrage);
  assert.ok(rot.demurrage.demurrageDays > 0);
  assert.strictEqual(rot.demurrage.status, 'EXCESO DE ESTADÍA (ON DEMURRAGE)');

  // Desglose financiero
  assert.ok(data.financialBreakdown);
  assert.strictEqual(data.financialBreakdown.oceanFreight.subtotal, rot.oceanFreightTceEur);
  assert.ok(data.financialBreakdown.demurrage.hasDemurrage);
});
