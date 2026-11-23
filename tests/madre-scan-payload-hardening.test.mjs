import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { register } from 'node:module';

try {
  register(new URL('./jsx-loader.mjs', import.meta.url));
} catch (_) {}

const require = createRequire(import.meta.url);
const engine = require('../voyage-cost-engine.js');

test('1. Recalcular viaje varias veces no anida sensitivityAnalysis dentro de los escenarios', () => {
  const state = {
    cargo: 25000,
    breakEvenArmador: 28.5,
    daysSea: 12,
    daysPort: 8,
    totalDays: 20,
    loadRate: 4000,
    dischRate: 3500,
    totalBunkers: 120000,
    opex: 3200,
    capexDaily: 2100,
    freightRate: 32,
    fuelBreakdown: {
      navigation: { cost: 70000 },
      port: { cost: 50000 },
      totalCost: 120000
    },
    ownerNetBreakdown: {
      grossRevenue: 800000,
      bunkerAndPortCosts: 300000,
      operatingCapitalCosts: 106000
    }
  };

  const mockDoc = {
    getElementById: () => null
  };

  // Simular 10 recálculos sucesivos
  for (let i = 0; i < 10; i++) {
    state.sensitivityAnalysis = engine.renderAutomaticRiskMatrix(state, mockDoc);
  }

  // Verificar que los escenarios son planos y NO contienen sensitivityAnalysis
  assert.ok(state.sensitivityAnalysis);
  assert.equal(state.sensitivityAnalysis.base.sensitivityAnalysis, undefined);
  assert.equal(state.sensitivityAnalysis.best.sensitivityAnalysis, undefined);
  assert.equal(state.sensitivityAnalysis.stress.sensitivityAnalysis, undefined);
  assert.equal(typeof state.sensitivityAnalysis.base.projectedBreakEven, 'number');
  assert.equal(typeof state.sensitivityAnalysis.best.projectedBreakEven, 'number');
  assert.equal(typeof state.sensitivityAnalysis.stress.projectedBreakEven, 'number');

  // La serialización directa debe funcionar sin RangeError
  const serialized = JSON.stringify(state.sensitivityAnalysis);
  assert.ok(serialized.length > 0);
  assert.ok(!serialized.includes('"sensitivityAnalysis"'));
});

test('2. safeCloneForJson corta referencias circulares, limita profundidad y descarta DOM/Window/Event/File/Blob/Funciones', async () => {
  const { safeCloneForJson } = await import('../src/components/GlobalMadreDrawer.jsx');

  // A. Referencia circular
  const circularObj = { name: 'Root', level: 1 };
  circularObj.self = circularObj;
  circularObj.child = { parent: circularObj };

  assert.doesNotThrow(() => {
    const cloned = safeCloneForJson(circularObj);
    const json = JSON.stringify(cloned);
    assert.ok(json.includes('"name":"Root"'));
    assert.equal(cloned.self, undefined);
  });

  // B. Profundidad por defecto (12 niveles) y corte a profundidad mayor
  let deepObj = { level: 15 };
  for (let d = 14; d >= 0; d--) {
    deepObj = { level: d, next: deepObj };
  }
  const defaultDepthCloned = safeCloneForJson(deepObj);
  // Con maxDepth = 12, se atraviesan 11 niveles de profundidad
  let curr = defaultDepthCloned;
  let count = 0;
  while (curr && curr.next) {
    count++;
    curr = curr.next;
  }
  assert.equal(count, 11);

  // C. Referencias compartidas (no circulares) NO se pierden gracias a seen.delete(value)
  const sharedRef = { sharedId: 'alpha', value: 100 };
  const sharedTree = { branchA: sharedRef, branchB: sharedRef, list: [sharedRef, sharedRef] };
  const clonedShared = safeCloneForJson(sharedTree);
  assert.deepEqual(clonedShared.branchA, { sharedId: 'alpha', value: 100 });
  assert.deepEqual(clonedShared.branchB, { sharedId: 'alpha', value: 100 });
  assert.deepEqual(clonedShared.list[0], { sharedId: 'alpha', value: 100 });
  assert.deepEqual(clonedShared.list[1], { sharedId: 'alpha', value: 100 });

  // D. Descarte de DOM, Window, Event, File/Blob y funciones
  const mixedObj = {
    validString: 'hello',
    validNumber: 42,
    validBool: true,
    domNode: { nodeType: 1, tagName: 'DIV' },
    mockWindow: { window: null },
    mockEvent: { preventDefault: () => {}, stopPropagation: () => {} },
    mockFile: { arrayBuffer: () => {}, slice: () => {} },
    mockFunc: () => 'execute'
  };
  mixedObj.mockWindow.window = mixedObj.mockWindow;

  const sanitized = safeCloneForJson(mixedObj);
  assert.equal(sanitized.validString, 'hello');
  assert.equal(sanitized.validNumber, 42);
  assert.equal(sanitized.validBool, true);
  assert.equal(sanitized.domNode, undefined);
  assert.equal(sanitized.mockWindow, undefined);
  assert.equal(sanitized.mockEvent, undefined);
  assert.equal(sanitized.mockFile, undefined);
  assert.equal(sanitized.mockFunc, undefined);
});

