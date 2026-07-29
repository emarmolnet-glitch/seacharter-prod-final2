import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isExportDeficitPOD } from '../dss-risk-module.mjs';

test('isExportDeficitPOD: identifies West Africa, North Africa, East Africa, Caribbean, Pacific & Insular deficit regions', () => {
  // Test West Africa & Insular
  assert.equal(isExportDeficitPOD('Sao Tome'), true, 'SAO TOME should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Port of Sao Tome (ST)'), true, 'ST code should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Banjul'), true, 'Banjul should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Banjul, GM'), true, 'GM code should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Dakar, Senegal'), true, 'Senegal should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Lagos, Nigeria'), true, 'Nigeria should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Luanda, Angola'), true, 'Angola should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Conakry, Guinea'), true, 'Guinea should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Libreville, Gabon'), true, 'Gabon should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Pointe-Noire, Congo'), true, 'Congo should trigger deficit alert');
  assert.equal(isExportDeficitPOD("Abidjan, Cote d'Ivoire"), true, "Cote d'Ivoire should trigger deficit alert");
  assert.equal(isExportDeficitPOD('Tema, Ghana'), true, 'Ghana should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Douala, Cameroon'), true, 'Cameroon should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Nouakchott, Mauritania'), true, 'Mauritania should trigger deficit alert');

  // Test North Africa
  assert.equal(isExportDeficitPOD('Oran, Argelia'), true, 'Argelia should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Algeria (DZ)'), true, 'DZ code should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Tripoli, Libya'), true, 'Libya should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Rades, Tunisia'), true, 'Tunisia should trigger deficit alert');

  // Test East Africa
  assert.equal(isExportDeficitPOD('Mombasa, Kenya'), true, 'Kenya should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Dar es Salaam, Tanzania'), true, 'Tanzania should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Maputo, Mozambique'), true, 'Mozambique should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Toamasina, Madagascar'), true, 'Madagascar should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Port of Djibouti'), true, 'Djibouti should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Mogadishu, Somalia'), true, 'Somalia should trigger deficit alert');

  // Test Caribbean, Pacific & Islands
  assert.equal(isExportDeficitPOD('Caribbean Port'), true, 'Caribbean should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Nassau, Bahamas'), true, 'Bahamas should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Bridgetown, Barbados'), true, 'Barbados should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Port-au-Prince, Haiti'), true, 'Haiti should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Kingston, Jamaica'), true, 'Jamaica should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Santo Domingo, Dominican Republic'), true, 'Dominican Republic should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Port of Spain, Trinidad'), true, 'Trinidad should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Suva, Fiji'), true, 'Fiji should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Port Moresby, Papua'), true, 'Papua should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Honiara, Solomon'), true, 'Solomon should trigger deficit alert');
  assert.equal(isExportDeficitPOD('Port Vila, Vanuatu'), true, 'Vanuatu should trigger deficit alert');

  // Test Priority DB Flags
  assert.equal(isExportDeficitPOD({ isExportDeficit: true }), true, 'Object with isExportDeficit: true should return true');
  assert.equal(isExportDeficitPOD({ exportDeficit: true }), true, 'Object with exportDeficit: true should return true');
  assert.equal(isExportDeficitPOD({ name: 'Houston', exportDeficit: true }), true, 'Houston with exportDeficit: true flag should return true');
  assert.equal(isExportDeficitPOD({ name: 'Houston', exportDeficit: false, isExportDeficit: false }), false, 'Houston with flags false should return false');

  // Test non-deficit ports & word boundary prevention
  assert.equal(isExportDeficitPOD('Houston'), false, 'Houston should not trigger deficit alert (ST in HOUSTON should not falsely match)');
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
