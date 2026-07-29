import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const decisionesHtml = readFileSync(new URL('../decisiones.html', import.meta.url), 'utf8');

test('REQUERIMIENTO 1: Presencia de botones de acción principal "Fijar Condiciones Definitivas" y "Contrato Aceptado por Cliente"', () => {
  // 1. Botón "Fijar Condiciones Definitivas" en index.html (encabezado y panel de parámetros)
  assert.match(indexHtml, /id="btn-fijar-condiciones-top"/, 'index.html debe incluir el botón btn-fijar-condiciones-top');
  assert.match(indexHtml, /id="btn-fijar-condiciones"/, 'index.html debe incluir el botón btn-fijar-condiciones');
  assert.match(indexHtml, /Fijar Condiciones Definitivas/, 'index.html debe mostrar la etiqueta Fijar Condiciones Definitivas');

  // 2. Botón "Fijar Condiciones Definitivas" en decisiones.html
  assert.match(decisionesHtml, /id="btn-fijar-condiciones-top"/, 'decisiones.html debe incluir el botón btn-fijar-condiciones-top');
  assert.match(decisionesHtml, /id="btn-fijar-condiciones"/, 'decisiones.html debe incluir el botón btn-fijar-condiciones');
  assert.match(decisionesHtml, /Fijar Condiciones Definitivas/, 'decisiones.html debe mostrar la etiqueta Fijar Condiciones Definitivas');

  // 3. Botones "Contrato Aceptado por Cliente" en el EDITOR (GENCON y ASBATANKVOY)
  assert.match(indexHtml, /id="btn-accept-contract-gencon"/, 'index.html debe incluir btn-accept-contract-gencon');
  assert.match(indexHtml, /id="btn-accept-contract-asbatankvoy"/, 'index.html debe incluir btn-accept-contract-asbatankvoy');
  assert.match(indexHtml, /Contrato Aceptado por Cliente/, 'index.html debe contener el texto Contrato Aceptado por Cliente');
});

test('REQUERIMIENTO 2: Sincronización Inversa (Reverse Sync) y actualización del estado global', () => {
  assert.match(indexHtml, /function fijarCondicionesDefinitivas\(\)/, 'fijarCondicionesDefinitivas debe estar definida en index.html');
  assert.match(indexHtml, /window\.fijarCondicionesDefinitivas = fijarCondicionesDefinitivas;/, 'fijarCondicionesDefinitivas debe exponerse en window');

  // Contexto simulado para probar fijarCondicionesDefinitivas
  const fakeState = {
    loadRate: 2000,
    dischRate: 2000,
    freightSell: 45.5,
    cargo: 40000,
    pol: 'Bilbao',
    pod: 'Genoa'
  };

  const fakeDssState = {
    loadRate: 6500,
    dischargeRate: 7200,
    fleteEstimado: 48.0,
    fleteUnitario: 48.0,
    cargoQty: 40000,
    pol: 'Bilbao',
    pod: 'Genoa'
  };

  const domElements = {
    'rate-load': { value: '2000' },
    'rate-disch': { value: '2000' },
    'freight-sell': { value: '45.5' },
    'gc-freight-val': { value: '45.5' },
    'gc-laytime-load-val': { value: '2000' },
    'gc-laytime-disch-val': { value: '2000' },
    'asb-freight-val': { value: '45.5' },
    'asb-laytime-val': { value: '48' },
    'panel-parametros': { classList: { contains: () => false, add: () => {}, remove: () => {} }, style: {} }
  };

  const fakeDoc = {
    getElementById: (id) => domElements[id] || null
  };

  const fakeWin = {
    State: { ...fakeState },
    getDSSCurrentState: () => ({ ...fakeDssState }),
    dssFormState: { ...fakeDssState },
    SeaCharterStore: { set: (obj) => Object.assign(fakeWin.State, obj) },
    limpiarDssSimulationState: () => { fakeWin.dssSimulationState = null; },
    cargarEscenario: () => {},
    syncGencon: () => {},
    syncAsbatankvoy: () => {},
    generateFixtureRecapPDF: async () => {},
    fetch: async () => ({ ok: true, status: 200 })
  };

  globalThis.window = fakeWin;
  globalThis.State = fakeWin.State;
  globalThis.SeaCharterStore = fakeWin.SeaCharterStore;

  // Extraer código de fijarCondicionesDefinitivas
  const startIdx = indexHtml.indexOf('async function fijarCondicionesDefinitivas()');
  const endIdx = indexHtml.indexOf('window.fijarCondicionesDefinitivas = fijarCondicionesDefinitivas;', startIdx);
  assert.notEqual(startIdx, -1, 'fijarCondicionesDefinitivas debe estar presente');

  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('document', 'fetch', `${fnSource}; return fijarCondicionesDefinitivas();`);

  // Evaluar función
  evalFn(fakeDoc, fakeWin.fetch);

  // Comprobar la sincronización inversa sobre State
  assert.equal(fakeWin.State.loadRate, 6500, 'State.loadRate debe actualizarse con el valor simulado (6500)');
  assert.equal(fakeWin.State.dischRate, 7200, 'State.dischRate debe actualizarse con el valor simulado (7200)');
  assert.equal(fakeWin.State.freightSell, 48.0, 'State.freightSell debe actualizarse con el valor simulado (48.0)');

  // Comprobar la actualización de los inputs DOM de la calculadora
  assert.equal(domElements['rate-load'].value, 6500, 'rate-load DOM debe reflejar 6500');
  assert.equal(domElements['rate-disch'].value, 7200, 'rate-disch DOM debe reflejar 7200');
  assert.equal(domElements['freight-sell'].value, 48, 'freight-sell DOM debe reflejar 48');
});

