import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const decisionSupportModule = readFileSync(new URL('../src/DecisionSupportModule.js', import.meta.url), 'utf8');
const indexDocument = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const decisionesHtml = readFileSync(new URL('../decisiones.html', import.meta.url), 'utf8');
const indexHtml = `${indexDocument}\n${decisionSupportModule}`;

test('MEJORA 1: Estructura DOM de la Vista Comparativa (Split View / Tabla 3 Columnas)', () => {
  // 1. Panel de comparativa en DecisionSupportModule y decisiones.html
  assert.match(indexHtml, /id="panel-comparativo-dss"/, 'DecisionSupportModule/indexHtml must include id="panel-comparativo-dss"');
  assert.match(decisionesHtml, /id="panel-comparativo-dss"/, 'decisiones.html must include id="panel-comparativo-dss"');

  // 2. Encabezado con 3 columnas: Métrica | Situación Actual | Situación Óptima
  assert.match(indexHtml, /<th[^>]*>Métrica<\/th>/, 'Table header must define "Métrica" column');
  assert.match(indexHtml, /Situación Actual/, 'Table header must define "Situación Actual" column');
  assert.match(indexHtml, /Situación Óptima/, 'Table header must define "Situación Óptima" column');

  assert.match(decisionesHtml, /<th[^>]*>Métrica<\/th>/, 'decisiones.html must define "Métrica" column');
  assert.match(decisionesHtml, /Situación Actual/, 'decisiones.html must define "Situación Actual" column');
  assert.match(decisionesHtml, /Situación Óptima/, 'decisiones.html must define "Situación Óptima" column');

  // 3. Enfrentamiento cara a cara de las 3 métricas obligatorias:
  // - Margen de Laycan (días)
  assert.match(indexHtml, /Margen de Laycan \(días\)/, 'Must compare Margen de Laycan (días)');
  assert.match(decisionesHtml, /Margen de Laycan \(días\)/, 'decisiones.html must compare Margen de Laycan (días)');
  assert.match(indexHtml, /id="cmp-actual-buffer"/, 'Must have id="cmp-actual-buffer"');
  assert.match(indexHtml, /id="cmp-optimo-buffer"/, 'Must have id="cmp-optimo-buffer"');

  // - Ritmo de Operaciones (MT/día)
  assert.match(indexHtml, /Ritmo de Operaciones \(MT\/día\)/, 'Must compare Ritmo de Operaciones (MT/día)');
  assert.match(decisionesHtml, /Ritmo de Operaciones \(MT\/día\)/, 'decisiones.html must compare Ritmo de Operaciones (MT/día)');
  assert.match(indexHtml, /id="cmp-actual-loadrate"/, 'Must have id="cmp-actual-loadrate"');
  assert.match(indexHtml, /id="cmp-optimo-loadrate"/, 'Must have id="cmp-optimo-loadrate"');

  // - Rentabilidad (Margen Bruto / Beneficio)
  assert.match(indexHtml, /Rentabilidad \(Margen Bruto \/ Beneficio\)/, 'Must compare Rentabilidad (Margen Bruto / Beneficio)');
  assert.match(decisionesHtml, /Rentabilidad \(Margen Bruto \/ Beneficio\)/, 'decisiones.html must compare Rentabilidad (Margen Bruto / Beneficio)');
  assert.match(indexHtml, /id="cmp-actual-margen"/, 'Must have id="cmp-actual-margen"');
  assert.match(indexHtml, /id="cmp-optimo-margen"/, 'Must have id="cmp-optimo-margen"');
  assert.match(indexHtml, /id="cmp-actual-beneficio"/, 'Must have id="cmp-actual-beneficio"');
  assert.match(indexHtml, /id="cmp-optimo-beneficio"/, 'Must have id="cmp-optimo-beneficio"');
});

test('MEJORA 2: Botón Destacado "Aplicar Valores Óptimos al Proyecto"', () => {
  // 1. Presencia del botón en la sección comparativa y en la barra de control
  assert.match(indexHtml, /id="btn-aplicar-valores-optimos"/, 'Must have id="btn-aplicar-valores-optimos"');
  assert.match(indexHtml, /Aplicar Valores Óptimos al Proyecto/, 'Button must display text "Aplicar Valores Óptimos al Proyecto"');
  assert.match(indexHtml, /onclick="aplicarValoresOptimosAlProyecto\(\)"/, 'Button must trigger aplicarValoresOptimosAlProyecto()');

  assert.match(decisionesHtml, /id="btn-aplicar-valores-optimos"/, 'decisiones.html must have id="btn-aplicar-valores-optimos"');
  assert.match(decisionesHtml, /Aplicar Valores Óptimos al Proyecto/, 'decisiones.html must display text "Aplicar Valores Óptimos al Proyecto"');
  assert.match(decisionesHtml, /onclick="aplicarValoresOptimosAlProyecto\(\)"/, 'decisiones.html must trigger aplicarValoresOptimosAlProyecto()');
});

