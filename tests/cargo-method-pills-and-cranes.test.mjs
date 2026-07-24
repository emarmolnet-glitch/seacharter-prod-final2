import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Fase 1: equipmentMatrix uses exact refactored categories without generic 30MT port crane', () => {
  assert.match(indexSource, /const equipmentMatrix = Object\.freeze\(\{/);
  assert.match(indexSource, /"Minerales y Construcción": \["Cuchara \(Grab\) - Grúa Barco", "Cuchara \(Grab\) - Grúa Portuaria", "Cinta Transportadora", "Camión Tolva", "Big Bags - Grúa Barco", "Big Bags - Grúa Portuaria"\]/);
  assert.match(indexSource, /"Biomasa y Combustibles Sólidos": \["Cuchara \(Grab\) - Grúa Barco", "Cuchara \(Grab\) - Grúa Portuaria", "Cinta Transportadora", "Camión Tolva"\]/);
  assert.match(indexSource, /"Carga Siderúrgica y Metales": \["Hierro\/Acero - Grúa Barco", "Hierro\/Acero - Grúa Portuaria", "Cuchara \(Grab\) - Grúa Barco", "Cuchara \(Grab\) - Grúa Portuaria"\]/);
  assert.match(indexSource, /"Carga Unitarizada \/ Envasada": \["Paletizado - Grúa Barco", "Paletizado - Grúa Portuaria", "Big Bags - Grúa Barco", "Big Bags - Grúa Portuaria"\]/);
  assert.match(indexSource, /"Carga de Proyecto \(Breakbulk\)": \["Hierro\/Acero - Grúa Barco", "Hierro\/Acero - Grúa Portuaria", "Cuchara \(Grab\) - Grúa Barco", "Cuchara \(Grab\) - Grúa Portuaria"\]/);
});

test('Fase 2: Dynamic SWL label text rendering for Big Bags and Paletizado', () => {
  assert.match(indexSource, /function updateSwlLabelText/);
  assert.match(indexSource, /Carga Bruta por Izada \(MT\)/);
  assert.match(indexSource, /SWL Grúa \(MT\)/);

  const context = {
    document: {
      getElementById: (id) => ({ textContent: '' }),
    },
  };

  const script = `
    function updateSwlLabelText(side = 'pol', label = '') {
        const labelId = side === 'pod' ? 'label-gruas-swl-pod' : 'label-gruas-swl-pol';
        const labelEl = document.getElementById(labelId);
        if (!labelEl) return;

        const l = String(label || '');
        if (l.includes('Big Bags') || l.includes('Paletizado')) {
            labelEl.textContent = 'Carga Bruta por Izada (MT)';
        } else {
            labelEl.textContent = 'SWL Grúa (MT)';
        }
        return labelEl.textContent;
    }
  `;

  vm.runInNewContext(script, context);
});

test('Fase 3: Auto-adjustment physics watchers for SWL, TARA, and CICLOS', () => {
  assert.match(indexSource, /function getSwlForMethod/);
  assert.match(indexSource, /function getTaraForMethod/);
  assert.match(indexSource, /function getCiclosForMethod/);

  const context = {
    getSwlForMethod: null,
    getTaraForMethod: null,
    getCiclosForMethod: null,
  };

  const script = `
    function getSwlForMethod(label = '') {
        const l = String(label || '');
        if (l.includes('Cuchara')) return 30;
        if (l.includes('Big Bags')) return 8;
        if (l.includes('Paletizado')) return 4;
        if (l.includes('Hierro/Acero')) return 15;
        return 30;
    }
    function getTaraForMethod(label = '') {
        const l = String(label || '');
        if (l.includes('Cuchara')) return 12;
        if (l.includes('Big Bags')) return 0.5;
        if (l.includes('Paletizado')) return 1.0;
        if (l.includes('Hierro/Acero')) return 0.5;
        return 0;
    }
    function getCiclosForMethod(label = '') {
        const l = String(label || '');
        if (l.includes('Grúa Barco')) return 15;
        if (l.includes('Grúa Portuaria')) return 30;
        return 15;
    }
  `;

  vm.runInNewContext(script, context);

  // SWL (Peso Bruto): Cuchara = 30, Big Bags = 8, Paletizado = 4, Hierro/Acero = 15
  assert.equal(context.getSwlForMethod('Cuchara (Grab) - Grúa Barco'), 30);
  assert.equal(context.getSwlForMethod('Big Bags - Grúa Barco'), 8);
  assert.equal(context.getSwlForMethod('Paletizado - Grúa Portuaria'), 4);
  assert.equal(context.getSwlForMethod('Hierro/Acero - Grúa Barco'), 15);

  // TARA: Cuchara = 12, Big Bags = 0.5, Paletizado = 1.0, Hierro/Acero = 0.5
  assert.equal(context.getTaraForMethod('Cuchara (Grab) - Grúa Barco'), 12);
  assert.equal(context.getTaraForMethod('Big Bags - Grúa Barco'), 0.5);
  assert.equal(context.getTaraForMethod('Paletizado - Grúa Barco'), 1.0);
  assert.equal(context.getTaraForMethod('Hierro/Acero - Grúa Portuaria'), 0.5);

  // CICLOS: Grúa Barco = 15, Grúa Portuaria = 30
  assert.equal(context.getCiclosForMethod('Cuchara (Grab) - Grúa Barco'), 15);
  assert.equal(context.getCiclosForMethod('Cuchara (Grab) - Grúa Portuaria'), 30);
});