test('REQUERIMIENTO 3: Autocompletado del Contrato (Data Bridging hacia el EDITOR)', () => {
  // Verificar la inyección en campos del Editor (GENCON / ASBATANKVOY)
  assert.match(indexHtml, /setValIfExist\('gc-freight-val', updatedFreightSell\.toFixed\(2\)\);/, 'Debe inyectar flete en gc-freight-val');
  assert.match(indexHtml, /setValIfExist\('gc-laytime-load-val', updatedLoadRate\);/, 'Debe inyectar ritmo de carga en gc-laytime-load-val');
  assert.match(indexHtml, /setValIfExist\('gc-laytime-disch-val', updatedDischargeRate\);/, 'Debe inyectar ritmo de descarga en gc-laytime-disch-val');
  assert.match(indexHtml, /setValIfExist\('asb-freight-val', updatedFreightSell\.toFixed\(2\)\);/, 'Debe inyectar flete en asb-freight-val');
  assert.match(indexHtml, /if \(typeof syncGencon === 'function'\) syncGencon\(\);/, 'Debe invocar syncGencon()');
  assert.match(indexHtml, /if \(typeof syncAsbatankvoy === 'function'\) syncAsbatankvoy\(\);/, 'Debe invocar syncAsbatankvoy()');
});

test('REQUERIMIENTO 4: Flujo de Aceptación y Persistencia (Snapshot inmutable y congelado)', () => {
  assert.match(indexHtml, /function aceptarContratoCliente\(type = 'gencon'\)/, 'aceptarContratoCliente debe estar definida');
  assert.match(indexHtml, /window\.aceptarContratoCliente = aceptarContratoCliente;/, 'aceptarContratoCliente debe estar expuesta en window');
  assert.match(indexHtml, /CONTRATO ACEPTADO - REGISTRO INMUTABLE/, 'Debe crear la insignia de registro inmutable');

  // Verificar la función aceptarContratoCliente
  const inputsMock = [
    { id: 'gc-ref', disabled: false, classList: { add: () => {} } },
    { id: 'gc-owner-name', disabled: false, classList: { add: () => {} } }
  ];

  const headerActionsMock = {
    appendChild: (child) => { headerActionsMock.lastChild = child; }
  };

  const containerMock = {
    querySelectorAll: () => inputsMock,
    querySelector: (sel) => (sel === '.bg-slate-900' ? headerActionsMock : null)
  };

  const acceptBtnMock = {
    disabled: false,
    className: '',
    innerHTML: ''
  };

  const fakeDoc = {
    getElementById: (id) => {
      if (id === 'view-gencon') return containerMock;
      if (id === 'btn-accept-contract-gencon') return acceptBtnMock;
      return null;
    },
    createElement: (tag) => ({ id: '', className: '', innerHTML: '' })
  };

  const fakeWin = {
    isContractAccepted: false,
    dssFormState: { pol: 'Rotterdam', pod: 'Houston' },
    getDSSCurrentState: () => ({ pol: 'Rotterdam', pod: 'Houston' }),
    fetch: async () => ({ ok: true, status: 200 })
  };

  globalThis.window = fakeWin;

  const startIdx = indexHtml.indexOf('async function aceptarContratoCliente(type = \'gencon\')');
  const endIdx = indexHtml.indexOf('window.aceptarContratoCliente = aceptarContratoCliente;', startIdx);
  assert.notEqual(startIdx, -1, 'aceptarContratoCliente debe estar presente');

  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('document', 'fetch', `${fnSource}; return aceptarContratoCliente('gencon');`);

  evalFn(fakeDoc, fakeWin.fetch);

  assert.equal(fakeWin.isContractAccepted, true, 'isContractAccepted debe ser true');
  assert.equal(inputsMock[0].disabled, true, 'Los campos del editor deben quedar deshabilitados (disabled = true)');
  assert.equal(acceptBtnMock.disabled, true, 'El botón de aceptación debe deshabilitarse');
  assert.match(acceptBtnMock.innerHTML, /Contrato Congelado/, 'El botón debe indicar Contrato Congelado');
});

test('REQUERIMIENTO 5: Transición de UI, desactivación de Simulación y Generación de PDF', () => {
  assert.match(indexHtml, /limpiarDssSimulationState\(\);/, 'fijarCondicionesDefinitivas debe limpiar la simulación');
  assert.match(indexHtml, /cargarEscenario\('situacion_actual'\);/, 'fijarCondicionesDefinitivas debe cambiar a la pestaña Situación Actual');
  assert.match(indexHtml, /generateFixtureRecapPDF\(\);/, 'fijarCondicionesDefinitivas debe invocar la generación del Fixture Recap PDF');
});

test('REQUERIMIENTO DE API: Endpoint serverless netlify/functions/estimations.ts', () => {
  const filePath = new URL('../netlify/functions/estimations.ts', import.meta.url).pathname;
  assert.ok(existsSync(filePath), 'El archivo netlify/functions/estimations.ts debe existir');

  const code = readFileSync(filePath, 'utf8');
  assert.match(code, /export default async \(req: Request\)/, 'estimations.ts debe exportar un handler por defecto');
  assert.match(code, /path: "\/api\/estimations\/\*"/, 'estimations.ts debe tener la ruta /api/estimations/* configurada');
  assert.match(code, /onConflictDoUpdate/, 'estimations.ts debe realizar upsert en la tabla appConfig');
});
