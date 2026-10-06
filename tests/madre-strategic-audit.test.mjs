import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const decisionSupportModuleSource = readFileSync(new URL('../src/DecisionSupportModule.js', import.meta.url), 'utf8');
const decisionesHtml = readFileSync(new URL('../decisiones.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cerebroIaSource = readFileSync(new URL('../netlify/functions/cerebro-ia.js', import.meta.url), 'utf8');
const chatAssistantSource = readFileSync(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');

function createFakeDoc() {
  const elements = new Map();
  const getOrCreate = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        className: '',
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        },
        dispatchEvent() {}
      });
    }
    return elements.get(id);
  };
  return {
    getElementById: (id) => getOrCreate(id),
    querySelector: () => null,
    elements
  };
}

test('1. Petición y Botón Disparador: Presencia del botón secundario "Auditoría MADRE" en la barra superior junto a Fijar Condiciones Definitivas', () => {
  // DecisionSupportModule.js
  assert.match(
    decisionSupportModuleSource,
    /id="btn-auditoria-madre"[\s\S]*Auditoría MADRE[\s\S]*id="btn-fijar-condiciones-top"/,
    'DecisionSupportModule.js debe contener el botón btn-auditoria-madre en la barra superior junto a Fijar Condiciones Definitivas'
  );
  assert.match(decisionSupportModuleSource, /onclick="solicitarAuditoriaMadre\(\)"/);

  // decisiones.html
  assert.match(
    decisionesHtml,
    /id="btn-auditoria-madre"[\s\S]*Auditoría MADRE[\s\S]*id="btn-fijar-condiciones-top"/,
    'decisiones.html debe contener el botón btn-auditoria-madre en la barra superior junto a Fijar Condiciones Definitivas'
  );
  assert.match(decisionesHtml, /onclick="solicitarAuditoriaMadre\(\)"/);

  // index.html
  assert.match(
    indexHtml,
    /id="btn-auditoria-madre"/,
    'index.html debe contener el botón btn-auditoria-madre'
  );
});