test('Fase 4: Operational intelligence auto-adjusts Eficiencia Operativa for Grúa Barco by category', () => {
  assert.match(indexSource, /function getAutoEficienciaForMethodAndCategory/);

  const context = {
    getAutoEficienciaForMethodAndCategory: null,
  };

  const script = `
    function getAutoEficienciaForMethodAndCategory(label = '', category = '') {
        const l = String(label || '');
        if (!l.includes('Grúa Barco')) return 100;
        switch (category) {
            case 'Minerales y Construcción':
                return 50;
            case 'Biomasa y Combustibles Sólidos':
                return 40;
            case 'Carga Unitarizada / Envasada':
            case 'Carga Unitizada / Envasada':
            case 'Carga de Proyecto (Breakbulk)':
                return 25;
            case 'Carga Siderúrgica y Metales':
                return 15;
            default:
                return 100;
        }
    }
  `;

  vm.runInNewContext(script, context);

  assert.equal(context.getAutoEficienciaForMethodAndCategory('Cuchara (Grab) - Grúa Barco', 'Minerales y Construcción'), 50);
  assert.equal(context.getAutoEficienciaForMethodAndCategory('Cuchara (Grab) - Grúa Barco', 'Biomasa y Combustibles Sólidos'), 40);
  assert.equal(context.getAutoEficienciaForMethodAndCategory('Big Bags - Grúa Barco', 'Carga Unitarizada / Envasada'), 25);
  assert.equal(context.getAutoEficienciaForMethodAndCategory('Hierro/Acero - Grúa Barco', 'Carga Siderúrgica y Metales'), 15);
  // Shore crane resets or stays 100%
  assert.equal(context.getAutoEficienciaForMethodAndCategory('Cuchara (Grab) - Grúa Portuaria', 'Minerales y Construcción'), 100);
});

test('Fase 5: Motor de cálculo con fricción inyecta resultado en RITMO REAL y readonly', () => {
  const elements = new Map([
    ['metodo_carga', { value: 'cuchara_grab' }],
    ['gruas-swl-pol', { value: '30' }],
    ['gruas-tara-pol', { value: '12' }],
    ['gruas-ciclos-pol', { value: '15' }],
    ['gruas-eficiencia-num-pol', { value: '50' }],
    ['ritmo_nominal_pol', { value: '1' }],
    ['rate-load', { value: '0', readOnly: false }],
  ]);

  const context = {
    Math,
    parseFloat,
    document: {
      getElementById: (id) => elements.get(id) || null,
    },
    METHOD_LABEL_BY_VALUE: {
      cuchara_grab: 'Cuchara (Grab) - Grúa Barco',
    },
    isCraneMethod: () => true,
    readNumeroGruasPuerto: () => 1,
    setRitmoManualIndicator: () => {},
    window: {},
  };

  const script = `
    function calcularRitmoGrua(side = 'pol') {
        const selectId = side === 'pod' ? 'metodo_descarga_pod' : 'metodo_carga';
        const val = document.getElementById(selectId)?.value || '';
        const label = METHOD_LABEL_BY_VALUE[val] || '';
        if (!isCraneMethod(label)) return;

        const swlId = side === 'pod' ? 'gruas-swl-pod' : 'gruas-swl-pol';
        const taraId = side === 'pod' ? 'gruas-tara-pod' : 'gruas-tara-pol';
        const ciclosId = side === 'pod' ? 'gruas-ciclos-pod' : 'gruas-ciclos-pol';
        const eficienciaId = side === 'pod' ? 'gruas-eficiencia-num-pod' : 'gruas-eficiencia-num-pol';
        const rateInputId = side === 'pod' ? 'rate-disch' : 'rate-load';

        const swl = Math.max(0, parseFloat(document.getElementById(swlId)?.value) || 30);
        const tara = Math.max(0, parseFloat(document.getElementById(taraId)?.value) || 0);
        const ciclosHora = Math.max(0, parseFloat(document.getElementById(ciclosId)?.value) || 0);
        const eficiencia = Math.min(100, Math.max(1, parseFloat(document.getElementById(eficienciaId)?.value) || 100));
        const nGruas = readNumeroGruasPuerto(side);

        const ritmoCalculado = Math.max(0, Math.round((((swl - tara) * ciclosHora * 24) * nGruas) * (eficiencia / 100)));

        const rateInput = document.getElementById(rateInputId);
        if (rateInput) {
            rateInput.value = String(ritmoCalculado);
            rateInput.readOnly = true;
        }
    }
    calcularRitmoGrua('pol');
  `;

  vm.runInNewContext(script, context);

  const rateInput = elements.get('rate-load');
  // (((30 - 12) * 15 * 24) * 1) * (50 / 100) = 6480 * 0.5 = 3240
  assert.equal(rateInput.value, '3240');
  assert.equal(rateInput.readOnly, true);
});

