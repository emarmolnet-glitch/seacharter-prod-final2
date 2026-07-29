import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const decisionesHtml = readFileSync(new URL('../decisiones.html', import.meta.url), 'utf8');

test('PARTE 1: DSS scenario logic performs shallow merge and stress test mutations without modifying context variables', () => {
  // Verify cargarEscenario function definition and logic in index.html
  assert.match(indexHtml, /function cargarEscenario\(tipo\)/, 'cargarEscenario must be defined in index.html');
  assert.match(indexHtml, /dssSimulationState = updatedState;/, 'cargarEscenario must set dssSimulationState in index.html');
  assert.match(indexHtml, /updatedState = \{ \.\.\.currentState, \.\.\.stressMutations \}/, 'cargarEscenario must perform shallow merge in index.html');

  // Verify same in decisiones.html
  assert.match(decisionesHtml, /function cargarEscenario\(tipo\)/, 'cargarEscenario must be defined in decisiones.html');
  assert.match(decisionesHtml, /dssSimulationState = updatedState;/, 'cargarEscenario must set dssSimulationState in decisiones.html');
  assert.match(decisionesHtml, /updatedState = \{ \.\.\.currentState, \.\.\.stressMutations \}/, 'cargarEscenario must perform shallow merge in decisiones.html');

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

  // Stress variables MUST BE SET ONLY in local dssSimulationState:
  assert.ok(fakeWindow.dssSimulationState, 'dssSimulationState must be populated');
  assert.ok(Number(fakeWindow.dssSimulationState.laycanDaysLeft) < 9, 'Riesgo scenario must reduce laycanDaysLeft in dssSimulationState below voyage days');
  assert.equal(Number(fakeWindow.dssSimulationState.loadRate), 3500, 'Riesgo scenario must stress loadRate in dssSimulationState to half (3500)');
  assert.ok(Number(fakeWindow.dssSimulationState.fleteEstimado) < Number(domState['input-breakEven']), 'Riesgo scenario must lower fleteEstimado in dssSimulationState below break-even');
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
