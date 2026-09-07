import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const widgetSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');

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

const parserHandler = createHandler(parserSource, mockGenAI);

test('1. ForwarderWorkspace implements reactive two-way binding hook (useEffect) from charteringAssessment to inputs', () => {
  // Verifies state declaration for charteringAssessment
  assert.match(workspaceSource, /const\s+\[charteringAssessment,\s*setCharteringAssessment\]\s*=\s*useState\(null\);/);

  // Verifies useEffect listening to charteringAssessment
  assert.match(workspaceSource, /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?const\s+rot\s*=\s*charteringAssessment\.rotationBreakdown/);
  assert.match(workspaceSource, /setPol\(rot\.pol\)/);
  assert.match(workspaceSource, /setPod\(rot\.pod\)/);
  assert.match(workspaceSource, /setLoadingRate\(loadRate\)/);
  assert.match(workspaceSource, /setDischargingRate\(dischRate\)/);
  assert.match(workspaceSource, /setDistanceNm\(dist\)/);
  assert.match(workspaceSource, /setActualLoadingDays\(dem\.actualLoadingDays\)/);
  assert.match(workspaceSource, /setActualDischargingDays\(dem\.actualDischargingDays\)/);
  assert.match(workspaceSource, /setDemurrageDailyRateUsd\(demDaily\)/);
});

test('2. ForwarderWorkspace implements reverse two-way binding hook syncing manual input changes into charteringAssessment', () => {
  // Verifies useEffect synchronizing input states back into charteringAssessment
  assert.match(workspaceSource, /setCharteringAssessment\(prev\s*=>\s*\{[\s\S]*?rotationBreakdown:\s*\{[\s\S]*?pol,[\s\S]*?pod,[\s\S]*?loadingRateMtDay:/);
  assert.match(workspaceSource, /\[pol,\s*pod,\s*loadingRate,\s*dischargingRate,\s*distanceNm,\s*vesselSpeedKnots,\s*vesselDailyHireUsd,\s*actualLoadingDays,\s*actualDischargingDays,\s*demurrageDailyRateUsd\]/);
});

test('3. ForwarderWorkspace syncs activeProject route_and_chartering and charteringAssessment on project switch', () => {
  assert.match(workspaceSource, /const\s+projectRoute\s*=\s*activeProject\.route_and_chartering/);
  assert.match(workspaceSource, /const\s+projectAssessment\s*=\s*activeProject\.charteringAssessment/);
  assert.match(workspaceSource, /setCharteringAssessment\(projectAssessment\)/);
});

test('4. Real-time visual counters are bound dynamically with semantic IDs in "Ruta Marítima, Ritmos Operativos y Gestión de Demoras"', () => {
  // Checks semantic counter IDs in the visual summary grid
  assert.match(workspaceSource, /id="counter-loading-days"/);
  assert.match(workspaceSource, /id="counter-discharging-days"/);
  assert.match(workspaceSource, /id="counter-navigation-days"/);
  assert.match(workspaceSource, /id="counter-demurrage-status"/);
  assert.match(workspaceSource, /id="counter-rotation-days"/);

  // Verifies formulas for counters
  assert.match(workspaceSource, /dCarga\s*=\s*wTons\s*>\s*0\s*\?\s*Math\.round\(\(wTons\s*\/\s*effLoad\)\s*\*\s*100\)\s*\/\s*100\s*:\s*0/);
  assert.match(workspaceSource, /dDescarga\s*=\s*wTons\s*>\s*0\s*\?\s*Math\.round\(\(wTons\s*\/\s*effDisch\)\s*\*\s*100\)\s*\/\s*100\s*:\s*0/);
  assert.match(workspaceSource, /dNav\s*=\s*Math\.round\(\(effDist\s*\/\s*\(effSpd\s*\*\s*24\)\)\s*\*\s*100\)\s*\/\s*100/);
  assert.match(workspaceSource, /dRot\s*=\s*Math\.round\(\(dCarga\s*\+\s*dDescarga\s*\+\s*dNav\)\s*\*\s*100\)\s*\/\s*100/);
});

test('5. AgenteProyectosWidget connects routeData and charteringAssessment and passes them to onUpdatePayload', () => {
  // Verifies widget receives routeData and charteringAssessment props
  assert.match(widgetSource, /charteringAssessment\s*=\s*null/);
  assert.match(widgetSource, /routeData\s*=\s*null/);

  // Verifies handleSend attaches route data in body
  assert.match(widgetSource, /pol:\s*routeData\?\.pol/);
  assert.match(widgetSource, /pod:\s*routeData\?\.pod/);
  assert.match(widgetSource, /loadingRate:\s*routeData\?\.loadingRate/);
  assert.match(widgetSource, /dischargingRate:\s*routeData\?\.dischargingRate/);

  // Verifies onUpdatePayload receives charteringAssessment and rotationBreakdown
  assert.match(widgetSource, /charteringAssessment:\s*data\.charteringAssessment/);
  assert.match(widgetSource, /rotationBreakdown:\s*data\.charteringAssessment\?\.rotationBreakdown/);
});

test('6. project-parser exports extractRouteAndOperationalOptions and parses conversational route parameters', () => {
  const extract = parserHandler.extractRouteAndOperationalOptions;
  assert.ok(typeof extract === 'function', 'extractRouteAndOperationalOptions must be exported');

  const text = 'POL Bilbao POD Rotterdam con ritmo de carga 1600 MT/d y ritmo de descarga 1300 MT/d, distancia 850 NM y retraso en muelle 3 días';
  const parsed = extract(text);

  assert.strictEqual(parsed.pol, 'Bilbao');
  assert.strictEqual(parsed.pod, 'Rotterdam');
  assert.strictEqual(parsed.loadingRate, 1600);
  assert.strictEqual(parsed.dischargingRate, 1300);
  assert.strictEqual(parsed.distanceNm, 850);
  assert.strictEqual(parsed.demurrageDays, 3);
});

test('7. End-to-End HTTP: project-parser returns dynamically evaluated rotationBreakdown for conversational route instructions', async () => {
  const testItems = [
    { category: 'Maquinaria / Equipos Industriales', quantity: 2, weight: 35000, length: 12.0, width: 3.5, height: 3.2 }
  ];

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'POL Bilbao POD Rotterdam ritmo de carga 1500 ritmo de descarga 1200 distancia 800',
      items: testItems,
    }),
  });

  const res = await parserHandler(req);
  assert.strictEqual(res.status, 200);

  const data = await res.json();
  assert.ok(data.success);
  assert.ok(data.charteringAssessment);
  assert.ok(data.charteringAssessment.rotationBreakdown);

  const rot = data.charteringAssessment.rotationBreakdown;
  assert.strictEqual(rot.pol, 'Bilbao');
  assert.strictEqual(rot.pod, 'Rotterdam');
  assert.strictEqual(rot.loadingRateMtDay, 1500);
  assert.strictEqual(rot.dischargingRateMtDay, 1200);
  assert.strictEqual(rot.distanceNm, 800);
});

