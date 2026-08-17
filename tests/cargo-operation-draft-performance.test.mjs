import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function sliceFunction(name, nextMarker = '\n        window.') {
  const start = indexSource.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = indexSource.indexOf(nextMarker, start);
  assert.ok(end > start, `${name} must have an end marker`);
  return indexSource.slice(start, end);
}

const affectedIds = [
  'gruas-swl-pol',
  'gruas-tara-pol',
  'gruas-ciclos-pol',
  'gruas-eficiencia-num-pol',
  'gruas-eficiencia-slider-pol',
  'gruas-swl-pod',
  'gruas-tara-pod',
  'gruas-ciclos-pod',
  'gruas-eficiencia-num-pod',
  'gruas-eficiencia-slider-pod',
  'rate-load',
  'rate-disch',
  'ritmo_nominal_pol',
  'ritmo_nominal_pod'
];

test('crane and real-rate inputs only update the local draft while typing', () => {
  for (const id of affectedIds) {
    const tag = indexSource.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] || '';
    assert.ok(tag, `${id} must exist`);
    assert.match(tag, /oninput="(?:updateCargoOperationDraft|updateCraneEfficiencyDraft|updateRealRateDraft|updateCraneCountDraft)\(/);
    assert.doesNotMatch(tag, /calcularRitmoGrua|syncEficienciaGrua|marcarRitmoManual|marcarGruasManual|runEngine|recalcularDiasPuerto|fetch\(/);
    assert.doesNotMatch(tag, /onkeyup=|onblur=/);
  }
});

test('draft handlers do not mutate global state or trigger calculations', () => {
  for (const name of [
    'updateCargoOperationDraft',
    'updateCraneEfficiencyDraft',
    'updateCraneCountDraft',
    'updateRealRateDraft'
  ]) {
    const source = sliceFunction(name);
    assert.doesNotMatch(source, /SeaCharterStore|GlobalStore|window\.State|\bState\[|runEngine|recalcularDiasPuerto|calculateAdjustedEtaAndDays|syncCalculatorAndMatching|fetch\(/);
  }
});

test('real-rate typing restores local OPEX and standard-deviation feedback without global work', () => {
  assert.match(indexSource, /id="rate-load"[^>]*onfocus="captureRateDraftStandard\('pol'\)"/);
  assert.match(indexSource, /id="rate-disch"[^>]*onfocus="captureRateDraftStandard\('pod'\)"/);
  const inputHandler = sliceFunction('updateRealRateDraft');
  const feedback = sliceFunction('renderRateDraftFeedback');

  assert.match(inputHandler, /renderRateDraftFeedback\(side, value\)/);
  assert.match(feedback, /calcularDeltaDias\(cargo, standardRate, draftRate\)/);
  assert.match(feedback, /renderOpexImpactAlert\(side, negativeImpact \? delta : 0\)/);
  assert.match(feedback, /Sin desviación vs\. Estándar/);
  assert.doesNotMatch(feedback, /SeaCharterStore|GlobalStore|publicarImpactoOpexDias|actualizarPDADinamica|runEngine|recalcularDiasPuerto|fetch\(/);
});

test('the calculate button commits the draft before global calculations', () => {
  assert.match(indexSource, /id="btn-validate-section2"[^>]*onclick="handleMasterValidationAndCalculate\(event\)"/);

  const validation = sliceFunction('validarYCalcularSeccion2', '\n        window.validarYCalcularSeccion2');
  const commitIndex = validation.indexOf('commitCargoOperationDraft()');
  const stateIndex = validation.indexOf('window.State.vesselName');
  const storeIndex = validation.indexOf('SeaCharterStore.set(readValidatedCargoOperationState()');
  assert.ok(commitIndex >= 0 && commitIndex < stateIndex && stateIndex < storeIndex);
  assert.match(validation, /calcularRitmoGrua\(side, \{ deferEngine: true \}\)/);

  const commit = sliceFunction('commitCargoOperationDraft');
  assert.match(commit, /setRitmoMode\(committedMode, side, \{ commit: true, deferCalculations: true \}\)/);
  assert.match(commit, /delete window\.section2LocalState\[id\]/);
});

test('mode toggles stay visual until the master calculation commits them', () => {
  const source = sliceFunction('setRitmoMode', '\n        window.setRitmoMode');
  const draftBranch = source.slice(0, source.indexOf('\n            sides.forEach(s =>'));
  assert.match(draftBranch, /if \(!commit\)/);
  assert.match(draftBranch, /window\.section2LocalState/);
  assert.match(draftBranch, /aplicarEstadoInputRitmoDraft\(draftSide, targetMode\)/);
  assert.match(draftBranch, /if \(targetMode === 'auto'\) derivarRitmoAutoDraft\(draftSide\)/);
  assert.match(draftBranch, /renderRateDraftFeedback\(draftSide, input\?\.value \|\| '', \{ pristine: true \}\)/);
  assert.doesNotMatch(draftBranch, /window\.State|SeaCharterStore|runEngine|recalcularDiasPuerto|sincronizarEficienciaInversa/);
});

test('Auto derives a local crane rate and Manual fully unlocks both rate inputs', () => {
  const inputMode = sliceFunction('aplicarEstadoInputRitmoDraft');
  const autoRateStart = indexSource.indexOf('function derivarRitmoAutoDraft');
  const autoRateEnd = indexSource.indexOf('function setRitmoMode', autoRateStart);
  const autoRate = indexSource.slice(autoRateStart, autoRateEnd);

  assert.match(indexSource, /id="rate-load"[^>]*readonly[^>]*data-draft-calc-mode="auto"/);
  assert.match(indexSource, /id="rate-disch"[^>]*readonly[^>]*data-draft-calc-mode="auto"/);
  assert.match(inputMode, /input\.readOnly = !isManual/);
  assert.match(inputMode, /input\.disabled = false/);
  assert.match(inputMode, /input\.removeAttribute\('readonly'\)/);
  assert.match(inputMode, /input\.removeAttribute\('disabled'\)/);
  assert.match(autoRate, /calcularRitmoGruaTeorico\(side\)/);
  assert.match(autoRate, /window\.section2LocalState\[inputId\] = input\.value/);
  assert.doesNotMatch(autoRate, /SeaCharterStore|GlobalStore|publicarRitmoRealEnEstado|runEngine|recalcularDiasPuerto|fetch\(/);
});
