import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Conexión Motor de Ritmos - PDA y Finanzas: actualizarCostesPDAPorMetodo adjust crane costs appropriately', () => {
  let runEngineCalled = false;

  const mockPolSelect = {
    options: [{ textContent: 'Cuchara (Grab) - Grúa Barco' }],
    selectedIndex: 0,
    value: 'cuchara_grab'
  };

  const context = {
    window: {
      State: {
        pdaPolBreakdown: [
          { item: 'Tasas Portuarias', amount: 5000 },
          { item: 'Alquiler de Grúa de Tierra', amount: 1800 }
        ],
        pdaPodBreakdown: [
          { item: 'Tasas Portuarias POD', amount: 6000 },
          { item: 'Alquiler de Grúa Portuaria', amount: 1800 }
        ]
      },
      runEngine: () => { runEngineCalled = true; }
    },
    document: {
      getElementById: (id) => {
        if (id === 'metodo_carga') return mockPolSelect;
        if (id === 'metodo_descarga_pod') return { options: [{ textContent: 'Grúa Portuaria 30MT' }], selectedIndex: 0, value: 'grua_portuaria_30mt' };
        if (id === 'pda-pol') return { value: '6800' };
        if (id === 'pda-pod') return { value: '7800' };
        return null;
      }
    }
  };

  const script = `
    ${indexSource.match(/function actualizarCostesPDAPorMetodo\([\s\S]*?\n        \}/)[0]}
    window.actualizarCostesPDAPorMetodo = actualizarCostesPDAPorMetodo;
  `;

  vm.runInNewContext(script, context);

  // Execute for POL (Grúa Barco)
  context.window.actualizarCostesPDAPorMetodo('pol');

  const polCraneItem = context.window.State.pdaPolBreakdown.find(i => i.item.includes('Grúa'));
  assert.equal(polCraneItem.amount, 0, 'Shore crane rental cost must be forced to $0 for Grúa Barco');
  assert.equal(runEngineCalled, true, 'runEngine must be called immediately after adjusting PDA costs');

  // Change POL to Grúa Portuaria
  mockPolSelect.options = [{ textContent: 'Grúa Portuaria 30MT' }];
  mockPolSelect.value = 'grua_portuaria_30mt';
  runEngineCalled = false;

  context.window.actualizarCostesPDAPorMetodo('pol');
  const polCraneRestored = context.window.State.pdaPolBreakdown.find(i => i.item.includes('Grúa'));
  assert.equal(polCraneRestored.amount, 1800, 'Standard crane cost must be restored for Grúa Portuaria');
  assert.equal(runEngineCalled, true, 'runEngine must be invoked on restoration');
});

test('PDA Dinámica: actualizarPDADinamica computes berth days adjustment and crane method deductions correctly', () => {
  let runEngineCount = 0;
  const pdaInputPol = { value: '10000', dataset: { basePda: '10000' } };
  const rateInputPol = { value: '2500', dataset: { tpdAutoSombra: '5000' } };
  const mockPolSelect = { options: [{ textContent: 'Grúa Portuaria 30MT' }], selectedIndex: 0, value: 'grua_portuaria_30mt' };

  const context = {
    window: {
      State: { cargo: 10000, tpdAutoSombraPol: 5000 },
      runEngine: () => { runEngineCount++; }
    },
    document: {
      getElementById: (id) => {
        if (id === 'pda-pol') return pdaInputPol;
        if (id === 'cargo-qty') return { value: '10000' };
        if (id === 'rate-load') return rateInputPol;
        if (id === 'metodo_carga') return mockPolSelect;
        return null;
      }
    }
  };

  const script = `
    ${indexSource.match(/function calcularDeltaDias\([\s\S]*?\n        \}/)[0]}
    ${indexSource.match(/const COSTE_MUELLAJE_DIARIO = [\s\S]*?\n        function actualizarPDADinamica\([\s\S]*?\n        \}/)[0]}
    window.actualizarPDADinamica = actualizarPDADinamica;
  `;

  vm.runInNewContext(script, context);

  // 1. Berth adjustment test: +2 days @ $800/day = +$1,600 on base $10,000 -> $11,600
  context.window.actualizarPDADinamica('pol');
  assert.equal(pdaInputPol.value, 11600, 'PDA POL should increase by +$1,600 (+2 days berth delta)');
  assert.equal(runEngineCount, 1, 'runEngine should be triggered on PDA update');

  // 2. Crane method test: Change to "Grúa Barco" -> -$20,000 on base ($2.00/MT * 10,000 MT)
  // Base = $30,000, delta = 0 days (rate set to 5000), Grúa Barco adjustment = -$20,000 -> $10,000
  pdaInputPol.dataset.basePda = '30000';
  pdaInputPol.value = '30000';
  rateInputPol.value = '5000';
  mockPolSelect.options = [{ textContent: 'Cuchara (Grab) - Grúa Barco' }];
  mockPolSelect.selectedIndex = 0;
  mockPolSelect.value = 'cuchara_grab';

  context.window.actualizarPDADinamica('pol');
  assert.equal(pdaInputPol.value, 10000, 'PDA POL should decrease by $20,000 for Grúa Barco gear ($2.00/MT * 10,000 MT)');

  // 3. Restore crane method to "Grúa Portuaria" -> 0 deduction from base $30,000 -> $30,000
  mockPolSelect.options = [{ textContent: 'Grúa Portuaria 30MT' }];
  mockPolSelect.selectedIndex = 0;
  mockPolSelect.value = 'grua_portuaria_30mt';

  context.window.actualizarPDADinamica('pol');
  assert.equal(pdaInputPol.value, 30000, 'PDA POL should restore to $30,000 for shore crane gear');
});