test('8. Behavioral simulation: reactive inputs recalculate visual counters in real time without remaining static', () => {
  // Cargo weight = 70.000 kg = 70 MT
  const cargoWeightTons = 70;

  // Initial defaults
  const defaultLoadingRate = 1200;
  const defaultDischargingRate = 1000;
  const defaultDistanceNm = 4850;
  const defaultSpeedKnots = 12.0;

  const initialLoadDays = Math.round((cargoWeightTons / defaultLoadingRate) * 100) / 100;
  const initialDischDays = Math.round((cargoWeightTons / defaultDischargingRate) * 100) / 100;
  const initialNavDays = Math.round((defaultDistanceNm / (defaultSpeedKnots * 24)) * 100) / 100;
  const initialRotDays = Math.round((initialLoadDays + initialDischDays + initialNavDays) * 100) / 100;

  // New values parsed from Agent: Bilbao -> Rotterdam, loading 1500, discharging 1200, dist 800
  const newLoadingRate = 1500;
  const newDischargingRate = 1200;
  const newDistanceNm = 800;
  const newSpeedKnots = 12.0;

  const reactiveLoadDays = Math.round((cargoWeightTons / newLoadingRate) * 100) / 100;
  const reactiveDischDays = Math.round((cargoWeightTons / newDischargingRate) * 100) / 100;
  const reactiveNavDays = Math.round((newDistanceNm / (newSpeedKnots * 24)) * 100) / 100;
  const reactiveRotDays = Math.round((reactiveLoadDays + reactiveDischDays + reactiveNavDays) * 100) / 100;

  // Verify counters update dynamically and are not equal to defaults
  assert.notStrictEqual(reactiveLoadDays, initialLoadDays);
  assert.notStrictEqual(reactiveDischDays, initialDischDays);
  assert.notStrictEqual(reactiveNavDays, initialNavDays);
  assert.notStrictEqual(reactiveRotDays, initialRotDays);

  assert.strictEqual(reactiveLoadDays, 0.05); // 70 / 1500 = 0.0466 -> 0.05
  assert.strictEqual(reactiveDischDays, 0.06); // 70 / 1200 = 0.0583 -> 0.06
  assert.strictEqual(reactiveNavDays, 2.78); // 800 / (12 * 24) = 2.777 -> 2.78
  assert.strictEqual(reactiveRotDays, 2.89); // 0.05 + 0.06 + 2.78 = 2.89
});