test('MEJORA 3: Función aplicarValoresOptimosAlProyecto actualiza permanentemente State, LocalStorage y la Calculadora', () => {
  // Definición de función en ambos archivos
  assert.match(indexHtml, /function aplicarValoresOptimosAlProyecto\(\)/, 'indexHtml must define aplicarValoresOptimosAlProyecto()');
  assert.match(decisionesHtml, /function aplicarValoresOptimosAlProyecto\(\)/, 'decisionesHtml must define aplicarValoresOptimosAlProyecto()');

  // Mocks para simular entorno completo de ejecución
  const storage = {};
  const mockLocalStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };

  const elementValues = {
    'rate-load': '5000',
    'rate-disch': '5000',
    'input-loadRate': '5000',
    'input-dischargeRate': '5000',
    'gc-cancel-date': '2026-10-15',
    'input-laycanDaysLeft': '10',
    'input-pol': 'Algeciras',
    'input-pod': 'Rotterdam',
    'input-cargoQty': '30000',
    'input-commodity': 'Acero',
    'input-fleteEstimado': '35',
    'input-breakEven': '25',
    'input-portDays': '12',
    'input-seaDays': '8'
  };

  const mockElements = {};
  const mockDocument = {
    getElementById: (id) => {
      if (!mockElements[id]) {
        mockElements[id] = {
          id,
          value: elementValues[id] || '',
          textContent: '',
          innerText: '',
          style: {},
          classList: {
            contains: () => false,
            add: () => {},
            remove: () => {},
            toggle: () => {}
          },
          dispatchEvent: () => true
        };
      }
      return mockElements[id];
    }
  };

  const mockWindow = {
    State: {
      loadRate: 5000,
      dischRate: 5000,
      cancellingDate: '2026-10-15',
      laycanDaysLeft: 10
    },
    localStorage: mockLocalStorage,
    document: mockDocument,
    dssSimulationState: {
      loadRate: 6500,
      dischargeRate: 6500,
      cancellingDate: new Date('2026-10-25T00:00:00.000Z'),
      laycanDaysLeft: 18,
      breakEvenUnitario: 22.5
    },
    dssFormState: {},
    limpiarDssSimulationState: () => {},
    sincronizarFormularioDesdeEstado: () => {},
    generarAuditoriaOperativa: () => {},
    actualizarEstiloBotonesEscenario: () => {},
    dispatchEvent: () => true
  };

  // Extraer y ejecutar la función aplicarValoresOptimosAlProyecto
  const fnMatch = indexHtml.match(/function aplicarValoresOptimosAlProyecto\(\)[\s\S]*?\n\s{8}\}/);
  assert.ok(fnMatch, 'aplicarValoresOptimosAlProyecto function code found');

  const executeApply = new Function(
    'window',
    'document',
    'State',
    'localStorage',
    'dssSimulationState',
    'dssFormState',
    'limpiarDssSimulationState',
    'sincronizarFormularioDesdeEstado',
    'generarAuditoriaOperativa',
    'actualizarEstiloBotonesEscenario',
    `
    let showToast = () => {};
    let recalcularDiasPuerto = () => {};
    let syncGlobalStateToForms = () => {};
    let runEngine = () => {};
    ${fnMatch[0]}
    aplicarValoresOptimosAlProyecto();
    `
  );

  executeApply(
    mockWindow,
    mockDocument,
    mockWindow.State,
    mockLocalStorage,
    mockWindow.dssSimulationState,
    mockWindow.dssFormState,
    mockWindow.limpiarDssSimulationState,
    mockWindow.sincronizarFormularioDesdeEstado,
    mockWindow.generarAuditoriaOperativa,
    mockWindow.actualizarEstiloBotonesEscenario
  );

  // Verificaciones de persistencia en State
  assert.equal(mockWindow.State.loadRate, 6500, 'State.loadRate debe actualizarse al valor óptimo (6500)');
  assert.equal(mockWindow.State.dischRate, 6500, 'State.dischRate debe actualizarse al valor óptimo (6500)');
  assert.equal(mockWindow.State.laycanDaysLeft, 18, 'State.laycanDaysLeft debe actualizarse a 18');
  assert.equal(mockWindow.State.cancellingDate, '2026-10-25', 'State.cancellingDate debe actualizarse con la fecha óptima en formato YYYY-MM-DD');

  // Verificaciones de persistencia en LocalStorage
  assert.equal(mockLocalStorage.getItem('calculator_rate_load'), '6500', 'LocalStorage debe persistir calculator_rate_load = 6500');
  assert.equal(mockLocalStorage.getItem('calculator_rate_disch'), '6500', 'LocalStorage debe persistir calculator_rate_disch = 6500');
  assert.equal(mockLocalStorage.getItem('calculator_cancelling_date'), '2026-10-25', 'LocalStorage debe persistir calculator_cancelling_date = 2026-10-25');
  assert.ok(mockLocalStorage.getItem('dss_optimal_applied'), 'LocalStorage debe registrar el snapshot dss_optimal_applied');

  // Verificaciones en los inputs del DOM
  assert.equal(mockDocument.getElementById('rate-load').value, 6500, 'DOM input rate-load debe reflejar 6500');
  assert.equal(mockDocument.getElementById('rate-disch').value, 6500, 'DOM input rate-disch debe reflejar 6500');
  assert.equal(mockDocument.getElementById('gc-cancel-date').value, '2026-10-25', 'DOM input gc-cancel-date debe reflejar 2026-10-25');
});

