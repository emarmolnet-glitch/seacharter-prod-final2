import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexDocument = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const decisionSupportModule = readFileSync(new URL('../src/DecisionSupportModule.js', import.meta.url), 'utf8');
const indexHtml = `${indexDocument}\n${decisionSupportModule}`;
const decisionesHtml = readFileSync(new URL('../decisiones.html', import.meta.url), 'utf8');

test('PARTE 1: DSS scenario logic performs shallow merge and stress test mutations without modifying context variables', () => {
  // Verify cargarEscenario function definition and logic in index.html
  assert.match(indexHtml, /function cargarEscenario\(tipo\)/, 'cargarEscenario must be defined in index.html');
  assert.match(indexHtml, /limpiarDssSimulationState\(\);/, 'cargarEscenario must purge dssSimulationState first in index.html');
  assert.match(indexHtml, /updatedState = \{ \.\.\.baseState, \.\.\.stressMutations \}/, 'cargarEscenario must apply mutations on clean baseState in index.html');

  // Verify same in decisiones.html
  assert.match(decisionesHtml, /function cargarEscenario\(tipo\)/, 'cargarEscenario must be defined in decisiones.html');
  assert.match(decisionesHtml, /limpiarDssSimulationState\(\);/, 'cargarEscenario must purge dssSimulationState first in decisiones.html');
  assert.match(decisionesHtml, /updatedState = \{ \.\.\.baseState, \.\.\.stressMutations \}/, 'cargarEscenario must apply mutations on clean baseState in decisiones.html');

  // Extract helper functions needed for DSS execution
  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  // Mock DOM elements and execute test
  const domState = {
    'input-pol': 'Valencia',
    'input-pod': 'Santos',
    'input-cargoQty': '35000',
    'input-commodity': 'Bobinas de Acero',
    'input-laycanDaysLeft': '12',
    'input-estimatedVoyageDays': '9',
    'input-loadRate': '7000',
    'input-dischargeRate': '7000',
    'input-portDays': '10',
    'input-seaDays': '9',
    'input-fleteEstimado': '35',
    'input-breakEven': '28'
  };

  const cachedElements = {};
  const fakeDocument = {
    getElementById: (id) => {
      if (!cachedElements[id]) {
        cachedElements[id] = {
          get value() { return domState[id] || ''; },
          set value(v) { domState[id] = String(v); },
          textContent: '',
          className: '',
          classList: { toggle: () => {} },
          style: {}
        };
      }
      return cachedElements[id];
    }
  };

  const fakeWindow = {};
  globalThis.window = fakeWindow;

  const evalContext = new Function(
    'document',
    `
    ${helpersCode}
    cargarEscenario('riesgo');
    return document;
    `
  );

  // Evaluate scenario 'riesgo'
  evalContext(fakeDocument);

  // DOM Input variables MUST REMAIN COMPLETELY UNTOUCHED (No DOM mutation / Global state overwrite):
  assert.equal(domState['input-pol'], 'Valencia', 'POL input must remain unchanged');
  assert.equal(domState['input-pod'], 'Santos', 'POD input must remain unchanged');
  assert.equal(domState['input-cargoQty'], '35000', 'Cargo quantity input must remain unchanged');
  assert.equal(domState['input-commodity'], 'Bobinas de Acero', 'Commodity input must remain unchanged');
  assert.equal(domState['input-laycanDaysLeft'], '12', 'Original laycanDaysLeft DOM input must remain untouched');
  assert.equal(domState['input-loadRate'], '7000', 'Original loadRate DOM input must remain untouched');
  assert.equal(domState['input-fleteEstimado'], '35', 'Original fleteEstimado DOM input must remain untouched');

  // Baseline 1:1 evaluation (Escenario Riesgo = Realidad Actual without artificial penalties)
  assert.ok(fakeWindow.dssSimulationState, 'dssSimulationState must be populated');
  assert.equal(Number(fakeWindow.dssSimulationState.laycanDaysLeft), 12, 'Riesgo scenario must reflect exact 1:1 laycanDaysLeft from baseline (12)');
  assert.equal(Number(fakeWindow.dssSimulationState.loadRate), 7000, 'Riesgo scenario must reflect exact 1:1 loadRate from baseline (7000)');
  assert.equal(Number(fakeWindow.dssSimulationState.fleteEstimado), 35, 'Riesgo scenario must reflect exact 1:1 fleteEstimado from baseline (35)');
  assert.ok(fakeWindow.dssSimulationState.cancellingDate instanceof Date, 'dssSimulationState must store simulated cancellingDate Date object');

  // Scenario Cleanup / Context Restoration:
  fakeWindow.limpiarEscenario();
  assert.equal(fakeWindow.dssSimulationState, null, 'limpiarEscenario must reset dssSimulationState to null');
});