test('3. extractDynamicAuditContext limpia activeScreenContext con whitelist estricta y sin duplicación de rawDocumentText', async () => {
  const { extractDynamicAuditContext, safeCloneForJson } = await import('../src/components/GlobalMadreDrawer.jsx');

  const originalDoc = globalThis.document;
  const originalWindow = globalThis.window;

  try {
    const mockElements = {
      '#view-auditor': { id: 'view-auditor', classList: { contains: () => false }, querySelectorAll: () => [] },
      '#view-estimator': { id: 'view-estimator', classList: { contains: () => true }, querySelectorAll: () => [] },
      '#cargo-qty': { value: '45000' },
      '#rate-load': { value: '5000' },
      '#rate-disch': { value: '4000' },
      '#freight-rate': { value: '31.50' },
      '#port-pol': { value: 'Rotterdam' },
      '#port-pod': { value: 'Houston' },
      '#recapInput': { value: 'GENCON 1994 CHARTER PARTY FULL TEXT...' }
    };

    globalThis.document = {
      getElementById: (id) => mockElements[`#${id}`] || null,
      querySelector: (sel) => mockElements[sel] || null,
      querySelectorAll: () => []
    };

    // State con datos pesados y contaminados
    globalThis.window = {
      State: {
        pol: 'Rotterdam',
        pod: 'Houston',
        commodity: 'Grain',
        cargoType: 'Bulk',
        cargoQty: 45000,
        loadRate: 5000,
        dischargeRate: 4000,
        breakEven: 26.8,
        fleteUnitario: 31.50,
        tceDiario: 18500,
        freightTerms: 'FIOST',
        vesselType: 'Supramax',
        estimatedVoyageDays: 19.5,
        ballastDays: 5.2,
        rawDocumentText: 'GENCON 1994 CHARTER PARTY FULL TEXT...',
        madreUltimaAuditoria: { veredicto: 'Aprobado', detalle: 'Completo' },
        reporte_estrategico: 'Reporte confidencial extenso...',
        reporteEstrategico: 'Reporte confidencial duplicado...',
        sensitivityAnalysis: { best: {}, base: {}, stress: {} },
        fullAuditData: { tablas: [] }
      }
    };

    const auditPayload = extractDynamicAuditContext();

    // Campos raíz de auditPayload intactos
    assert.equal(auditPayload.rawDocumentText, 'GENCON 1994 CHARTER PARTY FULL TEXT...');
    assert.ok(auditPayload.fullAuditData);
    assert.ok(auditPayload.userLanguage);

    // activeScreenContext contiene solo la lista blanca
    const ctx = auditPayload.activeScreenContext;
    assert.equal(ctx.suite, 'SeaCharter Core PRO');
    assert.equal(ctx.pol, 'Rotterdam');
    assert.equal(ctx.pod, 'Houston');
    assert.equal(ctx.commodity, 'Grain');
    assert.equal(ctx.cargoQty, 45000);
    assert.equal(ctx.loadRate, 5000);
    assert.equal(ctx.dischargeRate, 4000);
    assert.equal(ctx.breakEven, 26.8);
    assert.equal(ctx.fleteUnitario, 31.50);
    assert.equal(ctx.tceDiario, 18500);
    assert.equal(ctx.freightTerms, 'FIOST');
    assert.equal(ctx.vesselType, 'Supramax');
    assert.equal(ctx.estimatedVoyageDays, 19.5);
    assert.equal(ctx.ballastDays, 5.2);

    // Excluidos explícitamente de activeScreenContext
    assert.equal(ctx.sensitivityAnalysis, undefined);
    assert.equal(ctx.rawDocumentText, undefined);
    assert.equal(ctx.madreUltimaAuditoria, undefined);
    assert.equal(ctx.reporte_estrategico, undefined);
    assert.equal(ctx.reporteEstrategico, undefined);
    assert.equal(ctx.fullAuditData, undefined);

    // Serialización del payload completo sin duplicar rawDocumentText en activeScreenContext
    const fullPayload = {
      suite: 'SeaCharter Core PRO',
      auditPayload
    };

    const cloned = safeCloneForJson(fullPayload);
    const serialized = JSON.stringify(cloned);

    // Comprobamos que rawDocumentText solo aparece una vez en el JSON total (en auditPayload.rawDocumentText)
    const matches = serialized.match(/GENCON 1994 CHARTER PARTY FULL TEXT/g);
    assert.equal(matches.length, 1, 'rawDocumentText no debe duplicarse dentro de activeScreenContext');
  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWindow;
  }
});

test('4. buildFlatActiveScreenContext usa #input-ballastDays y descarta #dist-ballast (millas náuticas)', async () => {
  const { extractDynamicAuditContext } = await import('../src/components/GlobalMadreDrawer.jsx');

  const originalDoc = globalThis.document;
  const originalWindow = globalThis.window;

  try {
    const mockElements = {
      '#cargo-qty': { value: '30000' },
      '#dist-ballast': { value: '2500' }, // Millas náuticas - NUNCA debe usarse como días
      '#input-ballastDays': { value: '6.5' } // Días de lastre correctos
    };

    globalThis.document = {
      getElementById: (id) => mockElements[`#${id}`] || null,
      querySelector: (sel) => mockElements[sel] || null,
      querySelectorAll: () => []
    };

    globalThis.window = {
      State: {
        cargoQty: 30000
        // Sin ballastDays en State para probar el fallback a DOM
      }
    };

    const auditPayload = extractDynamicAuditContext();
    assert.equal(auditPayload.activeScreenContext.ballastDays, 6.5);

    // Si tampoco existe #input-ballastDays, debe ser 0 y NO 2500
    delete mockElements['#input-ballastDays'];
    const fallbackZeroPayload = extractDynamicAuditContext();
    assert.equal(fallbackZeroPayload.activeScreenContext.ballastDays, 0);
  } finally {
    globalThis.document = originalDoc;
    globalThis.window = originalWindow;
  }
});
