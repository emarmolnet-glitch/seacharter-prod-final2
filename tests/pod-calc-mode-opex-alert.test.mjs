import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Se evalúa el código real embebido en index.html, no una copia paralela.
function extractDeclaration(name) {
  const needles = [`function ${name}(`, `const ${name} = `];
  let start = -1;
  for (const needle of needles) {
    start = indexSource.indexOf(needle);
    if (start !== -1) break;
  }
  assert.notEqual(start, -1, `declaración no encontrada en index.html: ${name}`);

  let depth = 0;
  let seenBrace = false;
  for (let i = indexSource.indexOf('{', start); i < indexSource.length; i++) {
    const char = indexSource[i];
    if (char === '{') {
      depth++;
      seenBrace = true;
    } else if (char === '}') {
      depth--;
      if (seenBrace && depth === 0) return indexSource.slice(start, i + 1);
    }
  }
  throw new Error(`llaves desbalanceadas al extraer ${name}`);
}

function extractSimpleConst(name) {
  const match = indexSource.match(new RegExp(`^\\s*const ${name} = [^;\\n]+;`, 'm'));
  assert.notEqual(match, null, `constante no encontrada en index.html: ${name}`);
  return match[0].trim();
}

function fakeElement(extra = {}) {
  const classes = new Set(String(extra.className || '').split(' ').filter(Boolean));
  const el = {
    value: '',
    dataset: {},
    attributes: {},
    textContent: '',
    readOnly: false,
    ...extra,
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name)
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
  Object.defineProperty(el, 'className', {
    get: () => Array.from(classes).join(' '),
    set: (value) => {
      classes.clear();
      String(value || '').split(' ').filter(Boolean).forEach((n) => classes.add(n));
    }
  });
  return el;
}

function buildScene({ state = {} } = {}) {
  const elements = new Map([
    ['rate-disch', fakeElement({ value: '5000' })],
    ['rate-load', fakeElement({ value: '5000' })],
    ['btn-ritmo-auto-pod', fakeElement()],
    ['btn-ritmo-manual-pod', fakeElement()],
    ['pod-opex-impact-alert', fakeElement({ className: 'hidden' })],
    ['pol-opex-impact-alert', fakeElement({ className: 'hidden' })]
  ]);

  const context = {
    Math,
    Number,
    String,
    Boolean,
    Object,
    parseFloat,
    console,
    window: { State: { ...state } },
    document: { getElementById: (id) => elements.get(id) || null }
  };
  context.globalThis = context;

  const source = [
    extractSimpleConst('RITMO_MODE_BTN_BASE_AUTO'),
    extractSimpleConst('RITMO_MODE_BTN_BASE_MANUAL'),
    extractSimpleConst('RITMO_MODE_BTN_ACTIVE'),
    extractSimpleConst('RITMO_MODE_BTN_INACTIVE'),
    extractSimpleConst('POD_RATE_AUTO_CLASSES'),
    extractSimpleConst('POD_RATE_MANUAL_CLASSES'),
    extractSimpleConst('OPEX_IMPACT_ALERT_CLASSES'),
    extractDeclaration('isRitmoModoManual'),
    extractDeclaration('getPodCalcMode'),
    extractDeclaration('renderOpexImpactAlert'),
    extractDeclaration('renderPodOpexImpactAlert'),
    extractDeclaration('publicarImpactoOpexDias'),
    extractDeclaration('aplicarEstadoBotonesRitmo'),
    extractDeclaration('aplicarEstiloRitmoPod'),
    extractDeclaration('sincronizarModoCalculoPod')
  ].join('\n');

  vm.runInNewContext(source, context);
  return { context, elements };
}

// Clases exactas que deben compartir las dos alertas de impacto en OPEX.
const ALERT_CLASSES = 'flex items-center p-2 mt-2 text-red-700 bg-red-100 border border-red-300 rounded text-sm font-semibold shadow-sm';