test('PARTE 2: Mathematical formulas (Unit vs Total Freight, Derived Port Days) and Card Elements', () => {
  // Check Card 1 (Laycan): ETA POL, Cancelling Date, Buffer
  assert.match(indexHtml, /id="val-laycan-eta"/, 'index.html must include val-laycan-eta');
  assert.match(indexHtml, /id="val-laycan-cancelling"/, 'index.html must include val-laycan-cancelling');
  assert.match(indexHtml, /id="val-laycan-buffer"/, 'index.html must include val-laycan-buffer');

  // Check Card 2 (Port Operations): POL and POD blocks + totalizer
  assert.match(indexHtml, /Puerto Carga \(POL\)/, 'index.html must include POL Port block');
  assert.match(indexHtml, /Puerto Descarga \(POD\)/, 'index.html must include POD Port block');
  assert.match(indexHtml, /id="val-loadrate-current"/, 'index.html must include POL load rate element');
  assert.match(indexHtml, /id="val-dischargerate-current"/, 'index.html must include POD discharge rate element');
  assert.match(indexHtml, /id="val-portdays-total"/, 'index.html must include Total Port Days element');

  // Check Card 3 (Financial Health): USD/MT unit breakdown
  assert.match(indexHtml, /id="val-financial-flete-unit"/, 'index.html must include val-financial-flete-unit element');
  assert.match(indexHtml, /id="val-financial-breakeven-unit"/, 'index.html must include val-financial-breakeven-unit element');

  // Verify strict mathematical derivation of port days and financial totals
  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  const mockDomElements = {};
  const mockDocument = {
    getElementById: (id) => {
      if (!mockDomElements[id]) {
        mockDomElements[id] = {
          textContent: '',
          className: '',
          innerHTML: '',
          classList: { toggle: () => {} },
          style: {}
        };
      }
      return mockDomElements[id];
    }
  };

  const fakeWindow = {};
  globalThis.window = fakeWindow;

  const evalFn = new Function(
    'document',
    'state',
    `
    ${helpersCode}
    generarAuditoriaOperativa(state);
    return document;
    `
  );

  // Test Case with 10,000 MT, POL rate 5000 MT/d (2.0 d), POD rate 5000 MT/d (2.0 d), Unit Freight $30/MT, Break-Even $20/MT
  const testState = {
    pol: 'Rotterdam',
    pod: 'Houston',
    cargoQty: 10000,
    commodity: 'Siderúrgico / Carga General',
    laycanDaysLeft: 10,
    estimatedVoyageDays: 5,
    loadRate: 5000,
    dischargeRate: 5000,
    portDays: 0,
    seaDays: 5,
    fleteEstimado: 30, // Unit freight $/MT
    breakEven: 20 // Unit break-even $/MT
  };

  evalFn(mockDocument, testState);

  // 1. Port Days MUST BE derived as (10000/5000) + (10000/5000) = 2.0 + 2.0 = 4.0 días
  assert.equal(mockDomElements['val-portdays-total'].textContent, '4.0 días', 'Total port days must be strictly derived (4.0 días)');
  assert.equal(mockDomElements['val-loadrate-days'].textContent, '2.0 días', 'POL days must be 2.0 días');
  assert.equal(mockDomElements['val-dischargerate-days'].textContent, '2.0 días', 'POD days must be 2.0 días');

  // 2. Financial totals MUST BE fleteUnitario * cargoQty = 30 * 10000 = $300,000 Total, Unit = $30.00 / MT
  assert.equal(mockDomElements['val-financial-flete-unit'].textContent, '$30.00 / MT', 'Unit freight must equal received unit freight ($30.00 / MT)');
  assert.equal(mockDomElements['val-financial-flete'].textContent, '$300,000.00', 'Total freight must be fleteUnitario * cargoQty ($300,000.00)');
  assert.equal(mockDomElements['val-financial-breakeven-unit'].textContent, '$20.00 / MT', 'Unit break-even must equal received unit break-even ($20.00 / MT)');
  assert.equal(mockDomElements['val-financial-breakeven'].textContent, '$200,000.00', 'Total break-even must be breakEvenUnitario * cargoQty ($200,000.00)');
});

