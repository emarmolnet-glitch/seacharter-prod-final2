import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const engine = require('../voyage-cost-engine.js');
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

function buildCraneContext(elements = new Map(), overrides = {}) {
  const context = {
    Math,
    Object,
    String,
    Number,
    parseFloat,
    console,
    window: {},
    document: {
      getElementById: (id) => elements.get(id) || null
    },
    normalizarTipoCarga: () => 'general',
    getCentralizedVesselClass: () => '',
    getActiveCargoCategory: () => 'Carga Unitarizada / Envasada',
    getSelectedMethodLabel: () => '',
    isCraneMethod: (label) => String(label || '').includes('Grúa'),
    readNumeroGruasPuerto: () => 1,
    ...overrides
  };
  context.globalThis = context;

  const source = [
    extractDeclaration('BIG_BAGS_PORT_CRANE_PHYSICS'),
    extractDeclaration('getBigBagsPortCraneSpec'),
    extractDeclaration('isBigBagsPortCraneMethod'),
    extractDeclaration('getBigBagsPortCraneLiftCapacityMt'),
    extractDeclaration('getBigBagsPortCraneEfficiencyPct'),
    extractDeclaration('getSwlForMethod'),
    extractDeclaration('getTaraForMethod'),
    extractDeclaration('getAutoEficienciaForMethodAndCategory'),
    extractDeclaration('getCapacidadTeoricaGrua'),
    extractDeclaration('calcularRitmoGruaTeorico')
  ].join('\n');

  vm.runInNewContext(source, context);
  return context;
}

function craneFields(side, { swl, tara, ciclos, eficiencia }) {
  return [
    [`gruas-swl-${side}`, { value: String(swl) }],
    [`gruas-tara-${side}`, { value: String(tara) }],
    [`gruas-ciclos-${side}`, { value: String(ciclos) }],
    [`gruas-eficiencia-num-${side}`, { value: String(eficiencia) }]
  ];
}

test('shared engine fixes the multiple spreader at 14 big bags × 1.5 MT = 21.0 MT per cycle', () => {
  const spec = engine.BIG_BAGS_PORT_CRANE;
  assert.equal(spec.bagsPerLift, 14);
  assert.equal(spec.bagWeightMt, 1.5);
  assert.equal(spec.liftCapacityMt, 21.0);
  assert.equal(spec.bagsPerLift * spec.bagWeightMt, 21.0);
  assert.equal(engine.getBigBagsPortCraneLiftCapacityMt(), 21.0);
  // La tara del accesorio ya está contenida en el peso de referencia.
  assert.equal(spec.taraMt, 0);
});

test('shared engine detects big bag port cranes by label and by method value, at POL and POD alike', () => {
  assert.equal(engine.isBigBagsPortCraneMethod('Big Bags - Grúa Portuaria'), true);
  assert.equal(engine.isBigBagsPortCraneMethod('big_bags_portuaria'), true);
  assert.equal(engine.isBigBagsPortCraneMethod('BIG BAGS - PORT CRANE'), true);
  // Grúa portuaria genérica con mercancía declarada en big bags.
  assert.equal(engine.isBigBagsPortCraneMethod('grua_portuaria_30mt', 'big_bags'), true);

  // Grúa del buque: queda fuera de la regla de grúas portuarias.
  assert.equal(engine.isBigBagsPortCraneMethod('Big Bags - Grúa Barco'), false);
  assert.equal(engine.isBigBagsPortCraneMethod('big_bags_barco'), false);
  // Otro útil sobre grúa portuaria: no iza 14 bolsas por ciclo.
  assert.equal(engine.isBigBagsPortCraneMethod('Cuchara (Grab) - Grúa Portuaria', 'big_bags'), false);
  assert.equal(engine.isBigBagsPortCraneMethod('Paletizado - Grúa Portuaria', 'big_bags'), false);
  assert.equal(engine.isBigBagsPortCraneMethod('Cinta Transportadora'), false);
});

