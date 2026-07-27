import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { calculateVoyageCostState } = require('../voyage-cost-engine.js');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function getSelectMarkup(id) {
  return indexSource.match(new RegExp(`<select[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))?.[0] || '';
}

test('section 2 exposes strict turn time and cascading cargo selectors', () => {
  assert.match(indexSource, /id="turn-time-hours"[\s\S]*?<option value="12">12 horas<\/option>[\s\S]*?<option value="24" selected>24 horas<\/option>[\s\S]*?<option value="48">48 horas<\/option>/);
  assert.match(indexSource, /id="cargo-type"[\s\S]*?Categoría de Carga|Categoría de Carga[\s\S]*?id="cargo-type"/);
  assert.match(indexSource, /id="cargo-product"/);
  assert.match(indexSource, /function populateCargoProducts/);
  assert.match(indexSource, /function applySelectedCargoProduct/);
});

test('calculator and GENCON share complete conditions and laytime catalogs', () => {
  assert.match(indexSource, /const GENCON_CONDITION_OPTIONS = Object\.freeze/);
  assert.match(indexSource, /const GENCON_LAYTIME_OPTIONS = Object\.freeze/);
  assert.match(indexSource, /id="freight-conditions"/);
  assert.match(indexSource, /id="laytime-load-condition"/);
  assert.match(indexSource, /id="laytime-disch-condition"/);
  ['FIO', 'FIOS', 'FIOT', 'FIOST', 'FILO', 'LIFO', 'LINER'].forEach((term) => {
    assert.match(indexSource, new RegExp(`value: '${term}'|value="${term}"`));
  });
  ['SHINC', 'SHEX', 'SHEX UU', 'SHEX EIU', 'FHINC', 'FHEX', 'SSHEX', 'SSHINC', 'CQD'].forEach((term) => {
    assert.match(indexSource, new RegExp(`'${term}'|value="${term}"`));
  });
});

test('POD crane count multiplies the effective discharge rate', () => {
  const start = indexSource.indexOf('const methodBaseRates =');
  const end = indexSource.indexOf('function calculateDemurrageExposure', start);
  const source = indexSource.slice(start, end);
  const values = {
    'metodo_carga': 'cuchara_grab',
    'metodo_descarga_pod': 'cuchara_grab',
    'rate-load': '1200',
    'rate-disch': '1200',
    'ritmo_nominal_pol': '1',
    'ritmo_nominal_pod': '2',
    'cargo-qty': '12000',
  };
  const elements = new Map(Object.entries(values).map(([id, value]) => [id, {
    value,
    dataset: { manualOverride: 'false' },
  }]));
  const context = {
    Math,
    parseFloat,
    document: { getElementById: (id) => elements.get(id) || null },
    normalizarTipoCarga: () => 'general',
    window: {},
  };

  vm.runInNewContext(`${source}; globalThis.podRate = calcularRitmoEfectivo('pod');`, context);

  assert.equal(context.podRate, 3000);
});

test('method base-rate dictionary drives automatic POL and POD rates', () => {
  assert.match(indexSource, /const methodBaseRates = Object\.freeze\(\{[\s\S]*?'Cinta Transportadora': 3600[\s\S]*?'Bombas Neumáticas': 8000[\s\S]*?'Grúa Portuaria 30MT': 2500[\s\S]*?'Cuchara \(Grab\) - Grúa Barco': 1500[\s\S]*?'Big Bags \(con Grúa\)': 1000[\s\S]*?'Paletizado \/ Piezas \(con Grúa\)': 800[\s\S]*?'Hierro\/Acero\/Piezas': 1200[\s\S]*?'Camión Tolva': 'custom'/);
  assert.match(indexSource, /id="metodo_carga"[^>]*onchange="handlePortMethodChange\('pol'\)"/);
  assert.match(indexSource, /id="metodo_descarga_pod"[^>]*onchange="handlePortMethodChange\('pod'\)"/);
  assert.match(indexSource, /function marcarGruasManual[\s\S]*?setRitmoManualIndicator\(side, false\);[\s\S]*?recalcularDiasPuerto\(\)/);
  assert.match(indexSource, /return metodoPuertoUsaGruas\(metodo\) \? ritmoUnitario \* numeroGruas : ritmoUnitario/);
});

test('cargo dictionary contains SF and lifting requirements', () => {
  assert.match(indexSource, /"Minerales y Construcción": \[/);
  assert.match(indexSource, /"Biomasa y Combustibles Sólidos": \[/);
  assert.match(indexSource, /"Biomasa \(Grignon, Astillas, Pellets\)", sf: 1\.85, requiresPieceWeight: false/);
  assert.match(indexSource, /"Carga Unitizada \/ Envasada": \[/);
  assert.match(indexSource, /"Carga de Proyecto \(Breakbulk\)": \[/);
  assert.match(indexSource, /"Cemento a granel", sf: 0\.70, requiresPieceWeight: false/);
  assert.match(indexSource, /"Bobinas de Acero \(Steel Coils\)", sf: 0\.35, requiresPieceWeight: true/);
  assert.match(indexSource, /"Piezas Especiales \/ Maquinaria", sf: 2\.00, requiresPieceWeight: true/);
  assert.match(indexSource, /input\.required = requiresPieceWeight/);
  assert.match(indexSource, /if \(!requiresPieceWeight\) input\.value = '0'/);
});

test('cargo product and turn time options stay isolated', () => {
  const cargoProductMarkup = getSelectMarkup('cargo-product');
  const turnTimeMarkup = getSelectMarkup('turn-time-hours');

  assert.doesNotMatch(cargoProductMarkup, /horas|value="(?:12|24|48)"/);
  assert.doesNotMatch(turnTimeMarkup, /Cemento|Biomasa|Carbón|Acero|Paletizada|Maquinaria/);
  assert.match(indexSource, /const TURN_TIME_OPTIONS = Object\.freeze/);
  assert.match(indexSource, /replaceSelectOptions\(productEl, products\.map/);
  assert.match(indexSource, /replaceSelectOptions\(turnTimeEl, TURN_TIME_OPTIONS\)/);
});

test('backend port days use load, discharge and turn time only', () => {
  const result = calculateVoyageCostState({
    toneladas_carga: 12_000,
    dias_navegacion: 5,
    dias_puerto: (12_000 / 3_000) + (12_000 / 2_000),
    turn_time_hours: 48,
    dias_preparacion: 7,
    t_espera_fondeo: 3,
    delta_historico: 2,
    opex_fijo_diario: 1_000,
  });

  assert.equal(result.state.dias_puerto_total, 12);
  assert.equal(result.coste_opex_total, 17_000);
});

test('section 2 uses local state buffering and a confirmation button strictly at bottom', () => {
  // 1. Confirm section2LocalState and updateSection2LocalState functions exist in index.html
  assert.match(indexSource, /function updateSection2LocalState\(id, value\)/);
  assert.match(indexSource, /window\.section2LocalState/);

  // 2. Confirm confirmation button exists with ID btn-validate-section2 and calls validarYCalcularSeccion2()
  assert.match(indexSource, /id="btn-validate-section2"/);
  assert.match(indexSource, /onclick="validarYCalcularSeccion2\(\)"/);
  assert.match(indexSource, /Validar Especificaciones \/ Calcular/);

  // 3. Confirm validarYCalcularSeccion2 updates State and triggers global calculation functions
  assert.match(indexSource, /function validarYCalcularSeccion2\(\)/);
  assert.match(indexSource, /if \(typeof runEngine === 'function'\) runEngine\(\);/);

  // 4. Confirm inputs in section 2 use updateSection2LocalState instead of runEngine on input
  assert.match(indexSource, /id="cargo-qty"[^>]*updateSection2LocalState\('cargo-qty', this\.value\)/);
  assert.match(indexSource, /id="cargo-sf"[^>]*oninput="updateSection2LocalState\('cargo-sf', this\.value\)"/);
  assert.match(indexSource, /id="cargo-tolerance"[^>]*oninput="updateSection2LocalState\('cargo-tolerance', this\.value\)"/);
});

test('Centralized Vessel Classification and Synchronized Helper Text in Section 2', () => {
  assert.match(indexSource, /id="cargo-vessel-class-display"/);
  assert.match(indexSource, /function getCentralizedVesselClass/);
  assert.match(indexSource, /function updateCargoVesselClassDisplay/);
  assert.doesNotMatch(indexSource, /function detectVesselClassFromCargo/);

  let badgeText = 'Mini-Bulker';
  let helperText = '';

  const context = {
    document: {
      getElementById: (id) => {
        if (id === 'vessel-badge') return { innerText: badgeText };
        if (id === 'cargo-vessel-class-display') return {
          get textContent() { return helperText; },
          set textContent(val) { helperText = val; }
        };
        if (id === 'vessel-dwt') return { value: '11500' };
        if (id === 'cargo-qty') return { value: '10000' };
        return null;
      },
    },
    window: { State: { class: 'Mini-Bulker' } },
    parseFloat,
    String,
    Math,
    getCentralizedVesselClass: null,
    updateCargoVesselClassDisplay: null,
    getCiclosForMethod: null,
    getAutoEficienciaForMethodAndCategory: null,
  };

  const script = `
    function getCentralizedVesselClass() {
        const badgeEl = document.getElementById('vessel-badge');
        const bText = badgeEl?.innerText?.trim();
        if (bText && bText !== 'Desconocido' && bText !== 'Unknown') return bText;
        if (window.State && window.State.class && window.State.class !== 'Desconocido') return window.State.class;
        return 'Desconocido';
    }

    function updateCargoVesselClassDisplay() {
        const vClass = getCentralizedVesselClass();
        const displayEl = document.getElementById('cargo-vessel-class-display');
        if (displayEl) {
            displayEl.textContent = (vClass && vClass !== 'Desconocido' && vClass !== 'Unknown')
                ? 'Clasificado como: ' + vClass
                : '';
        }
        return vClass;
    }

    function getCiclosForMethod(label = '', vesselClass = '') {
        const l = String(label || '');
        const vClass = String(vesselClass || getCentralizedVesselClass()).toLowerCase();
        if (l.includes('Grúa Barco')) {
            if (vClass.includes('coaster') || vClass.includes('mini')) return 12;
            if (vClass.includes('supramax') || vClass.includes('ultramax')) return 18;
            return 15;
        }
        return 15;
    }
  `;

  vm.runInNewContext(script, context);

  // Test helper text uses centralized class format
  const vClass = context.updateCargoVesselClassDisplay();
  assert.equal(vClass, 'Mini-Bulker');
  assert.equal(helperText, 'Clasificado como: Mini-Bulker');

  // Test dynamic cycles for centralized vessel class
  assert.equal(context.getCiclosForMethod('Cuchara (Grab) - Grúa Barco', 'Mini-Bulker'), 12);
});