test('PARTE 3: Commercial Recommendation Engine uses strict chartering catalogs (FIO/SHINC/WIBON terms)', () => {
  // Verify catalog terms present in generarAuditoriaOperativa logic
  assert.match(indexHtml, /WIBON WIPON WIFPON WICCON/, 'index.html recommendation engine must suggest N.O.R. clauses');
  assert.match(indexHtml, /SSHINC|SHINC/, 'index.html recommendation engine must suggest Laytime SHINC/SSHINC terms');
  assert.match(indexHtml, /FIOS|FIOT|FIOST|FILO/, 'index.html recommendation engine must suggest Cargo Handling FIO terms');

  // Test execution of generarAuditoriaOperativa generating structured recommendations
  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  const mockDomElements = {};
  const mockDocument = {
    getElementById: (id) => {
      if (!mockDomElements[id]) {
        mockDomElements[id] = {
          textContent: '',
          className: '',
          innerHTML: '',
          classList: { toggle: () => {} },
          style: {}
        };
      }
      return mockDomElements[id];
    }
  };

  const fakeWindow = {};
  globalThis.window = fakeWindow;

  const evalFn = new Function(
    'document',
    'state',
    `
    ${helpersCode}
    generarAuditoriaOperativa(state);
    return document.getElementById('contenedor-recomendaciones');
    `
  );

  // Test Case: High Demurrage / Congestion Risk state
  const riskState = {
    pol: 'Rotterdam',
    pod: 'Houston',
    cargoQty: 2500,
    commodity: 'Siderúrgico / Carga General',
    laycanDaysLeft: 2, // Buffer < 3 -> Red
    estimatedVoyageDays: 5,
    loadRate: 200, // Very slow -> Yellow/Red
    dischargeRate: 200,
    portDays: 25,
    seaDays: 5,
    fleteEstimado: 20,
    breakEven: 30 // Loss -> Red
  };

  const resultContainer = evalFn(mockDocument, riskState);
  const renderedHTML = resultContainer.innerHTML;

  // Assert expected catalog terms are rendered
  assert.match(renderedHTML, /FIOS|FIOT|FIOST/, 'Recommendation output must contain Cargo terms (e.g. FIOS)');
  assert.match(renderedHTML, /SSHINC|SHINC/, 'Recommendation output must contain Laytime terms (e.g. SSHINC)');
  assert.match(renderedHTML, /WIBON WIPON WIFPON WICCON/, 'Recommendation output must contain N.O.R. clause');
});