test('shared engine never assumes 100% mechanical efficiency and stays inside the 70-80% band', () => {
  const spec = engine.BIG_BAGS_PORT_CRANE;
  assert.equal(spec.efficiencyMinPct, 70);
  assert.equal(spec.efficiencyMaxPct, 80);
  assert.equal(spec.efficiencyDefaultPct, 75);

  const classes = ['', 'Handysize', 'Coaster', 'Mini Bulker', 'Supramax', 'Ultramax', 'Panamax', 'Capesize'];
  for (const vesselClass of classes) {
    const efficiency = engine.getBigBagsPortCraneEfficiencyPct(vesselClass);
    assert.ok(efficiency >= 70 && efficiency <= 80, `${vesselClass || 'sin clase'} => ${efficiency}%`);
    assert.notEqual(efficiency, 100);
  }

  assert.equal(engine.getBigBagsPortCraneEfficiencyPct('Coaster'), 70);
  assert.equal(engine.getBigBagsPortCraneEfficiencyPct('Supramax'), 80);
  assert.equal(engine.getBigBagsPortCraneEfficiencyPct('Handysize'), 75);
});

test('shared engine multiplies 21.0 MT by cycles per hour, operating hours and cranes, then applies the bottleneck', () => {
  // 21.0 MT × 30 ciclos/h × 24 h × 1 grúa × 75% = 11.340 MT/día
  assert.equal(engine.calculateBigBagsPortCraneDailyRate({ cyclesPerHour: 30, cranes: 1, efficiencyPct: 75 }), 11340);
  // Dos grúas escalan el rendimiento del nodo portuario.
  assert.equal(engine.calculateBigBagsPortCraneDailyRate({ cyclesPerHour: 30, cranes: 2, efficiencyPct: 75 }), 22680);
  // Horas operativas reducidas (turno diurno).
  assert.equal(
    engine.calculateBigBagsPortCraneDailyRate({ cyclesPerHour: 30, cranes: 1, efficiencyPct: 75, operatingHoursPerDay: 12 }),
    5670
  );
  // La eficiencia siempre recorta el rendimiento teórico.
  const theoretical = engine.calculateBigBagsPortCraneDailyRate({ cyclesPerHour: 30, cranes: 1, efficiencyPct: 100 });
  assert.ok(engine.calculateBigBagsPortCraneDailyRate({ cyclesPerHour: 30, cranes: 1, efficiencyPct: 75 }) < theoretical);
  // Datos físicos incompletos no inventan rendimiento.
  assert.equal(engine.calculateBigBagsPortCraneDailyRate({ cyclesPerHour: 0, cranes: 1 }), 0);
});

test('index.html lift defaults switch to 21.0 MT with zero accessory tare for big bag port cranes', () => {
  const context = buildCraneContext();

  assert.equal(context.getSwlForMethod('Big Bags - Grúa Portuaria'), 21.0);
  assert.equal(context.getTaraForMethod('Big Bags - Grúa Portuaria'), 0);

  // Los demás métodos conservan su física original.
  assert.equal(context.getSwlForMethod('Big Bags - Grúa Barco'), 8);
  assert.equal(context.getTaraForMethod('Big Bags - Grúa Barco'), 0.5);
  assert.equal(context.getSwlForMethod('Paletizado - Grúa Portuaria'), 4);
  assert.equal(context.getTaraForMethod('Paletizado - Grúa Portuaria'), 1.0);
  assert.equal(context.getSwlForMethod('Cuchara (Grab) - Grúa Portuaria'), 30);
  assert.equal(context.getTaraForMethod('Cuchara (Grab) - Grúa Portuaria'), 12);
  assert.equal(context.getSwlForMethod('Hierro/Acero - Grúa Portuaria'), 15);
});

