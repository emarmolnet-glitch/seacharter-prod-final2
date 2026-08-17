import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Extrae el código real embebido en index.html para que los tests validen el
// motor que se sirve al navegador, no una copia paralela.
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
      if (seenBrace && depth === 0) {
        const tail = indexSource.slice(i + 1, i + 4);
        return indexSource.slice(start, i + 1) + (tail.startsWith(');') ? ');' : '');
      }
    }
  }
  throw new Error(`llaves desbalanceadas al extraer ${name}`);
}

// Constantes escalares (`const X = 70;`) no tienen bloque de llaves que balancear.
function extractScalarConst(name) {
  const match = indexSource.match(new RegExp(`^\\s*const ${name} = [^;\\n]+;`, 'm'));
  assert.notEqual(match, null, `constante no encontrada en index.html: ${name}`);
  return match[0].trim();
}

function fakeElement(extra = {}) {
  const classes = new Set(String(extra.className || '').split(' ').filter(Boolean));
  return {
    value: '',
    dataset: {},
    style: {},
    attributes: {},
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
}

function buildScene({
  side = 'pol',
  swl = 30,
  tara = 0,
  ciclos = 10,
  eficiencia = 100,
  gruas = 1,
  ritmo = '0',
  label = 'Cuchara (Grab) - Grúa Barco',
  manual = true
} = {}) {
  const elements = new Map([
    [`gruas-swl-${side}`, fakeElement({ value: String(swl) })],
    [`gruas-tara-${side}`, fakeElement({ value: String(tara) })],
    [`gruas-ciclos-${side}`, fakeElement({ value: String(ciclos) })],
    [`gruas-eficiencia-num-${side}`, fakeElement({ value: String(eficiencia), className: 'text-slate-800' })],
    [`gruas-eficiencia-slider-${side}`, fakeElement({ value: String(eficiencia), className: 'accent-blue-600 cursor-pointer' })],
    [`gruas-eficiencia-riesgo-${side}`, fakeElement({ className: 'hidden', textContent: '' })],
    [`gruas-derivacion-${side}`, fakeElement({ textContent: '', innerHTML: '' })],
    [side === 'pod' ? 'rate-disch' : 'rate-load', fakeElement({ value: String(ritmo) })]
  ]);

  const context = {
    Math,
    Object,
    String,
    Number,
    parseFloat,
    console,
    window: { State: { [`ritmoMode_${side}`]: manual ? 'manual' : 'auto' } },
    document: { getElementById: (id) => elements.get(id) || null },
    getSelectedMethodLabel: () => label,
    isCraneMethod: (value) => String(value || '').includes('Grúa'),
    isBigBagsPortCraneMethod: (value) => String(value || '').includes('Big Bags - Grúa Portuaria'),
    getBigBagsPortCraneLiftCapacityMt: () => 21,
    getBigBagsPortCraneSpec: () => ({ bagsPerLift: 14, bagWeightMt: 1.5, operatingHoursPerDay: 24 }),
    readNumeroGruasPuerto: () => gruas
  };
  context.globalThis = context;

  const source = [
    extractScalarConst('EFICIENCIA_RIESGO_UMBRAL_ADVERTENCIA'),
    extractScalarConst('EFICIENCIA_RIESGO_UMBRAL_PELIGRO'),
    extractDeclaration('EFICIENCIA_RIESGO_ESTILOS'),
    extractScalarConst('EFICIENCIA_ACCENT_CLASSES'),
    extractScalarConst('EFICIENCIA_NUM_TEXT_CLASSES'),
    extractDeclaration('getEficienciaRiesgoNivel'),
    extractDeclaration('getEficienciaRiesgoEstilo'),
    extractDeclaration('aplicarSemaforoEficiencia'),
    extractDeclaration('setEficienciaGruaBloqueada'),
    extractDeclaration('isRitmoModoManual'),
    extractDeclaration('getCapacidadTeoricaGrua'),
    extractDeclaration('calcularRitmoGruaTeorico'),
    extractDeclaration('calcularEficienciaImplicita'),
    extractDeclaration('renderDerivacionGruaInversa'),
    extractDeclaration('sincronizarEficienciaInversa')
  ].join('\n');

  vm.runInNewContext(source, context);
  return { context, elements };
}

test('la capacidad teórica al 100% es el denominador compartido por ambos sentidos', () => {
  const { context } = buildScene({ swl: 30, tara: 0, ciclos: 10, gruas: 1 });
  const fisica = context.getCapacidadTeoricaGrua('pol');
  // 30 MT/izada × 10 ciclos/h × 24 h × 1 grúa = 7,200 TM/día al 100%.
  assert.equal(fisica.capacidadMaxima, 7200);
  assert.equal(fisica.horasOperativas, 24);
});

test('despeja la eficiencia implícita del ritmo manual con 2 decimales', () => {
  const { context } = buildScene({ swl: 30, ciclos: 10, ritmo: '2500' });
  // 2500 / 7200 × 100 = 34.7222... → 34.72
  assert.equal(context.calcularEficienciaImplicita('pol', 2500), 34.72);
  assert.equal(context.calcularEficienciaImplicita('pol', 3600), 50);
  assert.equal(context.calcularEficienciaImplicita('pol', 7200), 100);
});

test('el cálculo inverso es reversible contra el cálculo directo', () => {
  const { context, elements } = buildScene({ swl: 25, tara: 5, ciclos: 12, gruas: 2, eficiencia: 65, manual: false });
  const ritmoDirecto = context.calcularRitmoGruaTeorico('pol');
  // (25 - 5) × 12 × 24 × 2 × 0.65 = 7,488 TM/día
  assert.equal(ritmoDirecto, 7488);
  elements.get('rate-load').value = String(ritmoDirecto);
  assert.equal(context.calcularEficienciaImplicita('pol', ritmoDirecto), 65);
});

test('acota el resultado a [0, 100] sin permitir eficiencias imposibles', () => {
  const { context } = buildScene({ swl: 30, ciclos: 10 });
  assert.equal(context.calcularEficienciaImplicita('pol', 99999), 100);
  assert.equal(context.calcularEficienciaImplicita('pol', 0), 0);
  assert.equal(context.calcularEficienciaImplicita('pol', -5000), 0);
});

test('evita la división por cero cuando faltan datos de grúa', () => {
  assert.equal(buildScene({ ciclos: 0 }).context.calcularEficienciaImplicita('pol', 2500), null);
  assert.equal(buildScene({ swl: 10, tara: 10 }).context.calcularEficienciaImplicita('pol', 2500), null);
  assert.equal(buildScene({ gruas: 0 }).context.calcularEficienciaImplicita('pol', 2500), null);
  // Método sin grúas: el submódulo no aplica.
  assert.equal(buildScene({ label: 'Cinta Transportadora' }).context.calcularEficienciaImplicita('pol', 2500), null);
  const sinGruas = buildScene({ label: 'Cinta Transportadora', ritmo: '2500' });
  assert.equal(sinGruas.context.sincronizarEficienciaInversa('pol'), null);
  assert.equal(sinGruas.elements.get('gruas-eficiencia-slider-pol').disabled, false);
});

test('sincroniza slider e input numérico en tiempo real al teclear el ritmo manual', () => {
  const { context, elements } = buildScene({ swl: 30, ciclos: 10, eficiencia: 100, ritmo: '2500' });
  const eficiencia = context.sincronizarEficienciaInversa('pol');

  assert.equal(eficiencia, 34.72);
  assert.equal(elements.get('gruas-eficiencia-slider-pol').value, '34.72');
  assert.equal(elements.get('gruas-eficiencia-num-pol').value, '34.72');
});

test('el slider queda deshabilitado en modo Manual y editable al volver a Auto', () => {
  const { context, elements } = buildScene({ swl: 30, ciclos: 10, ritmo: '2500' });
  const slider = elements.get('gruas-eficiencia-slider-pol');
  const num = elements.get('gruas-eficiencia-num-pol');

  context.sincronizarEficienciaInversa('pol');
  assert.equal(slider.disabled, true);
  assert.equal(slider.getAttribute('aria-readonly'), 'true');
  assert.equal(slider.step, '0.01');
  assert.equal(num.readOnly, true);
  assert.ok(slider.classList.contains('cursor-not-allowed'));

  context.setEficienciaGruaBloqueada('pol', false);
  assert.equal(slider.disabled, false);
  assert.equal(slider.step, '1');
  assert.equal(num.readOnly, false);
  assert.ok(slider.classList.contains('cursor-pointer'));
});

test('semáforo de riesgo OPEX: azul >= 70%, naranja 50-70%, rojo < 50%', () => {
  const { context } = buildScene();
  assert.equal(context.getEficienciaRiesgoNivel(100), 'normal');
  assert.equal(context.getEficienciaRiesgoNivel(70), 'normal');
  assert.equal(context.getEficienciaRiesgoNivel(69.99), 'advertencia');
  assert.equal(context.getEficienciaRiesgoNivel(50), 'advertencia');
  assert.equal(context.getEficienciaRiesgoNivel(49.99), 'peligro');
  assert.equal(context.getEficienciaRiesgoNivel(0), 'peligro');
});

test('el color del slider cambia con el nivel de riesgo derivado', () => {
  const escenarios = [
    { ritmo: 7200, nivel: 'normal', accent: 'accent-blue-600' },
    { ritmo: 4320, nivel: 'advertencia', accent: 'accent-orange-500' },
    { ritmo: 2500, nivel: 'peligro', accent: 'accent-red-600' }
  ];

  for (const escenario of escenarios) {
    const { context, elements } = buildScene({ swl: 30, ciclos: 10, ritmo: String(escenario.ritmo) });
    context.sincronizarEficienciaInversa('pol');
    const slider = elements.get('gruas-eficiencia-slider-pol');
    assert.equal(slider.dataset.riskLevel, escenario.nivel, `ritmo ${escenario.ritmo}`);
    assert.ok(slider.classList.contains(escenario.accent), `ritmo ${escenario.ritmo} => ${escenario.accent}`);
    // Un único accent activo: los otros dos se retiran.
    const otros = ['accent-blue-600', 'accent-orange-500', 'accent-red-600'].filter((c) => c !== escenario.accent);
    otros.forEach((c) => assert.equal(slider.classList.contains(c), false, `${c} debería estar retirado`));
  }
});

test('POL y POD trabajan desacoplados', () => {
  const pol = buildScene({ side: 'pol', swl: 30, ciclos: 10, ritmo: '2500' });
  const pod = buildScene({ side: 'pod', swl: 30, ciclos: 10, ritmo: '7200' });

  assert.equal(pol.context.sincronizarEficienciaInversa('pol'), 34.72);
  assert.equal(pod.context.sincronizarEficienciaInversa('pod'), 100);
  assert.equal(pol.elements.get('gruas-eficiencia-slider-pol').dataset.riskLevel, 'peligro');
  assert.equal(pod.elements.get('gruas-eficiencia-slider-pod').dataset.riskLevel, 'normal');
});

test('el panel de derivación explica la eficiencia despejada y avisa si excede la física', () => {
  const dentro = buildScene({ swl: 30, ciclos: 10, ritmo: '2500' });
  dentro.context.sincronizarEficienciaInversa('pol');
  const panelDentro = dentro.elements.get('gruas-derivacion-pol');
  assert.match(panelDentro.innerHTML, /EFICIENCIA IMPLÍCITA derivada/);
  assert.match(panelDentro.innerHTML, /34,72 %/);

  const fuera = buildScene({ swl: 30, ciclos: 10, ritmo: '99999' });
  fuera.context.sincronizarEficienciaInversa('pol');
  assert.match(fuera.elements.get('gruas-derivacion-pol').innerHTML, /supera la capacidad física máxima/);

  const incompleto = buildScene({ ciclos: 0, ritmo: '2500' });
  assert.equal(incompleto.context.sincronizarEficienciaInversa('pol'), null);
  assert.match(incompleto.elements.get('gruas-derivacion-pol').textContent, /completa Carga por Izada y Ciclos\/Hora/);
});

test('en modo Auto la eficiencia sigue siendo un input y el ritmo el resultado', () => {
  const { context, elements } = buildScene({ swl: 30, ciclos: 10, eficiencia: 80, ritmo: '5760', manual: false });
  assert.equal(context.isRitmoModoManual('pol'), false);
  assert.equal(context.sincronizarEficienciaInversa('pol'), null);
  // El slider no se reescribe desde el ritmo: conserva el valor del usuario.
  assert.equal(elements.get('gruas-eficiencia-num-pol').value, '80');
  assert.equal(elements.get('gruas-eficiencia-slider-pol').disabled, false);
});

test('el input de Ritmo Real conserva el vínculo inverso para la confirmación', () => {
  assert.match(indexSource, /oninput="updateRealRateDraft\('pol', this\.value\)"/);
  assert.match(indexSource, /oninput="updateRealRateDraft\('pod', this\.value\)"/);
  const draftHandler = extractDeclaration('updateRealRateDraft');
  assert.doesNotMatch(draftHandler, /sincronizarEficienciaInversa|recalcularDiasPuerto|runEngine|SeaCharterStore|window\.State/);
  const calcularStart = indexSource.indexOf("function calcularRitmoGrua(side = 'pol', options = {})");
  const calcularEnd = indexSource.indexOf('// ==========================================', calcularStart);
  const calcular = indexSource.slice(calcularStart, calcularEnd);
  assert.match(calcular, /sincronizarEficienciaInversa\(side\)/);
  // Los sliders admiten el rango completo 0-100 que exige el acotado.
  assert.match(indexSource, /id="gruas-eficiencia-slider-pol"[^>]*min="0"[^>]*max="100"/);
  assert.match(indexSource, /id="gruas-eficiencia-slider-pod"[^>]*min="0"[^>]*max="100"/);
});