test('PARTE 4: Isolated dssSimulationState, local cancellingDate rendering, and context restoration', () => {
  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  const domState = {
    'input-pol': 'Rotterdam',
    'input-pod': 'Houston',
    'input-cargoQty': '50000',
    'input-commodity': 'Siderúrgico / Carga General',
    'input-laycanDaysLeft': '10',
    'input-estimatedVoyageDays': '8',
    'input-loadRate': '5000',
    'input-dischargeRate': '5000',
    'input-portDays': '20',
    'input-seaDays': '8',
    'input-fleteEstimado': '35',
    'input-breakEven': '25'
  };

  const elements = {};
  const fakeDoc = {
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = {
          get value() { return domState[id] || ''; },
          set value(v) { domState[id] = String(v); },
          textContent: '',
          className: '',
          classList: { toggle: () => {}, add: () => {}, remove: () => {} },
          style: {}
        };
      }
      return elements[id];
    }
  };

  const globalState = {
    laycanEnd: '2026-08-15',
    cancellingDate: '2026-08-15'
  };

  const fakeWin = {
    State: globalState
  };
  globalThis.window = fakeWin;
  globalThis.State = globalState;

  const fn = new Function(
    'document',
    'window',
    'State',
    `
    ${helpersCode}
    window.dssSimulationState = dssSimulationState;
    window.cargarEscenarioRiesgo = cargarEscenarioRiesgo;
    window.cargarEscenarioOptimo = cargarEscenarioOptimo;
    window.limpiarEscenario = limpiarEscenario;
    window.desactivarEscenarios = desactivarEscenarios;
    window.toggleParametros = toggleParametros;
    window.actualizarDesdeFormulario = actualizarDesdeFormulario;
    window.generarAuditoriaOperativa = generarAuditoriaOperativa;

    cargarEscenarioRiesgo();
    return {
      dssSimulationState,
      getDssState: () => dssSimulationState,
      runClean: () => limpiarEscenario(),
      runToggle: () => toggleParametros(),
      runFormUpdate: () => actualizarDesdeFormulario()
    };
    `
  );

  const res = fn(fakeDoc, fakeWin, globalState);

  // 1. cargarEscenarioRiesgo creates isolated dssSimulationState
  assert.ok(res.getDssState(), 'cargarEscenarioRiesgo creates dssSimulationState');
  assert.ok(res.getDssState().cancellingDate instanceof Date, 'dssSimulationState contains simulated cancellingDate');

  // 2. Global state remains intact
  assert.equal(globalState.laycanEnd, '2026-08-15', 'State.laycanEnd must remain untouched');
  assert.equal(globalState.cancellingDate, '2026-08-15', 'State.cancellingDate must remain untouched');

  // 3. Card 1 rendered cancelling date using simulated cancellingDate
  const simCancellingStr = res.getDssState().cancellingDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  assert.equal(elements['val-laycan-cancelling'].textContent, simCancellingStr, 'Card 1 must render dssSimulationState.cancellingDate');

  // 4. Context Restoration (Cleanup)
  res.runClean();
  assert.equal(fakeWin.dssSimulationState, null, 'limpiarEscenario clears dssSimulationState to null');

  // 5. Card 1 re-rendered reading intact original cancelling date
  const originalDate = new Date('2026-08-15');
  const expectedOriginalStr = originalDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  assert.equal(elements['val-laycan-cancelling'].textContent, expectedOriginalStr, 'Card 1 must re-render from original intact State.cancellingDate after cleanup');
});