test('index.html replaces the 100% port crane efficiency with the mandatory 70-80% truck bottleneck', () => {
  const category = 'Carga Unitarizada / Envasada';

  const handysize = buildCraneContext();
  assert.equal(handysize.getAutoEficienciaForMethodAndCategory('Big Bags - Grúa Portuaria', category, 'Handysize'), 75);
  assert.equal(handysize.getAutoEficienciaForMethodAndCategory('Big Bags - Grúa Portuaria', category, 'Coaster'), 70);
  assert.equal(handysize.getAutoEficienciaForMethodAndCategory('Big Bags - Grúa Portuaria', category, 'Supramax'), 80);

  // Nunca 100% ni el 85% genérico previo de grúa portuaria.
  for (const vesselClass of ['', 'Handysize', 'Coaster', 'Mini Bulker', 'Supramax', 'Capesize']) {
    const efficiency = handysize.getAutoEficienciaForMethodAndCategory('Big Bags - Grúa Portuaria', category, vesselClass);
    assert.ok(efficiency >= 70 && efficiency <= 80, `${vesselClass || 'sin clase'} => ${efficiency}%`);
  }

  // Métodos ajenos a la regla mantienen su comportamiento previo.
  assert.equal(handysize.getAutoEficienciaForMethodAndCategory('Cuchara (Grab) - Grúa Portuaria', 'Minerales y Construcción', 'Handysize'), 100);
  assert.equal(handysize.getAutoEficienciaForMethodAndCategory('Big Bags - Grúa Barco', category, 'Handysize'), 25);
});

test('index.html pins the 21.0 MT lift even when the SWL and tare fields hold stale values', () => {
  const elements = new Map(craneFields('pol', { swl: 8, tara: 0.5, ciclos: 30, eficiencia: 75 }));
  const context = buildCraneContext(elements, {
    getSelectedMethodLabel: () => 'Big Bags - Grúa Portuaria'
  });

  // 21.0 MT × 30 × 24 × 1 × 75% = 11.340 — no (8 - 0.5) × 30 × 24 × 75% = 4.050
  assert.equal(context.calcularRitmoGruaTeorico('pol'), 11340);
});

test('POL and POD remain independent nodes: a port crane at POL never seeds POD performance', () => {
  const elements = new Map([
    ...craneFields('pol', { swl: 21, tara: 0, ciclos: 30, eficiencia: 75 }),
    ...craneFields('pod', { swl: 8, tara: 0.5, ciclos: 15, eficiencia: 25 })
  ]);

  const labels = { pol: 'Big Bags - Grúa Portuaria', pod: 'Big Bags - Grúa Barco' };
  const context = buildCraneContext(elements, {
    getSelectedMethodLabel: (side) => labels[side]
  });

  // POL: grúa portuaria con izada fija de 21.0 MT y cuello de botella terrestre.
  assert.equal(context.calcularRitmoGruaTeorico('pol'), 11340);
  // POD: grúa del buque, física propia (8 - 0.5) × 15 × 24 × 25% = 675.
  assert.equal(context.calcularRitmoGruaTeorico('pod'), 675);
  assert.notEqual(context.calcularRitmoGruaTeorico('pod'), context.calcularRitmoGruaTeorico('pol'));
});

test('the port crane rhythm cascades into laytime and the break-even chain', () => {
  // El ritmo derivado alimenta rate-load/rate-disch, que runEngine convierte en
  // días de puerto, días totales, coste base por tonelada y Break-Even.
  assert.match(indexSource, /function calcularRitmoGruaTeorico/);
  assert.match(indexSource, /function publicarRitmoRealEnEstado/);
  assert.match(indexSource, /const ritmoGrua = \(typeof calcularRitmoGruaTeorico === 'function'\) \? calcularRitmoGruaTeorico\(side\) : null;/);
  assert.match(indexSource, /publicarRitmoRealEnEstado\(side, ritmoCalculado\);/);
  // calcularRitmoGrua cierra el ciclo financiero llamando al motor principal.
  assert.match(indexSource, /if \(typeof runEngine === 'function'\) runEngine\(\);/);
  // El grid de resultados publica el Break-Even recalculado.
  assert.match(indexSource, /document\.getElementById\('res-breakeven'\)\.innerText = `\$\$\{breakEvenArmadorDisplay\.toFixed\(2\)\}`;/);
});

test('the crane submodule surfaces the 14 × 1.5 MT derivation and the truck bottleneck note', () => {
  assert.match(indexSource, /Carga Bruta por Izada \(\$\{spec\.bagsPerLift\} × \$\{spec\.bagWeightMt\} MT\)/);
  assert.match(indexSource, /big bags × \$\{spec\.bagWeightMt\} MT/);
  assert.match(indexSource, /espera de grúa por logística terrestre/);
});