test('9. Datalastic API integration: fetchDatalasticDistanceNm queries API with DATALASTIC_API_KEY or falls back gracefully', async () => {
  const fetchDatalastic = parserHandler.fetchDatalasticDistanceNm;
  assert.ok(typeof fetchDatalastic === 'function', 'fetchDatalasticDistanceNm must be exported');

  // Verify fallback dictionary has common Mediterranean and Atlantic routes
  const known = parserHandler.KNOWN_PORT_DISTANCES_NM;
  assert.strictEqual(known['bejaia-aveiro'], 950);
  assert.strictEqual(known['aveiro-bejaia'], 950);
  assert.strictEqual(known['valencia-houston'], 4850);
  assert.strictEqual(known['houston-valencia'], 4850);
  assert.strictEqual(known['bilbao-rotterdam'], 750);
  assert.strictEqual(known['valencia-rotterdam'], 1950);

  // Test fallback execution when API key is simulated absent
  const origKey = process.env.DATALASTIC_API_KEY;
  delete process.env.DATALASTIC_API_KEY;

  try {
    const distBejaiaAveiro = await fetchDatalastic('Bejaia', 'Aveiro');
    assert.strictEqual(distBejaiaAveiro, 950);

    const distValenciaHouston = await fetchDatalastic('Valencia', 'Houston');
    assert.strictEqual(distValenciaHouston, 4850);

    const distAccents = await fetchDatalastic('Béjaïa (DZ)', 'Aveiro (PT)');
    assert.strictEqual(distAccents, 950);
  } finally {
    if (origKey !== undefined) {
      process.env.DATALASTIC_API_KEY = origKey;
    }
  }
});

test('10. Datalastic API integration: simulates successful Datalastic API response with nautical distance', async () => {
  const fetchDatalastic = parserHandler.fetchDatalasticDistanceNm;
  const originalFetch = globalThis.fetch;
  process.env.DATALASTIC_API_KEY = 'test-datalastic-key';

  try {
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes('api.datalastic.com'));
      assert.ok(String(url).includes('api-key=test-datalastic-key'));
      return new Response(JSON.stringify({
        status: 200,
        data: {
          distance_nm: 945,
          port_from: 'Bejaia',
          port_to: 'Aveiro'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const dist = await fetchDatalastic('Bejaia', 'Aveiro');
    assert.strictEqual(dist, 945);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.DATALASTIC_API_KEY;
  }
});

test('11. Dynamic calculation of navigation days and TCE freight from real nautical distance', () => {
  const calculateRotationAndTce = parserHandler.calculateRotationAndTce;
  assert.ok(typeof calculateRotationAndTce === 'function');

  // Route Bejaia -> Aveiro (950 NM) with 10.000 MT of cargo
  // loadingRate = 1200 MT/d, dischargingRate = 1000 MT/d, speed = 12 knots, hireRate = 11500 USD/day, exRate = 0.92
  const result = calculateRotationAndTce({
    totalWeightTons: 10000,
    loadingRateMtDay: 1200,
    dischargingRateMtDay: 1000,
    distanceNm: 950,
    serviceSpeedKnots: 12.0,
    vesselDailyRateUsd: 11500,
    exchangeRateUsdToEur: 0.92,
    pol: 'Bejaia',
    pod: 'Aveiro',
  });

  // 1. loadingDays = 10000 / 1200 = 8.33 d
  assert.strictEqual(result.loadingDays, 8.33);

  // 2. dischargingDays = 10000 / 1000 = 10.00 d
  assert.strictEqual(result.dischargingDays, 10.00);

  // 3. navigationDays = 950 / (12 * 24) = 950 / 288 = 3.30 d
  assert.strictEqual(result.navigationDays, 3.30);

  // 4. totalRotationDays = 8.33 + 10.00 + 3.30 = 21.63 d
  assert.strictEqual(result.totalRotationDays, 21.63);

  // 5. oceanFreightTceUsd = 21.63 * 11500 = 248745 USD
  assert.strictEqual(result.oceanFreightTceUsd, 248745);

  // 6. oceanFreightTceEur = 248745 * 0.92 = 228845.40 EUR
  assert.strictEqual(result.oceanFreightTceEur, 228845.4);
});
