import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('autoSelectCementCarrierDischargeMethod exists and is exposed globally', () => {
  assert.match(indexSource, /function autoSelectCementCarrierDischargeMethod\(/);
  assert.match(indexSource, /window\.autoSelectCementCarrierDischargeMethod = autoSelectCementCarrierDischargeMethod;/);
});

test('autoSelectCementCarrierDischargeMethod switches POD from Semirremolque Neumático to Bombas Neumáticas when cargo is Cemento a granel', () => {
  const elements = new Map();
  const element = (id, value = '') => {
    const el = {
      id,
      value,
      options: [],
      dataset: {},
      classList: {
        contains: (cls) => Boolean(el[cls]),
        add: (cls) => { el[cls] = true; },
        remove: (cls) => { el[cls] = false; },
        toggle: (cls, state) => { el[cls] = state !== undefined ? state : !el[cls]; },
      },
      setAttribute: (attr, val) => { el[attr] = val; },
      appendChild: (opt) => { el.options.push(opt); }
    };
    elements.set(id, el);
    return el;
  };

  const cargoTypeEl = element('cargo-type', 'Minerales y Construcción');
  const cargoProductEl = element('cargo-product', 'Cemento a granel');
  const podMethodEl = element('metodo_descarga_pod', 'camion_tolva');
  podMethodEl.options = [
    { value: 'cinta_transportadora', text: 'Cinta Transportadora' },
    { value: 'bombas_neumaticas', text: 'Bombas Neumáticas' },
    { value: 'camion_tolva', text: 'Semirremolque Neumático' }
  ];
  const rateDischEl = element('rate-disch', '5184');
  rateDischEl.dataset = { manualOverride: 'true', autoMetodoDescarga: 'camion_tolva' };
  const moduloPodEl = element('modulo-camion-tolva-pod');
  moduloPodEl.hidden = false;
  element('camion-tolva-pod-capacidad-mt', '27');
  element('camion-tolva-pod-slots', '2');
  element('camion-tolva-pod-tiempo-ciclo-min', '15');
  element('turn-time-hours', '24');
  element('cargo-qty', '10000');
  const badgeEl = element('vessel-badge', 'Mini Bulker');

  let localStateKey = null;
  let localStateVal = null;
  const context = {
    window: {
      State: { cargo: 10000, vesselType: 'Mini Bulker', class: 'Mini Bulker' },
      SeaCharterVoyageCostEngine: {
        getVesselTypeDisplayLabel: () => 'Cement Carrier'
      }
    },
    document: {
      getElementById: (id) => elements.get(id) || null
    },
    updateSection2LocalState: (k, v) => { localStateKey = k; localStateVal = v; },
    getCentralizedVesselClass: () => 'Mini Bulker',
    renderMethodPills: () => {},
    handlePortMethodChange: () => {},
    recalcularDiasPuerto: () => {},
    actualizarModuloCamionTolva: () => {
      const active = elements.get('metodo_descarga_pod')?.value === 'camion_tolva';
      moduloPodEl.hidden = !active;
    }
  };

  const fnMatch = indexSource.match(/function autoSelectCementCarrierDischargeMethod\([\s\S]*?\n        \}/);
  assert.ok(fnMatch, 'autoSelectCementCarrierDischargeMethod must be defined in index.html');

  const script = `
    ${fnMatch[0]}
    window.autoSelectCementCarrierDischargeMethod = autoSelectCementCarrierDischargeMethod;
  `;

  vm.runInNewContext(script, context);
  const result = context.window.autoSelectCementCarrierDischargeMethod();

  assert.equal(result, true, 'Rule must trigger for Cemento a granel');
  assert.equal(podMethodEl.value, 'bombas_neumaticas', 'POD method must be automatically set to bombas_neumaticas');
  assert.equal(localStateKey, 'metodo_descarga_pod');
  assert.equal(localStateVal, 'bombas_neumaticas');
  assert.equal(context.window.State.metodo_descarga_pod, 'bombas_neumaticas');
  assert.equal(context.window.State.dischargeMethod, 'Bombas Neumáticas');
  assert.equal(moduloPodEl.hidden, true, 'Truck assistant for POD must be hidden');
  assert.equal(rateDischEl.value, '8000', 'Discharge rate must reflect ship pneumatic pumping engine rate (8,000 TM/D)');
});

test('autoSelectCementCarrierDischargeMethod triggers when vessel acts as Cement Carrier even if cargo is generic', () => {
  const elements = new Map();
  const element = (id, value = '') => {
    const el = {
      id,
      value,
      options: [{ value: 'camion_tolva', text: 'Semirremolque Neumático' }, { value: 'bombas_neumaticas', text: 'Bombas Neumáticas' }],
      dataset: {},
      classList: {
        add: (cls) => { el[cls] = true; },
        remove: (cls) => { el[cls] = false; },
        toggle: (cls, state) => { el[cls] = state !== undefined ? state : !el[cls]; },
      },
      setAttribute: (attr, val) => { el[attr] = val; },
      appendChild: (opt) => { el.options.push(opt); }
    };
    elements.set(id, el);
    return el;
  };

  element('cargo-type', 'Minerales y Construcción');
  element('cargo-product', 'Clínker');
  const podMethodEl = element('metodo_descarga_pod', 'camion_tolva');
  element('rate-disch', '3000');
  const moduloPodEl = element('modulo-camion-tolva-pod');
  element('vessel-badge', 'Cement Carrier');

  const context = {
    window: {
      State: { cargo: 10000, vesselType: 'Cement Carrier', class: 'Cement Carrier' },
      SeaCharterVoyageCostEngine: {
        getVesselTypeDisplayLabel: () => 'Cement Carrier'
      }
    },
    document: {
      getElementById: (id) => elements.get(id) || null
    },
    updateSection2LocalState: () => {},
    getCentralizedVesselClass: () => 'Cement Carrier',
    renderMethodPills: () => {},
    handlePortMethodChange: () => {},
    recalcularDiasPuerto: () => {},
    actualizarModuloCamionTolva: () => {
      moduloPodEl.hidden = elements.get('metodo_descarga_pod')?.value !== 'camion_tolva';
    }
  };

  const fnMatch = indexSource.match(/function autoSelectCementCarrierDischargeMethod\([\s\S]*?\n        \}/);
  vm.runInNewContext(`${fnMatch[0]}; window.autoSelectCementCarrierDischargeMethod = autoSelectCementCarrierDischargeMethod;`, context);
  const result = context.window.autoSelectCementCarrierDischargeMethod();

  assert.equal(result, true);
  assert.equal(podMethodEl.value, 'bombas_neumaticas');
  assert.equal(moduloPodEl.hidden, true);
});

test('autoSelectCementCarrierDischargeMethod preserves crane methods for packaged Big Bags', () => {
  const elements = new Map();
  const element = (id, value = '') => {
    const el = {
      id,
      value,
      options: [{ value: 'big_bags_barco', text: 'Big Bags - Grúa Barco' }],
      dataset: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
      },
      setAttribute: () => {}
    };
    elements.set(id, el);
    return el;
  };

  element('cargo-type', 'Minerales y Construcción');
  element('cargo-product', 'Big Bags (Minerales/Cemento)');
  const podMethodEl = element('metodo_descarga_pod', 'big_bags_barco');
  element('vessel-badge', 'Handysize');

  const context = {
    window: {
      State: { cargo: 10000, vesselType: 'Handysize', class: 'Handysize' },
      SeaCharterVoyageCostEngine: {
        getVesselTypeDisplayLabel: () => 'Handysize'
      }
    },
    document: {
      getElementById: (id) => elements.get(id) || null
    },
    getCentralizedVesselClass: () => 'Handysize'
  };

  const fnMatch = indexSource.match(/function autoSelectCementCarrierDischargeMethod\([\s\S]*?\n        \}/);
  vm.runInNewContext(`${fnMatch[0]}; window.autoSelectCementCarrierDischargeMethod = autoSelectCementCarrierDischargeMethod;`, context);
  const result = context.window.autoSelectCementCarrierDischargeMethod();

  assert.equal(result, false, 'Packaged Big Bags must not force pneumatic pump method');
  assert.equal(podMethodEl.value, 'big_bags_barco', 'Big Bags crane method must be preserved');
});

test('handlePortMethodChange calls actualizarModuloCamionTolva to synchronize truck module visibility on method change', () => {
  assert.match(indexSource, /function handlePortMethodChange\(side = 'pol'\) \{[\s\S]*?actualizarModuloCamionTolva\(\{ rerun: false \}\);/);
});

test('cargo-type and cargo-product onchange handlers trigger autoSelectCementCarrierDischargeMethod', () => {
  const cargoTypeMatch = indexSource.match(/<select[^>]*id="cargo-type"[^>]*onchange="([^"]*)"/);
  const cargoProductMatch = indexSource.match(/<select[^>]*id="cargo-product"[^>]*onchange="([^"]*)"/);

  assert.ok(cargoTypeMatch, 'cargo-type select must have onchange attribute');
  assert.ok(cargoProductMatch, 'cargo-product select must have onchange attribute');

  assert.match(cargoTypeMatch[1], /autoSelectCementCarrierDischargeMethod/);
  assert.match(cargoProductMatch[1], /autoSelectCementCarrierDischargeMethod/);
});