test('2. Petición hacia Backend: Payload inyecta contexto_ui con todos los datos y current_module="decisiones"', () => {
  [decisionSupportModuleSource, decisionesHtml].forEach((source, idx) => {
    const fileName = idx === 0 ? 'DecisionSupportModule.js' : 'decisiones.html';
    assert.match(source, /current_module:\s*["']decisiones["']/, `${fileName} debe enviar current_module: "decisiones"`);
    assert.match(source, /contexto_ui:\s*contextoUi/, `${fileName} debe enviar objeto contexto_ui`);
    assert.match(source, /pol:/, `${fileName} debe empaquetar pol en contexto_ui`);
    assert.match(source, /pod:/, `${fileName} debe empaquetar pod en contexto_ui`);
    assert.match(source, /cargoQty:/, `${fileName} debe empaquetar cargoQty en contexto_ui`);
    assert.match(source, /fleteUnitario:/, `${fileName} debe empaquetar fleteUnitario en contexto_ui`);
    assert.match(source, /loadRate:/, `${fileName} debe empaquetar loadRate en contexto_ui`);
    assert.match(source, /dischargeRate:/, `${fileName} debe empaquetar dischargeRate en contexto_ui`);
  });

  // Backend: cerebro-ia.js y chat-assistant.js reconocen current_module === "decisiones"
  assert.match(cerebroIaSource, /current_module.*decisiones/);
  assert.match(cerebroIaSource, /renderizar_auditoria_dss/);
  assert.match(chatAssistantSource, /current_module.*decisiones/);
});

test('3. Nivel 1: Resumen (En el Motor de Recomendaciones): Alerta limpia con veredicto_general (🟢 / 🟡 / 🔴) y botón Ver Auditoría Completa', () => {
  assert.match(decisionSupportModuleSource, /id="tarjeta-resumen-auditoria-madre"/);
  assert.match(decisionesHtml, /id="tarjeta-resumen-auditoria-madre"/);

  const fakeDoc = createFakeDoc();
  const fakeWin = {
    document: fakeDoc,
    madreUltimaAuditoria: null
  };
  globalThis.document = fakeDoc;
  globalThis.window = fakeWin;

  const fnMatch = decisionSupportModuleSource.match(/export function renderizarAuditoriaDss\(auditoriaData\) \{[\s\S]*?\n\}/);
  const escapeHtmlMatch = decisionSupportModuleSource.match(/function escapeHtml\(str\) \{[\s\S]*?\n\}/);

  const evalScript = new Function('auditoriaData', `
    ${escapeHtmlMatch[0]}
    const fn = ${fnMatch[0].replace('export function renderizarAuditoriaDss', 'function renderizarAuditoriaDss')};
    return fn(auditoriaData);
  `);

  const mockAudit = {
    accion_ui: "renderizar_auditoria_dss",
    veredicto_general: "🟢 Favorable con Cláusulas Protectoras",
    reporte_estrategico: "Operación viable con excelente margen sobre Break-Even.",
    variables_perjudiciales: ["Ritmo de descarga ajustado"],
    recomendaciones: [{ accion: "Confirmar medios de tierra", pro: "Mayor rapidez", contra: "Coste adicional" }]
  };

  evalScript(mockAudit);

  const tarjeta = fakeDoc.getElementById('tarjeta-resumen-auditoria-madre');
  assert.ok(tarjeta, 'Tarjeta de alerta resumen debe existir');
  assert.equal(tarjeta.classList.contains('hidden'), false, 'Tarjeta de alerta resumen debe ser visible tras auditoría');
  assert.match(tarjeta.innerHTML, /🟢 Favorable con Cláusulas Protectoras/, 'Debe renderizar el veredicto general');
  assert.match(tarjeta.innerHTML, /id="btn-ver-auditoria-completa"/, 'Debe incluir el botón Ver Auditoría Completa');
  assert.match(tarjeta.innerHTML, /Ver Auditoría Completa/);
});

test('4. Nivel 2: Panel Lateral (Offcanvas): Estructura visual con reporte_estrategico, variables_perjudiciales y recomendaciones (Acción, Pro verde, Contra rojo)', () => {
  [decisionSupportModuleSource, decisionesHtml].forEach((source, idx) => {
    const fileName = idx === 0 ? 'DecisionSupportModule.js' : 'decisiones.html';
    assert.match(source, /id="madre-offcanvas-panel"/, `${fileName} debe contener madre-offcanvas-panel`);
    assert.match(source, /id="madre-offcanvas-backdrop"/, `${fileName} debe contener madre-offcanvas-backdrop`);
    assert.match(source, /id="madre-offcanvas-reporte"/, `${fileName} debe contener madre-offcanvas-reporte`);
    assert.match(source, /id="madre-offcanvas-variables"/, `${fileName} debe contener madre-offcanvas-variables`);
    assert.match(source, /id="madre-offcanvas-recomendaciones"/, `${fileName} debe contener madre-offcanvas-recomendaciones`);
    assert.match(source, /id="btn-fixture-recap-opcion-b"/, `${fileName} debe contener btn-fixture-recap-opcion-b`);
  });

  const fakeDoc = createFakeDoc();
  const fakeWin = {
    document: fakeDoc,
    madreUltimaAuditoria: null
  };
  globalThis.document = fakeDoc;
  globalThis.window = fakeWin;

  const fnMatch = decisionSupportModuleSource.match(/export function renderizarAuditoriaDss\(auditoriaData\) \{[\s\S]*?\n\}/);
  const escapeHtmlMatch = decisionSupportModuleSource.match(/function escapeHtml\(str\) \{[\s\S]*?\n\}/);

  const evalScript = new Function('auditoriaData', `
    ${escapeHtmlMatch[0]}
    const fn = ${fnMatch[0].replace('export function renderizarAuditoriaDss', 'function renderizarAuditoriaDss')};
    return fn(auditoriaData);
  `);

  const mockAudit = {
    accion_ui: "renderizar_auditoria_dss",
    veredicto_general: "🟡 Precaución Operativa - Margen Ajustado",
    reporte_estrategico: "Dictamen detallado de MADRE sobre demoras y flete.",
    variables_perjudiciales: ["Exposición a festivos en descarga (SHEX)", "Flete cercano a Break-Even"],
    recomendaciones: [
      {
        accion: "Pactar descarga WWD SHINC 2.500 MT/día",
        pro: "Reduce estancia portuaria en 1.8 días.",
        contra: "Exige confirmación previa con receptores."
      }
    ]
  };

  evalScript(mockAudit);

  assert.equal(fakeDoc.getElementById('madre-offcanvas-reporte').textContent, "Dictamen detallado de MADRE sobre demoras y flete.");

  const varsHtml = fakeDoc.getElementById('madre-offcanvas-variables').innerHTML;
  assert.match(varsHtml, /Exposición a festivos en descarga/);
  assert.match(varsHtml, /fa-triangle-exclamation/);

  const recsHtml = fakeDoc.getElementById('madre-offcanvas-recomendaciones').innerHTML;
  assert.match(recsHtml, /Pactar descarga WWD SHINC 2\.500 MT\/día/);
  assert.match(recsHtml, /Pro:/);
  assert.match(recsHtml, /text-emerald/);
  assert.match(recsHtml, /Contra:/);
  assert.match(recsHtml, /text-rose/);
});

test('5. El Cierre: Botón "Fixture Recap (Opción B)" sobrescribe datos en memoria (flete, cláusulas, laytime) y llama generateFixtureRecapPDF', async () => {
  const fakeDoc = createFakeDoc();
  fakeDoc.getElementById('freight-sell').value = '35.0';
  fakeDoc.getElementById('input-fleteUnitario').value = '35.0';
  fakeDoc.getElementById('rate-load').value = '5000';
  fakeDoc.getElementById('rate-disch').value = '2000';
  fakeDoc.getElementById('input-loadRate').value = '5000';
  fakeDoc.getElementById('input-dischargeRate').value = '2000';

  let pdfGenerated = false;
  const fakeWin = {
    document: fakeDoc,
    dssFormState: {
      fleteUnitario: 35.0,
      loadRate: 5000,
      dischargeRate: 2000,
      clausulas: "STANDARD TERMS"
    },
    State: {
      freightSell: 35.0,
      loadRate: 5000,
      dischRate: 2000
    },
    generateFixtureRecapPDF: async () => {
      pdfGenerated = true;
    },
    madreUltimaAuditoria: {
      accion_ui: "renderizar_auditoria_dss",
      modificaciones_recap: {
        flete: 39.5,
        loadRate: 6000,
        dischargeRate: 2800,
        clausulas: "WWD SHINC DISCHARGE - REACHABLE ON ARRIVAL - BIMCO 2025"
      }
    }
  };
  globalThis.document = fakeDoc;
  globalThis.window = fakeWin;

  const fnMatch = decisionSupportModuleSource.match(/export async function generarFixtureRecapOpcionB\(\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'generarFixtureRecapOpcionB function must exist');

  const evalScript = new Function(`
    const fn = ${fnMatch[0].replace('export async function generarFixtureRecapOpcionB', 'async function generarFixtureRecapOpcionB')};
    return fn();
  `);

  await evalScript();

  // Verificar sobrescritura en memoria
  assert.equal(fakeWin.dssFormState.fleteUnitario, 39.5, 'dssFormState.fleteUnitario debe actualizarse a 39.5');
  assert.equal(fakeWin.dssFormState.dischargeRate, 2800, 'dssFormState.dischargeRate debe actualizarse a 2800');
  assert.equal(fakeWin.dssFormState.loadRate, 6000, 'dssFormState.loadRate debe actualizarse a 6000');
  assert.equal(fakeWin.dssFormState.clausulas, "WWD SHINC DISCHARGE - REACHABLE ON ARRIVAL - BIMCO 2025");
  assert.equal(fakeWin.dssInjectedRecapFreight, 39.5);
  assert.equal(fakeWin.dssInjectedRecapClauses, "WWD SHINC DISCHARGE - REACHABLE ON ARRIVAL - BIMCO 2025");

  // Inputs en DOM
  assert.equal(fakeDoc.getElementById('freight-sell').value, 39.5);
  assert.equal(fakeDoc.getElementById('rate-disch').value, 2800);

  // Llamada a la función existente que genera el PDF
  assert.equal(pdfGenerated, true, 'generateFixtureRecapPDF debe haber sido llamada');
});

test('6. UI/UX: Cero modo oscuro, fondo blanco puro (bg-white), texto gris corporativo y estilo profesional', () => {
  // Comprobar que el offcanvas y la tarjeta de auditoría usan bg-white y texto slate/gray corporativo
  assert.match(decisionSupportModuleSource, /id="madre-offcanvas-panel"[^>]*bg-white/, 'Offcanvas debe ser bg-white');
  assert.match(decisionesHtml, /id="madre-offcanvas-panel"[^>]*bg-white/, 'Offcanvas en decisiones.html debe ser bg-white');

  assert.match(decisionSupportModuleSource, /btn-fixture-recap-opcion-b[^>]*bg-teal-800/, 'Botón principal de cierre debe usar azul petróleo/teal (bg-teal-800)');
  assert.match(decisionesHtml, /btn-fixture-recap-opcion-b[^>]*bg-teal-800/, 'Botón principal de cierre en decisiones.html debe usar bg-teal-800');

  // No debe contener clases de modo oscuro en el panel de MADRE
  assert.doesNotMatch(decisionSupportModuleSource, /id="madre-offcanvas-panel"[^>]*bg-slate-900/);
  assert.doesNotMatch(decisionSupportModuleSource, /id="madre-offcanvas-panel"[^>]*bg-black/);
});