function bloqueRitmo(side) {
  const labelId = side === 'pod' ? 'label-rate-disch' : 'label-rate-load';
  const start = indexSource.indexOf(`<label id="${labelId}"`);
  assert.notEqual(start, -1, `no se localizó el bloque de Ritmo Real ${side.toUpperCase()}`);
  const end = indexSource.indexOf(`id="rate-ref-helper-${side}"`, start);
  assert.notEqual(end, -1, `no se localizó la nota de referencia del ${side.toUpperCase()}`);
  return indexSource.slice(start, end);
}

// Trozo de markup entre el input de ritmo y la nota gris de referencia: es donde
// vive la alerta OPEX y donde cualquier diferencia rompe la simetría de alturas.
function tramoBajoInput(side) {
  const bloque = bloqueRitmo(side);
  const rateId = side === 'pod' ? 'rate-disch' : 'rate-load';
  const inputStart = bloque.indexOf(`id="${rateId}"`);
  return bloque.slice(bloque.indexOf('>', inputStart) + 1);
}

test('Ritmo Real POD: el markup arranca en Auto con el input bloqueado y la alerta OPEX oculta', () => {
  const markup = bloqueRitmo('pod');

  // Interruptor: Auto activo en azul oscuro, Manual inactivo en gris neutro.
  assert.match(markup, /id="btn-ritmo-auto-pod"[^>]*class="[^"]*bg-blue-900 text-white[^"]*"/);
  assert.match(markup, /id="btn-ritmo-manual-pod"[^>]*class="[^"]*bg-gray-100 text-gray-500 hover:bg-gray-200[^"]*"/);
  assert.match(markup, /id="btn-ritmo-auto-pod"[^>]*aria-pressed="true"/);
  assert.match(markup, /id="btn-ritmo-manual-pod"[^>]*aria-pressed="false"/);

  // Input en modo Auto: solo lectura, fondo gris y cursor prohibido.
  assert.match(markup, /id="rate-disch"[^>]*class="[^"]*bg-gray-100[^"]*cursor-not-allowed[^"]*"/);
  assert.match(markup, /id="rate-disch"[^>]*readonly/);
  assert.match(markup, /id="rate-disch"[^>]*data-pod-calc-mode="auto"/);

  // Alerta OPEX: bajo el input y antes de la nota gris de referencia.
  assert.match(markup, /id="pod-opex-impact-alert"/);
  assert.ok(
    markup.indexOf('id="rate-disch"') < markup.indexOf('id="pod-opex-impact-alert"'),
    'la alerta OPEX debe ir después del input de Ritmo Real POD'
  );
});

test('Las alertas OPEX de POL y POD comparten contenedor, clases y posición', () => {
  for (const side of ['pol', 'pod']) {
    assert.match(
      bloqueRitmo(side),
      new RegExp(`<div id="${side}-opex-impact-alert" class="hidden ${ALERT_CLASSES.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}" role="alert" aria-live="polite"></div>`),
      `la alerta del ${side.toUpperCase()} no usa el contenedor estándar`
    );
  }

  // Mismo número y orden de elementos bajo cada input: alturas idénticas y por
  // tanto los inputs de "Nº Grúas" quedan en la misma línea horizontal.
  const normalizar = (side) => tramoBajoInput(side)
    .replace(/pol|pod/g, 'SIDE')
    .replace(/\s+/g, ' ')
    .trim();
  assert.equal(normalizar('pol'), normalizar('pod'));

  // El texto residual "Manual Override" ya no descuadra ninguna de las columnas.
  assert.equal(bloqueRitmo('pol').includes('Manual Override'), false);
  assert.equal(bloqueRitmo('pod').includes('Manual Override'), false);
  assert.equal(indexSource.includes('rate-load-override'), false);
  assert.equal(indexSource.includes('rate-disch-override'), false);
});

