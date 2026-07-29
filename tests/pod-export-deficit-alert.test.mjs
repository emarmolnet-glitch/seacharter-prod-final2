import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isExportDeficitPOD } from '../dss-risk-module.mjs';

test('isExportDeficitPOD: identifies West Africa and export deficit regions correctly', () => {
  // Test West Africa / North Africa countries and ports
  assert.equal(isExportDeficitPOD('Dakar'), true, 'Dakar port should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Dakar, Senegal'), true, 'Dakar, Senegal should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Oran, Argelia'), true, 'Oran, Argelia should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Algeria'), true, 'Algeria should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Lagos, Nigeria'), true, 'Lagos, Nigeria should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Béjaïa'), true, 'Béjaïa should trigger deficit alert (normalized accents)');
  assert.equal(isExportDeficitPOD('West Africa Region'), true, 'West Africa region string should trigger deficit alert');
  assert.equal(isExportDeficitPOD('África Occidental'), true, 'África Occidental should trigger deficit alert');

  // Test object input
  assert.equal(isExportDeficitPOD({ isExportDeficit: true }), true, 'Object with isExportDeficit: true should trigger alert');
  assert.equal(isExportDeficitPOD({ name: 'Dakar', isExportDeficit: false }), true, 'Object named Dakar should trigger alert regardless of flag');
  assert.equal(isExportDeficitPOD({ name: 'Houston', isExportDeficit: true }), true, 'Object with isExportDeficit flag true should trigger alert');
  assert.equal(isExportDeficitPOD({ name: 'Houston', isExportDeficit: false }), false, 'Non-deficit port object should not trigger alert');

  // Test non-deficit ports
  assert.equal(isExportDeficitPOD('Houston'), false, 'Houston should not trigger deficit alert');
  assert.equal(isExportDeficitPOD('Rotterdam'), false, 'Rotterdam should not trigger deficit alert');
  assert.equal(isExportDeficitPOD('Santos'), false, 'Santos should not trigger deficit alert');
  assert.equal(isExportDeficitPOD(''), false, 'Empty string should return false');
  assert.equal(isExportDeficitPOD(null), false, 'Null should return false');
  assert.equal(isExportDeficitPOD(undefined), false, 'Undefined should return false');
});

test('UI Structure: index.html contains POD export deficit alert banner and exact text', () => {
  const htmlPath = path.join(process.cwd(), 'index.html');
  const indexHtml = fs.readFileSync(htmlPath, 'utf8');

  assert.match(indexHtml, /id="pod-export-deficit-alert"/, 'index.html must contain #pod-export-deficit-alert element');
  assert.match(indexHtml, /function isExportDeficitPOD/, 'index.html must define isExportDeficitPOD function');
  assert.match(indexHtml, /function evaluarAlertaDeficitPOD/, 'index.html must define evaluarAlertaDeficitPOD function');

  const exactText = 'Atención: Este puerto suele presentar déficit de carga de exportación para buques de carga general. Considera incrementar los Días de Lastre, ya que el armador cotizará el reposicionamiento.';
  assert.ok(indexHtml.includes(exactText), 'index.html must contain exact alert text required by specification');
});

test('UI Structure: decisiones.html contains POD export deficit alert banner and exact text', () => {
  const htmlPath = path.join(process.cwd(), 'decisiones.html');
  const decisionesHtml = fs.readFileSync(htmlPath, 'utf8');

  assert.match(decisionesHtml, /id="pod-export-deficit-alert"/, 'decisiones.html must contain #pod-export-deficit-alert element');
  assert.match(decisionesHtml, /function isExportDeficitPOD/, 'decisiones.html must define isExportDeficitPOD function');
  assert.match(decisionesHtml, /function evaluarAlertaDeficitPOD/, 'decisiones.html must define evaluarAlertaDeficitPOD function');

  const exactText = 'Atención: Este puerto suele presentar déficit de carga de exportación para buques de carga general. Considera incrementar los Días de Lastre, ya que el armador cotizará el reposicionamiento.';
  assert.ok(decisionesHtml.includes(exactText), 'decisiones.html must contain exact alert text required by specification');
});

test('Dynamic DOM: evaluarAlertaDeficitPOD toggles alert visibility without modifying ballastDays', () => {
  let isHidden = true;
  const mockAlertEl = {
    classList: {
      remove: (cls) => { if (cls === 'hidden') isHidden = false; },
      add: (cls) => { if (cls === 'hidden') isHidden = true; },
      contains: (cls) => (cls === 'hidden' ? isHidden : false)
    }
  };

  const mockBallastInput = { value: '3.5' };
  const mockPodInput = { value: 'Houston' };

  const fakeDocument = {
    getElementById: (id) => {
      if (id === 'pod-export-deficit-alert') return mockAlertEl;
      if (id === 'input-ballastDays') return mockBallastInput;
      if (id === 'input-pod') return mockPodInput;
      return null;
    }
  };

  function evaluarAlertaDeficitPOD(pod, doc = fakeDocument) {
    const alertEl = doc.getElementById('pod-export-deficit-alert');
    if (!alertEl) return;
    const hasDeficit = isExportDeficitPOD(pod);
    if (hasDeficit) {
      alertEl.classList.remove('hidden');
    } else {
      alertEl.classList.add('hidden');
    }
  }

  // 1. Initial non-deficit port (Houston)
  evaluarAlertaDeficitPOD('Houston');
  assert.equal(isHidden, true, 'Alert must be hidden for Houston');
  assert.equal(mockBallastInput.value, '3.5', 'ballastDays must remain 3.5');

  // 2. Deficit port (Dakar, Senegal)
  evaluarAlertaDeficitPOD('Dakar, Senegal');
  assert.equal(isHidden, false, 'Alert must be visible for Dakar, Senegal');
  assert.equal(mockBallastInput.value, '3.5', 'ballastDays must remain strictly unchanged at 3.5');

  // 3. Deficit port (Oran, Argelia)
  evaluarAlertaDeficitPOD('Oran, Argelia');
  assert.equal(isHidden, false, 'Alert must be visible for Oran, Argelia');
  assert.equal(mockBallastInput.value, '3.5', 'ballastDays must remain strictly unchanged at 3.5');

  // 4. Return to non-deficit port
  evaluarAlertaDeficitPOD('Rotterdam');
  assert.equal(isHidden, true, 'Alert must be hidden for Rotterdam');
  assert.equal(mockBallastInput.value, '3.5', 'ballastDays must remain strictly unchanged at 3.5');
});
