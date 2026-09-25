import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVoyageStowagePlan, resolveVesselStowageProfile } from '../src/voyage-stowage-builder.mjs';

const modalSource = readFileSync(new URL('../src/components/VoyageExecutiveReportModal.jsx', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('1. Impresión no destructiva: printExecutiveScreenReport NO clona ni sobrescribe innerHTML', () => {
  assert.doesNotMatch(
    indexSource,
    /printView\.innerHTML\s*=\s*`<div class="screen-report-print/,
    'printExecutiveScreenReport no debe destruir el DOM clonando innerHTML'
  );
  assert.match(
    indexSource,
    /document\.body\.classList\.add\('is-printing-modal'\)/,
    'Debe añadir la clase is-printing-modal al body para imprimir limpiamente vía CSS'
  );
});

test('2. CSS @media print gestiona la visibilidad del modal sin destruir React', () => {
  assert.match(
    indexSource,
    /body\.is-printing-modal\s*#ai-modal,\s*body\.is-printing-modal\s*#voyage-executive-report-modal/,
    'Las reglas de impresión deben enfocar directamente el modal sin desmontar el árbol React'
  );
  assert.match(
    indexSource,
    /body\.is-printing-modal\s*>\s*:not\(#ai-modal\):not\(#voyage-executive-report-modal\)/,
    'Los elementos de fondo deben ocultarse limpiamente durante la impresión'
  );
});

test('3. Perfiles Navales Dinámicos reaccionan según buque cotizado', () => {
  assert.equal(resolveVesselStowageProfile('Coaster 4500 DWT', 'Coaster'), 'COASTER');
  assert.equal(resolveVesselStowageProfile('Minibulker', 'Mini-Bulker'), 'COASTER');
  assert.equal(resolveVesselStowageProfile('Ro-Ro Pure Car Carrier', 'Ro-Ro'), 'RORO');
  assert.equal(resolveVesselStowageProfile('Ro-Lo Vessel', 'Ro-Lo'), 'RORO');
  assert.equal(resolveVesselStowageProfile('Handysize Bulk Carrier', 'Handysize'), 'HANDYSIZE');

  const roroPlan = buildVoyageStowagePlan({ cargo: 8000, dwt: 12000, shipProfile: 'Ro-Ro', vesselType: 'Pure Ro-Ro Carrier' });
  assert.equal(roroPlan.vesselModel.profile, 'RORO');
  assert.equal(roroPlan.holds.length, 2, 'Ro-Ro debe usar cubiertas corridas');
  assert.ok(roroPlan.weatherDeck.totalWeightTons > 0, 'Weather deck debe recibir estiba rodada');

  const coasterPlan = buildVoyageStowagePlan({ cargo: 4000, dwt: 5000, vesselType: 'Coaster' });
  assert.equal(coasterPlan.vesselModel.profile, 'COASTER');
  assert.equal(coasterPlan.holds.length, 2, 'Coaster debe tener 2 bodegas diáfanas');

  const handyPlan = buildVoyageStowagePlan({ cargo: 28000, dwt: 34000, vesselType: 'Handysize' });
  assert.equal(handyPlan.vesselModel.profile, 'HANDYSIZE');
  assert.equal(handyPlan.holds.length, 4, 'Handysize debe tener 4 bodegas independientes');
});

test('4. Inyección de Carga se preserva y React.memo previene desmontaje al alternar isClientMode', () => {
  assert.match(modalSource, /useMemo\(/, 'El plan de estiba debe estar memoizado con useMemo');
  assert.match(modalSource, /stowagePlan=\{stowagePlan\}/, 'El plano debe inyectarse en VisualStowagePlan');
  assert.match(modalSource, /vesselType=\{resolvedVesselType\}/, 'vesselType dinámico debe pasarse como prop');
});