test('El interruptor Auto/Manual del POD pinta el botón activo y apaga el inactivo', () => {
  const { context, elements } = buildScene();
  const autoBtn = elements.get('btn-ritmo-auto-pod');
  const manualBtn = elements.get('btn-ritmo-manual-pod');

  context.aplicarEstadoBotonesRitmo('pod', 'manual');
  assert.equal(manualBtn.classList.contains('bg-blue-900'), true);
  assert.equal(manualBtn.classList.contains('text-white'), true);
  assert.equal(manualBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(autoBtn.classList.contains('bg-gray-100'), true);
  assert.equal(autoBtn.classList.contains('text-gray-500'), true);
  assert.equal(autoBtn.classList.contains('bg-blue-900'), false);
  assert.equal(autoBtn.getAttribute('aria-pressed'), 'false');

  context.aplicarEstadoBotonesRitmo('pod', 'auto');
  assert.equal(autoBtn.classList.contains('bg-blue-900'), true);
  assert.equal(manualBtn.classList.contains('bg-gray-100'), true);
  assert.equal(manualBtn.classList.contains('bg-blue-900'), false);
});

test('El input de Ritmo Real POD se bloquea en Auto y se libera en verde en Manual', () => {
  const { context, elements } = buildScene();
  const input = elements.get('rate-disch');

  context.aplicarEstiloRitmoPod('auto');
  assert.equal(input.readOnly, true);
  assert.equal(input.getAttribute('readonly'), 'readonly');
  assert.equal(input.getAttribute('aria-readonly'), 'true');
  assert.equal(input.dataset.podCalcMode, 'auto');
  assert.equal(input.classList.contains('bg-gray-100'), true);
  assert.equal(input.classList.contains('cursor-not-allowed'), true);
  assert.equal(input.classList.contains('bg-green-100'), false);

  context.aplicarEstiloRitmoPod('manual');
  assert.equal(input.readOnly, false);
  assert.equal(input.getAttribute('readonly'), undefined);
  assert.equal(input.dataset.podCalcMode, 'manual');
  assert.equal(input.classList.contains('bg-green-100'), true);
  assert.equal(input.classList.contains('text-green-900'), true);
  assert.equal(input.classList.contains('border-green-300'), true);
  assert.equal(input.classList.contains('cursor-not-allowed'), false);
});

test('Las alertas OPEX solo se renderizan con impacto de días positivo y lo hacen igual en ambos lados', () => {
  const { context, elements } = buildScene();
  const alertaPod = elements.get('pod-opex-impact-alert');
  const alertaPol = elements.get('pol-opex-impact-alert');
  const clasesEsperadas = ALERT_CLASSES.split(' ').sort().join(' ');
  const clasesVisibles = (el) => el.className.split(' ').filter((c) => c !== 'hidden').sort().join(' ');

  context.publicarImpactoOpexDias('pod', 0);
  assert.equal(alertaPod.classList.contains('hidden'), true);
  assert.equal(alertaPod.textContent, '');
  assert.equal(context.window.State.podOpexImpactDays, 0);

  context.publicarImpactoOpexDias('pod', 1.3333);
  assert.equal(alertaPod.classList.contains('hidden'), false);
  assert.equal(alertaPod.textContent, '❗ Impacto Negativo: [1.33] Días (Coste OPEX)');
  assert.equal(clasesVisibles(alertaPod), clasesEsperadas);
  assert.equal(context.window.State.podOpexImpactDays, 1.3333);

  // El impacto del POL pinta su propia caja, con idéntico icono y corchetes,
  // sin tocar la del POD.
  context.publicarImpactoOpexDias('pol', 9.5);
  assert.equal(context.window.State.polOpexImpactDays, 9.5);
  assert.equal(alertaPol.classList.contains('hidden'), false);
  assert.equal(alertaPol.textContent, '❗ Impacto Negativo: [9.50] Días (Coste OPEX)');
  assert.equal(clasesVisibles(alertaPol), clasesVisibles(alertaPod));
  assert.equal(alertaPod.textContent, '❗ Impacto Negativo: [1.33] Días (Coste OPEX)');

  // Y al desaparecer el desvío cada caja se oculta por separado.
  context.publicarImpactoOpexDias('pod', 0);
  assert.equal(alertaPod.classList.contains('hidden'), true);
  assert.equal(clasesVisibles(alertaPod), clasesEsperadas);
  assert.equal(alertaPol.classList.contains('hidden'), false);

  context.publicarImpactoOpexDias('pol', 0);
  assert.equal(alertaPol.classList.contains('hidden'), true);
  assert.equal(alertaPol.textContent, '');
});

test('La alerta OPEX cambia de lectura con globalViewMode sin tocar días ni clases', () => {
  const { context, elements } = buildScene();
  const alertaPod = elements.get('pod-opex-impact-alert');
  const alertaPol = elements.get('pol-opex-impact-alert');
  const clasesEsperadas = ALERT_CLASSES.split(' ').sort().join(' ');
  const clasesVisibles = (el) => el.className.split(' ').filter((c) => c !== 'hidden').sort().join(' ');

  // Por defecto (sin estado global definido) se lee como armador: coste OPEX.
  context.publicarImpactoOpexDias('pol', 2.5);
  assert.equal(alertaPol.textContent, '❗ Impacto Negativo: [2.50] Días (Coste OPEX)');

  // En Vista Fletador el mismo desvío se lee como exposición a penalización.
  context.window.globalViewMode = 'charterer';
  context.publicarImpactoOpexDias('pol', 2.5);
  context.publicarImpactoOpexDias('pod', 4);
  assert.equal(alertaPol.textContent, '❗ Riesgo Crítico: Exceso de Laytime. Exposición a penalización.');
  assert.equal(alertaPod.textContent, '❗ Riesgo Crítico: Exceso de Laytime. Exposición a penalización.');

  // El motor no se entera: los días siguen siendo los mismos y las clases tampoco cambian.
  assert.equal(context.window.State.polOpexImpactDays, 2.5);
  assert.equal(context.window.State.podOpexImpactDays, 4);
  assert.equal(clasesVisibles(alertaPol), clasesEsperadas);
  assert.equal(clasesVisibles(alertaPod), clasesEsperadas);

  // Y al volver a Vista Armador se recupera la redacción con los días.
  context.window.globalViewMode = 'owner';
  context.publicarImpactoOpexDias('pod', 4);
  assert.equal(alertaPod.textContent, '❗ Impacto Negativo: [4.00] Días (Coste OPEX)');

  // Sin desvío no se pinta nada, en ninguna de las dos vistas.
  context.window.globalViewMode = 'charterer';
  context.publicarImpactoOpexDias('pod', 0);
  assert.equal(alertaPod.classList.contains('hidden'), true);
  assert.equal(alertaPod.textContent, '');
  context.window.globalViewMode = 'owner';
  context.publicarImpactoOpexDias('pol', 0);
  assert.equal(alertaPol.classList.contains('hidden'), true);
  assert.equal(alertaPol.textContent, '');
});

test('El modo del POD es independiente del POL', () => {
  // POL en Manual (incluido el flag legacy global) no arrastra al POD.
  const soloPol = buildScene({ state: { ritmoMode: 'manual', ritmoMode_pol: 'manual' } });
  assert.equal(soloPol.context.isRitmoModoManual('pol'), true);
  assert.equal(soloPol.context.getPodCalcMode(), 'auto');
  assert.equal(soloPol.context.sincronizarModoCalculoPod(), 'auto');
  assert.equal(soloPol.elements.get('rate-disch').readOnly, true);
  assert.equal(soloPol.context.window.State.podCalcMode, 'auto');

  // POD en Manual no arrastra al POL.
  const soloPod = buildScene({ state: { podCalcMode: 'manual' } });
  assert.equal(soloPod.context.getPodCalcMode(), 'manual');
  assert.equal(soloPod.context.isRitmoModoManual('pol'), false);
  assert.equal(soloPod.context.sincronizarModoCalculoPod(), 'manual');
  assert.equal(soloPod.elements.get('rate-disch').readOnly, false);

  // La clave legacy por lado sigue reconociéndose.
  const legacyPod = buildScene({ state: { ritmoMode_pod: 'manual' } });
  assert.equal(legacyPod.context.getPodCalcMode(), 'manual');
});