test('MEJORA 4: Función renderizarComparativaEscenarios calcula y rellena las 3 columnas con métricas lado a lado', () => {
  const actualState = {
    loadRate: 5000,
    dischargeRate: 5000,
    cargoQty: 30000,
    estimatedVoyageDays: 8,
    laycanDaysLeft: 10,
    cancellingDate: new Date('2026-10-20T00:00:00.000Z'),
    fleteUnitario: 35,
    breakEvenUnitario: 25
  };

  const optimoState = {
    loadRate: 6500,
    dischargeRate: 6500,
    cargoQty: 30000,
    estimatedVoyageDays: 8,
    laycanDaysLeft: 18,
    cancellingDate: new Date('2026-10-28T00:00:00.000Z'),
    fleteUnitario: 35,
    breakEvenUnitario: 22.5
  };

  const domStore = {};
  const mockDocument = {
    getElementById: (id) => {
      if (!domStore[id]) {
        domStore[id] = { id, textContent: '' };
      }
      return domStore[id];
    }
  };

  const renderFnMatch = indexHtml.match(/function renderizarComparativaEscenarios\([\s\S]*?\n\s{8}\}/);
  assert.ok(renderFnMatch, 'renderizarComparativaEscenarios found');

  const executeRender = new Function(
    'document',
    'actualState',
    'optimoState',
    `
    let differenceInDays = (d1, d2) => Math.round((d1.getTime() - d2.getTime()) / 86400000);
    let calcularEscenarioOptimoDesdeBase = (s) => s;
    ${renderFnMatch[0]}
    renderizarComparativaEscenarios(actualState, optimoState);
    `
  );

  executeRender(mockDocument, actualState, optimoState);

  // Verificar Ritmos de Operaciones
  assert.match(domStore['cmp-actual-loadrate'].textContent, /5[.,]?000/, 'Ritmo carga actual debe ser 5.000 MT/d');
  assert.match(domStore['cmp-optimo-loadrate'].textContent, /6[.,]?500/, 'Ritmo carga óptimo debe ser 6.500 MT/d (+30%)');

  // Verificar Port Days reducidos
  assert.equal(domStore['cmp-actual-portdays'].textContent, '12.0 d', 'Actual port days: 30000/5000 + 30000/5000 = 12.0 días');
  assert.equal(domStore['cmp-optimo-portdays'].textContent, '9.2 d', 'Optimo port days: 30000/6500 + 30000/6500 = 9.2 días');

  // Verificar Rentabilidad
  assert.equal(domStore['cmp-actual-margen'].textContent, '28.6%', 'Margen bruto actual: (35-25)/35 = 28.6%');
  assert.equal(domStore['cmp-optimo-margen'].textContent, '35.7%', 'Margen bruto óptimo: (35-22.5)/35 = 35.7%');
  assert.equal(domStore['cmp-actual-breakeven'].textContent, '$25.00 / MT', 'Break-even actual $25.00 / MT');
  assert.equal(domStore['cmp-optimo-breakeven'].textContent, '$22.50 / MT', 'Break-even óptimo $22.50 / MT');
});