test('autoFillPDA Refresh Button: anchors new basePda and reapplies dynamic modifiers', async () => {
  let runEngineCount = 0;
  const pdaInputPol = { value: '0', dataset: {}, dispatchEvent: () => {} };
  const mockPolSelect = { options: [{ textContent: 'Grúa Portuaria 30MT' }], selectedIndex: 0, value: 'grua_portuaria_30mt' };

  class MockEvent {
    constructor(type) { this.type = type; }
  }

  const context = {
    Event: MockEvent,
    State: { smartAdjustments: {} },
    window: {
      State: { smartAdjustments: {} },
      runEngine: () => { runEngineCount++; },
      showToast: () => {}
    },
    document: {
      getElementById: (id) => {
        if (id === 'pda-pol') return pdaInputPol;
        if (id === 'cargo-qty') return { value: '10000' };
        if (id === 'vessel-dwt') return { value: '15000' };
        if (id === 'vessel-net-tonnage') return { value: '6000' };
        if (id === 'vessel-loa') return { value: '140' };
        if (id === 'port-pol') return { value: 'Barcelona' };
        if (id === 'cargo-type') return { value: 'Dry Bulk' };
        if (id === 'rate-load') return { value: '5000', dataset: { tpdAutoSombra: '5000' } };
        if (id === 'metodo_carga') return mockPolSelect;
        return null;
      }
    },
    fetchPdaTariffFromDataBridge: async () => null,
    calculateGlobalPdaEstimateBreakdown: () => ({
      totalPDA: 10000,
      tasasAutoridad: 3000,
      navManiobra: 2000,
      muelleEstadia: 3000,
      agenciaVarios: 2000
    }),
    setPdaCalculationStatus: () => {},
    showToast: () => {},
    runEngine: () => { runEngineCount++; }
  };

  const script = `
    ${indexSource.match(/function calcularDeltaDias\([\s\S]*?\n        \}/)[0]}
    ${indexSource.match(/const COSTE_MUELLAJE_DIARIO = [\s\S]*?\n        function actualizarPDADinamica\([\s\S]*?\n        \}/)[0]}
    ${indexSource.match(/async function autoFillPDA\([\s\S]*?\n	        \}/)[0]}
    window.actualizarPDADinamica = actualizarPDADinamica;
    window.autoFillPDA = autoFillPDA;
  `;

  vm.runInNewContext(script, context);

  await context.window.autoFillPDA('pol', false);

  assert.equal(pdaInputPol.dataset.basePda, '10000', 'autoFillPDA must save dataset.basePda anchor');
  assert.equal(context.window.State.basePdaPol, 10000, 'autoFillPDA must save State.basePdaPol anchor');
  assert.equal(pdaInputPol.value, 10000, 'pdaInput.value must match calculated base with 0 delta/gear adjustment');

  // Change gear to Grúa Barco
  mockPolSelect.options = [{ textContent: 'Cuchara (Grab) - Grúa Barco' }];
  mockPolSelect.value = 'cuchara_grab';

  await context.window.autoFillPDA('pol', false);

  assert.equal(pdaInputPol.dataset.basePda, '10000', 'basePda anchor remains $10,000');
  assert.equal(pdaInputPol.value, 0, 'PDA value reflects -$20,000 crane deduction ($10,000 base - $20,000 = $0 min)');
  assert.ok(runEngineCount > 0, 'runEngine must be called on refresh');
});

test('Conexión Motor de Ritmos - PDA y Finanzas: initMotorRitmosYFinanzas binds input & change listeners', () => {
  let rateInputListener = null;
  let methodChangeListener = null;
  let recalcularCalled = false;
  let runEngineCalled = false;

  const context = {
    window: {
      State: { cargo: 10000, loadRate: 5000, dischRate: 5000 },
      recalcularDiasPuerto: () => { recalcularCalled = true; },
      runEngine: () => { runEngineCalled = true; },
      actualizarCostesPDAPorMetodo: () => {},
      actualizarPDADinamica: () => {}
    },
    document: {
      getElementById: (id) => {
        if (id === 'rate-load') return {
          value: '2500',
          addEventListener: (evt, fn) => { if (evt === 'input') rateInputListener = fn; }
        };
        if (id === 'metodo_carga') return {
          addEventListener: (evt, fn) => { if (evt === 'change') methodChangeListener = fn; }
        };
        if (id === 'cargo-qty') return { value: '10000' };
        return null;
      }
    }
  };

  const script = `
    ${indexSource.match(/function actualizarCostesPDAPorMetodo\([\s\S]*?\n        \}/)[0]}
    ${indexSource.match(/function initMotorRitmosYFinanzas\([\s\S]*?\n        \}/)[0]}
    window.initMotorRitmosYFinanzas = initMotorRitmosYFinanzas;
  `;

  vm.runInNewContext(script, context);
  context.window.initMotorRitmosYFinanzas();

  assert.notEqual(rateInputListener, null, 'Rate input listener must be registered');
  assert.notEqual(methodChangeListener, null, 'Method change listener must be registered');

  // Trigger rate change input event
  rateInputListener();

  assert.equal(recalcularCalled, true, 'recalcularDiasPuerto must be called on rate change');
  assert.equal(runEngineCalled, true, 'runEngine must be called on rate change');
  assert.equal(context.window.State.portDaysLoad, 4, '10,000 TM / 2,500 TM/d = 4 port days for POL');
  assert.equal(context.window.State.ritmoMode_pol, 'manual', 'ritmoMode_pol must be manual after rate input');
});