test('PARTE 5: Critical DSS Bug Fixes - State Purge, Rate Clamping (min 1500 MT/d), and Alerta Neutral Laycan Sync', () => {
  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  const domState = {
    'input-pol': 'Rotterdam',
    'input-pod': 'Houston',
    'input-cargoQty': '10000',
    'input-commodity': 'Granel Agrícola',
    'input-laycanDaysLeft': '10',
    'input-estimatedVoyageDays': '8',
    'input-loadRate': '1800',
    'input-dischargeRate': '1800',
    'input-portDays': '11.1',
    'input-seaDays': '8',
    'input-fleteEstimado': '35',
    'input-breakEven': '25'
  };

  const elements = {};
  const fakeDoc = {
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = {
          get value() { return domState[id] || ''; },
          set value(v) { domState[id] = String(v); },
          textContent: '',
          className: '',
          classList: { toggle: () => {}, add: () => {}, remove: () => {} },
          style: {}
        };
      }
      return elements[id];
    }
  };

  const neutralCancellingDate = new Date(Date.now() + (12 * 86400000));
  const globalState = {
    laycanEnd: neutralCancellingDate.toISOString(),
    cancellingDate: neutralCancellingDate.toISOString()
  };

  const fakeWin = {
    State: globalState
  };
  globalThis.window = fakeWin;
  globalThis.State = globalState;

  const evalContext = new Function(
    'document',
    'window',
    'State',
    `
    ${helpersCode}
    window.dssSimulationState = dssSimulationState;
    window.dssFormState = dssFormState;
    window.cargarEscenario = cargarEscenario;
    window.cargarEscenarioRiesgo = cargarEscenarioRiesgo;
    window.cargarEscenarioAlerta = cargarEscenarioAlerta;
    window.cargarEscenarioOptimo = cargarEscenarioOptimo;
    window.limpiarEscenario = limpiarEscenario;
    window.getDSSCurrentState = getDSSCurrentState;
    window.actualizarDesdeFormulario = actualizarDesdeFormulario;
    `
  );

  evalContext(fakeDoc, fakeWin, globalState);

  // 1. Test 1:1 Baseline Reality in Riesgo scenario (Rate 1800 MT/d is preserved 1:1)
  fakeWin.cargarEscenarioRiesgo();
  const riskState = fakeWin.dssSimulationState;
  assert.equal(riskState.loadRate, 1800, 'Escenario Riesgo must reflect exact 1:1 loadRate from base state (1800 MT/day)');
  assert.equal(riskState.dischargeRate, 1800, 'Escenario Riesgo must reflect exact 1:1 dischargeRate from base state (1800 MT/day)');

  // Verify port days for 10k MT with 1800 MT/d rate: 10000/1800 + 10000/1800 = ~11.1 port days
  assert.ok(riskState.portDays < 20, 'Port days for 10k MT must be realistic (< 20 days)');

  // 2. Test Escenario Alerta: Projection of improvement over reality (1800 * 1.15 = 2070 MT/d)
  fakeWin.cargarEscenarioAlerta();
  const alertaState = fakeWin.dssSimulationState;

  assert.equal(alertaState.loadRate, 2070, 'Alerta loadRate must be calculated as improvement projection (1800 * 1.15 = 2070)');

  // 3. Test Laycan Visual Sync in Escenario Alerta:
  assert.equal(elements['badge-laycan-status'].textContent, 'NEUTRAL', 'Card 1 in Escenario Alerta must display NEUTRAL status');
  const expectedCancellingLabel = neutralCancellingDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  assert.equal(elements['val-laycan-cancelling'].textContent, expectedCancellingLabel, 'Card 1 in Escenario Alerta must display the global cancelling date');
});

test('PARTE 6: Reactive dssFormState, Two-Way Data Binding, and Card Synchronization', () => {
  const domState = {
    'input-pol': 'Rotterdam',
    'input-pod': 'Houston',
    'input-cargoQty': '50000',
    'input-commodity': 'Siderúrgico / Carga General',
    'input-laycanDaysLeft': '10',
    'input-estimatedVoyageDays': '8',
    'input-loadRate': '5000',
    'input-dischargeRate': '5000',
    'input-portDays': '20',
    'input-seaDays': '8',
    'input-fleteEstimado': '35',
    'input-breakEven': '25'
  };

  const elements = {};
  const fakeDoc = {
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = {
          id,
          get value() { return domState[id] !== undefined ? domState[id] : ''; },
          set value(v) { domState[id] = String(v); },
          textContent: '',
          classList: { toggle: () => {}, remove: () => {}, add: () => {} },
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {}
        };
      }
      return elements[id];
    }
  };

  const fakeWin = {
    addEventListener: () => {},
    removeEventListener: () => {},
    State: { cancellingDate: '2026-08-09' }
  };
  globalThis.window = fakeWin;

  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  const evalContext = new Function(
    'document',
    'window',
    `
    ${helpersCode}
    actualizarDesdeFormulario();
    `
  );

  evalContext(fakeDoc, fakeWin);

  // 1. Verify initial calculation: 50000 / 5000 + 50000 / 5000 = 10 + 10 = 20 port days
  assert.ok(fakeWin.dssFormState, 'dssFormState must be initialized');
  assert.equal(domState['input-portDays'], '20.0', 'Initial port days input must be 20.0');

  // 2. Direct input-portDays mapping (gross division recalculations eliminated as per source-of-truth requirement)
  domState['input-loadRate'] = '2500';
  domState['input-portDays'] = '30.0';
  fakeWin.actualizarDesdeFormulario();

  assert.equal(domState['input-portDays'], '30.0', 'Modifying input-portDays to 30.0 must update input-portDays');
  assert.equal(fakeWin.dssFormState.loadRate, 2500, 'dssFormState.loadRate must reflect 2500');
  assert.equal(fakeWin.dssFormState.portDays, 30, 'dssFormState.portDays must reflect 30');

  // 3. Verify Card 2 (Port Operations) total port days element updated in real-time
  assert.equal(elements['val-portdays-total'].textContent, '30.0 días', 'Card 2 total port days must reflect 30.0 días in real-time');
});

