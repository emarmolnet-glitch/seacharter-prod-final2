import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('renumbers right column panel headers sequentially (6 to 10)', () => {
  assert.match(indexSource, /6\. RESUMEN DE OPERACIÓN/);
  assert.match(indexSource, /7\. ANÁLISIS DE FLETES/);
  assert.match(indexSource, /8\. NEGOCIACIÓN COMERCIAL/);
  assert.match(indexSource, /9\. MATRIZ DE RIESGO/);
  assert.match(indexSource, /10\. SIMULADOR DE VIAJE COMBINADO \(SHADOW ESTIMATOR\)/);
  assert.match(indexSource, /10\. SIMULADOR DE NEGOCIACIÓN Y CONTRAOFERTAS/);
});

test('contains the validation stepper HUD widget markup in Light Mode with 5 operational checklist steps', () => {
  assert.match(indexSource, /id="validation-stepper-hud"/);
  assert.match(indexSource, /bg-white border border-slate-200/);
  assert.match(indexSource, /Checklist de Viaje/);
  assert.match(indexSource, /1\. Ruta y Millas/);
  assert.match(indexSource, /2\. Carga y Ritmos/);
  assert.match(indexSource, /3\. Tiempos/);
  assert.match(indexSource, /4\. Combustibles/);
  assert.match(indexSource, /5\. Costes Portuarios \/ PDAs/);
  assert.match(indexSource, /id="hud-progress-badge"/);
  assert.match(indexSource, /id="hud-status-text"/);
});

test('defines drag handle header with cursor-move and grip icon', () => {
  assert.match(indexSource, /id="hud-header"/);
  assert.match(indexSource, /cursor-move bg-slate-50/);
  assert.match(indexSource, /fa-grip-vertical/);
  assert.match(indexSource, /select-none/);
});

test('defines explicit light mode styling for select options and input dates', () => {
  assert.match(indexSource, /select option \{\s*background-color: #ffffff !important;\s*color: #0f172a !important;\s*\}/);
  assert.match(indexSource, /input\[type="date"\], select, datalist \{\s*color-scheme: light !important;\s*\}/);
});

test('defines validarProgresoViaje, toggleHudCollapse, and initDraggableHud functions', () => {
  assert.match(indexSource, /function validarProgresoViaje\(\)/);
  assert.match(indexSource, /function toggleHudCollapse\(/);
  assert.match(indexSource, /function initDraggableHud\(\)/);
  assert.match(indexSource, /window\.validarProgresoViaje = validarProgresoViaje/);
  assert.match(indexSource, /window\.initDraggableHud = initDraggableHud/);
});

test('initDraggableHud neutralizes bottom/right and calculates left/top coordinates on mousedown', () => {
  assert.match(indexSource, /hud\.style\.bottom = 'auto'/);
  assert.match(indexSource, /hud\.style\.right = 'auto'/);
  assert.match(indexSource, /hud\.style\.left = newLeft \+ 'px'/);
  assert.match(indexSource, /hud\.style\.top = newTop \+ 'px'/);
});

test('invokes validarProgresoViaje inside runEngine and binds blur event listeners', () => {
  assert.match(indexSource, /if \(typeof validarProgresoViaje === 'function'\) \{\s*validarProgresoViaje\(\);\s*\}/);
  assert.match(indexSource, /el\.addEventListener\('blur', \(\) => validarProgresoViaje\(\)\)/);
});