test('Fase 6: Derived isGearedVessel flag is true iff POL or POD contain "Grúa Barco"', () => {
  assert.match(indexSource, /function checkIsGearedVessel/);
  assert.match(indexSource, /window\.isGearedVessel = isGeared/);

  const context = {
    window: {},
    polLabel: 'Cuchara (Grab) - Grúa Barco',
    podLabel: 'Cinta Transportadora',
  };

  const script = `
    function checkIsGearedVessel() {
        const isGeared = polLabel.includes('Grúa Barco') || podLabel.includes('Grúa Barco');
        window.isGearedVessel = isGeared;
        return isGeared;
    }
    checkIsGearedVessel();
  `;

  vm.runInNewContext(script, context);
  assert.equal(context.window.isGearedVessel, true);
});

test('Fase 7: GRAB CAPACITY (CBM) input is only visible and enabled when POL or POD method contains "Cuchara"', () => {
  assert.match(indexSource, /id="contenedor-grab-capacity"/);
  assert.match(indexSource, /function actualizarGrabCapacityVisibility/);

  const containerState = { classList: new Set(), style: { display: '' } };
  const inputState = { disabled: false };

  const context = {
    document: {
      getElementById: (id) => {
        if (id === 'contenedor-grab-capacity') return {
          classList: {
            toggle: (cls, force) => force ? containerState.classList.add(cls) : containerState.classList.delete(cls)
          },
          style: containerState.style
        };
        if (id === 'grab-capacity-cbm') return inputState;
        return null;
      }
    },
    polLabel: 'Cuchara (Grab) - Grúa Barco',
    podLabel: 'Cinta Transportadora'
  };

  const script = `
    function actualizarGrabCapacityVisibility() {
        const usesCuchara = polLabel.includes('Cuchara') || podLabel.includes('Cuchara');
        const containerEl = document.getElementById('contenedor-grab-capacity');
        const inputEl = document.getElementById('grab-capacity-cbm');

        if (containerEl) {
            containerEl.classList.toggle('hidden', !usesCuchara);
            containerEl.style.display = usesCuchara ? '' : 'none';
        }
        if (inputEl) {
            inputEl.disabled = !usesCuchara;
        }
    }
    actualizarGrabCapacityVisibility();
  `;

  vm.runInNewContext(script, context);
  assert.equal(containerState.classList.has('hidden'), false);
  assert.equal(inputState.disabled, false);

  // Non-cuchara method (e.g. Big Bags)
  context.polLabel = 'Big Bags - Grúa Barco';
  vm.runInNewContext(script, context);
  assert.equal(containerState.classList.has('hidden'), true);
  assert.equal(containerState.style.display, 'none');
  assert.equal(inputState.disabled, true);
});

test('Camión Tolva and Cinta Transportadora isolation: crane submodule hidden and rate input editable', () => {
  assert.match(indexSource, /function actualizarModuloCamionTolva/);
  assert.match(indexSource, /function aplicarRitmoCamionTolvaPol/);
  assert.match(indexSource, /id="modulo-camion-tolva-pol"/);
  assert.match(indexSource, /Asistente Camión Tolva POL/);
});