test('PARTE 7: Refactorización Interfaz DSS - Tab Situación Actual, Paneles Colapsables (Acordeones) y Preservación de Layout Inferior', () => {
  // 1. Verify "Situación Actual" tab button in index.html and decisiones.html
  assert.match(indexHtml, /id="btn-tab-actual"/, 'index.html must include btn-tab-actual button');
  assert.match(indexHtml, /cargarEscenario\('actual'\)/, 'btn-tab-actual must trigger cargarEscenario("actual") in index.html');
  assert.match(indexHtml, /Situación Actual/, 'index.html must display label "Situación Actual"');

  assert.match(decisionesHtml, /id="btn-tab-actual"/, 'decisiones.html must include btn-tab-actual button');
  assert.match(decisionesHtml, /cargarEscenario\('actual'\)/, 'btn-tab-actual must trigger cargarEscenario("actual") in decisiones.html');
  assert.match(decisionesHtml, /Situación Actual/, 'decisiones.html must display label "Situación Actual"');

  // 2. Verify Collapsible Accordion Panels ("Variables del Viaje" & "Calculadora de Fletes")
  assert.match(indexHtml, /id="accordion-section-variables"/, 'index.html must include accordion section for variables');
  assert.match(indexHtml, /id="accordion-section-fletes"/, 'index.html must include accordion section for fletes');
  assert.match(indexHtml, /id="btn-toggle-variables"/, 'index.html must include toggle button for variables accordion');
  assert.match(indexHtml, /id="btn-toggle-fletes"/, 'index.html must include toggle button for fletes accordion');
  assert.match(indexHtml, /id="icon-accordion-variables"/, 'index.html must include chevron icon for variables accordion');
  assert.match(indexHtml, /id="icon-accordion-fletes"/, 'index.html must include chevron icon for fletes accordion');
  assert.match(indexHtml, /function toggleAccordion\(nombre\)/, 'index.html must define toggleAccordion helper function');

  assert.match(decisionesHtml, /id="accordion-section-variables"/, 'decisiones.html must include accordion section for variables');
  assert.match(decisionesHtml, /id="accordion-section-fletes"/, 'decisiones.html must include accordion section for fletes');
  assert.match(decisionesHtml, /id="btn-toggle-variables"/, 'decisiones.html must include toggle button for variables accordion');
  assert.match(decisionesHtml, /id="btn-toggle-fletes"/, 'decisiones.html must include toggle button for fletes accordion');
  assert.match(decisionesHtml, /id="icon-accordion-variables"/, 'decisiones.html must include chevron icon for variables accordion');
  assert.match(decisionesHtml, /id="icon-accordion-fletes"/, 'decisiones.html must include chevron icon for fletes accordion');

  // 3. Verify Bottom Layout Preservation ("Motor de Recomendaciones Comerciales" and "Distribución de Tiempo Operativo")
  assert.match(indexHtml, /Motor de Recomendaciones Comerciales/, 'index.html must preserve Motor de Recomendaciones Comerciales in bottom layout');
  assert.match(indexHtml, /Distribución de Tiempo Operativo/, 'index.html must preserve Distribución de Tiempo Operativo in bottom layout');
  assert.match(decisionesHtml, /Motor de Recomendaciones Comerciales/, 'decisiones.html must preserve Motor de Recomendaciones Comerciales in bottom layout');
  assert.match(decisionesHtml, /Distribución de Tiempo Operativo/, 'decisiones.html must preserve Distribución de Tiempo Operativo in bottom layout');

  // 4. Test "Situación Actual" scenario logic: clears dssSimulationState and uses baseline dssFormState
  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  const domState = {
    'input-pol': 'Bilbao',
    'input-pod': 'Veracruz',
    'input-cargoQty': '40000',
    'input-commodity': 'Granel Mineral',
    'input-laycanDaysLeft': '14',
    'input-estimatedVoyageDays': '10',
    'input-loadRate': '6000',
    'input-dischargeRate': '6000',
    'input-portDays': '13.3',
    'input-seaDays': '10',
    'input-fleteEstimado': '42',
    'input-breakEven': '30'
  };

  const elements = {};
  const fakeDoc = {
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = {
          id,
          get value() { return domState[id] !== undefined ? domState[id] : ''; },
          set value(v) { domState[id] = String(v); },
          textContent: '',
          className: '',
          classList: { toggle: () => {}, remove: () => {}, add: () => {}, contains: () => false },
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {}
        };
      }
      return elements[id];
    }
  };

  const fakeWin = {
    addEventListener: () => {},
    removeEventListener: () => {},
    State: { cancellingDate: '2026-08-20' }
  };
  globalThis.window = fakeWin;

  const evalContext = new Function(
    'document',
    'window',
    `
    ${helpersCode}
    window.cargarEscenario = cargarEscenario;
    window.limpiarDssSimulationState = limpiarDssSimulationState;
    window.getDSSCurrentState = getDSSCurrentState;
    `
  );

  evalContext(fakeDoc, fakeWin);

  // First run scenario 'riesgo' to populate simulation state
  fakeWin.cargarEscenario('riesgo');
  assert.ok(fakeWin.dssSimulationState, 'dssSimulationState must be active for Riesgo scenario');

  // Then switch to "Situación Actual" tab ('actual')
  fakeWin.cargarEscenario('actual');

  // In Situación Actual, dssSimulationState MUST BE NULL (strictly rendering globalState without simulation modifiers)
  assert.equal(fakeWin.dssSimulationState, null, 'In Situación Actual tab, dssSimulationState must be strictly null');
  assert.ok(fakeWin.dssFormState, 'dssFormState must be active');
  assert.equal(fakeWin.dssFormState.pol, 'Bilbao', 'dssFormState must reflect baseline POL (Bilbao)');
  assert.equal(fakeWin.dssFormState.cargoQty, 40000, 'dssFormState must reflect baseline cargo quantity (40000)');
  });

  test('PARTE 8: Critical DSS Business Logic Fixes - Absolute Date Math, Relative Scenarios, and Situación Actual Input Lockdown', () => {
  const domState = {
    'input-pol': 'Rotterdam',
    'input-pod': 'Houston',
    'input-cargoQty': '50000',
    'input-commodity': 'Siderúrgico / Carga General',
    'input-laycanDaysLeft': '11',
    'input-estimatedVoyageDays': '8',
    'input-loadRate': '5000',
    'input-dischargeRate': '5000',
    'input-portDays': '20',
    'input-seaDays': '8',
    'input-fleteEstimado': '35',
    'input-breakEven': '25'
  };

  const elements = {};
  const fakeDoc = {
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = {
          id,
          disabled: false,
          get value() { return domState[id] !== undefined ? domState[id] : ''; },
          set value(v) { domState[id] = String(v); },
          textContent: '',
          className: '',
          classList: { toggle: () => {}, remove: () => {}, add: () => {}, contains: () => false },
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {}
        };
      }
      return elements[id];
    }
  };

  const fakeWin = {
    addEventListener: () => {},
    removeEventListener: () => {},
    State: { cancellingDate: new Date('2026-08-09T00:00:00Z') }
  };
  globalThis.window = fakeWin;

  const helperStart = indexHtml.indexOf('function determinarTerminoCargo(commodity)');
  const helperEnd = indexHtml.indexOf('function buildAuditHTMLTemplate', helperStart);
  const helpersCode = indexHtml.slice(helperStart, helperEnd);

  const evalContext = new Function(
    'document',
    'window',
    `
    ${helpersCode}
    window.generarAuditoriaOperativa = generarAuditoriaOperativa;
    window.cargarEscenario = cargarEscenario;
    window.actualizarEstiloBotonesEscenario = actualizarEstiloBotonesEscenario;
    window.bloquearInputsSituacionActual = bloquearInputsSituacionActual;
    window.differenceInDays = differenceInDays;
    `
  );

  evalContext(fakeDoc, fakeWin);

  // 1. Test Absolute Date Math (differenceInDays):
  const eta = new Date('2026-08-06T00:00:00Z');
  const cancelling = new Date('2026-08-09T00:00:00Z');
  const netBuffer = fakeWin.differenceInDays(cancelling, eta);
  assert.equal(netBuffer, 3, 'Difference between 2026-08-09 and 2026-08-06 must strictly equal 3 days (Net Buffer)');

  // Test Audit execution with cancelling 09/08 and ETA 06/08
  const testState = {
    cargoQty: 50000,
    commodity: 'Carga General',
    estimatedVoyageDays: 8,
    laycanDaysLeft: 11,
    cancellingDate: cancelling,
    etaDate: eta,
    loadRate: 5000,
    dischargeRate: 5000,
    fleteEstimado: 35,
    breakEven: 25
  };
  fakeWin.generarAuditoriaOperativa(testState);
  assert.equal(elements['val-laycan-buffer'].textContent, '3.0 días', 'Card 1 Buffer Net display must show strictly 3.0 days derived from Date difference');

  // 2. Test Relative Scenarios (Freight Rate Intact & Relative Improvement):
  // Baseline: Freight = $35/MT, BreakEven = $25/MT -> Margin = (35-25)/35 = 28.57%
  fakeWin.cargarEscenario('optimo');
  const optimoState = fakeWin.dssSimulationState;

  assert.equal(optimoState.fleteUnitario, 35, 'Escenario Óptimo must keep base negotiated unit freight rate intact (35)');
  assert.equal(optimoState.fleteEstimado, 35, 'Escenario Óptimo must keep base negotiated estimated freight intact (35)');
  assert.equal(optimoState.loadRate, 6500, 'Escenario Óptimo must apply +30% load rate efficiency over base 5000 (6500 MT/d)');
  assert.equal(optimoState.dischargeRate, 6500, 'Escenario Óptimo must apply +30% discharge rate efficiency over base 5000 (6500 MT/d)');
  assert.equal(optimoState.breakEvenUnitario, 22.5, 'Escenario Óptimo must lower break-even due to despatch/efficiency savings (25 * 0.90 = 22.50)');

  const baseMargin = (35 - 25) / 35;
  const optimoMargin = (optimoState.fleteUnitario - optimoState.breakEvenUnitario) / optimoState.fleteUnitario;
  assert.ok(optimoMargin > baseMargin, 'Escenario Óptimo margin must improve over baseline (35.71% > 28.57%)');

  // 3. Test Situación Actual Input Lockdown:
  fakeWin.cargarEscenario('actual');
  assert.equal(elements['input-pol'].disabled, true, 'input-pol must be disabled in Situación Actual');
  assert.equal(elements['input-cargoQty'].disabled, true, 'input-cargoQty must be disabled in Situación Actual');
  assert.equal(elements['input-fleteEstimado'].disabled, true, 'input-fleteEstimado must be disabled in Situación Actual');

  // Switch back to simulation tab ('riesgo' / 'optimo')
  fakeWin.cargarEscenario('optimo');
  assert.equal(elements['input-pol'].disabled, false, 'input-pol must be enabled in simulation scenario');
  assert.equal(elements['input-cargoQty'].disabled, false, 'input-cargoQty must be enabled in simulation scenario');
  });
