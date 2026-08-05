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

test('defines explicit light mode styling for select options and input dates', () => {
  assert.match(indexSource, /select option \{\s*background-color: #ffffff !important;\s*color: #0f172a !important;\s*\}/);
  assert.match(indexSource, /input\[type="date"\], select, datalist \{\s*color-scheme: light !important;\s*\}/);
});

test('uses compact matching header controls', () => {
  assert.match(indexSource, /id="new-estimation-btn"[\s\S]*?class="tools-dropdown-trigger flex items-center justify-center"/);
  assert.doesNotMatch(indexSource, /<span>\+ Nueva Estimación<\/span>/);
});
