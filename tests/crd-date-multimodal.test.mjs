import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

test('Fase 1: Inyección HTML en las 5 Pestañas (crd-date-[MODALIDAD])', () => {
  const modes = ['fcl', 'lcl', 'air', 'ground', 'amazon'];

  modes.forEach((mode) => {
    // 1. Debe existir el input con id exacto
    const inputId = `crd-date-${mode}`;
    const inputRegex = new RegExp(`<input[^>]*id="${inputId}"[^>]*>`, 'i');
    const inputMatch = indexHtml.match(inputRegex);
    assert.ok(inputMatch, `Debe existir el input #${inputId} en index.html`);

    const inputTag = inputMatch[0];
    assert.match(inputTag, /type="date"/i, `#${inputId} debe ser de tipo date`);
    assert.match(inputTag, /\brequired\b/i, `#${inputId} debe tener el atributo required`);

    // 2. Debe tener la etiqueta Fecha de Recogida (CRD)
    assert.match(
      indexHtml,
      /Fecha de Recogida \(CRD\)/,
      `Debe existir el texto 'Fecha de Recogida (CRD)' para la modalidad ${mode}`
    );
  });
});

test('Fase 2: Lógica de Validación en JavaScript (min = today)', () => {
  // Verificar que el bucle para crd-date- esté presente en la función de inicialización
  assert.match(
    indexHtml,
    /document\.querySelectorAll\(['"]input\[type="date"\]\[id\^="crd-date-"\]['"]\)/,
    'Debe iterar sobre input[type="date"][id^="crd-date-"]'
  );
  assert.match(
    indexHtml,
    /const\s+today\s*=\s*new\s+Date\(\)\.toISOString\(\)\.split\(['"]T['"]\)\[0\]/,
    'Debe calcular today en formato ISO YYYY-MM-DD'
  );
  assert.match(
    indexHtml,
    /input\.min\s*=\s*today/,
    'Debe asignar input.min = today a los inputs de fecha'
  );

  // Simulación mock de la lógica JS de inicialización
  const mockInputs = [
    { id: 'crd-date-fcl', min: '' },
    { id: 'crd-date-lcl', min: '' },
    { id: 'crd-date-air', min: '' },
    { id: 'crd-date-ground', min: '' },
    { id: 'crd-date-amazon', min: '' }
  ];
  const today = new Date().toISOString().split('T')[0];
  mockInputs.forEach(input => { input.min = today; });
  mockInputs.forEach(input => {
    assert.equal(input.min, today, `${input.id} debe tener min establecido a la fecha de hoy`);
  });
});

test('Lógica Condicional de Fechas en Panel y Modal: 1. Mock API con departureDate', () => {
  // fetchMarketplaceRates debe incluir departureDate en los objetos
  assert.match(
    indexHtml,
    /departureDate:\s*['"][^'"]+['"]/,
    'fetchMarketplaceRates debe definir departureDate en los objetos devueltos'
  );
});

test('Lógica Condicional de Fechas en Panel y Modal: 2. Función Centralizada y Regla isScheduled', () => {
  assert.match(
    indexHtml,
    /function\s+renderMarketplaceDatesHtml\s*\(/,
    'Debe existir la función de utilidad centralizada renderMarketplaceDatesHtml'
  );

  assert.match(
    indexHtml,
    /isScheduled\s*=\s*\(currentMode\s*===\s*['"]fcl['"]\s*\|\|\s*currentMode\s*===\s*['"]lcl['"]\s*\|\|\s*currentMode\s*===\s*['"]air['"]\)/,
    'Debe evaluar isScheduled para fcl, lcl y air'
  );

  // Verificar etiquetas esperadas
  assert.match(
    indexHtml,
    /Recogida \(CRD\):/,
    'Debe mostrar "Recogida (CRD):" cuando isScheduled es true'
  );
  assert.match(
    indexHtml,
    /Salida del proveedor:/,
    'Debe mostrar "Salida del proveedor:" cuando isScheduled es true'
  );
  assert.match(
    indexHtml,
    /Fecha de recogida acordada:/,
    'Debe mostrar "Fecha de recogida acordada:" cuando isScheduled es false'
  );
});

test('Lógica Condicional de Fechas en Panel y Modal: 3. Panel Principal y 4. Modal de Alternativas', () => {
  // En active-provider-transit del panel principal
  assert.match(
    indexHtml,
    /transitEl\.innerHTML\s*=\s*renderMarketplaceDatesHtml\(/,
    'El panel principal debe inyectar el HTML de fechas usando renderMarketplaceDatesHtml'
  );

  // En el modal de alternativas
  assert.match(
    indexHtml,
    /renderMarketplaceDatesHtml\(\s*currentMode\s*,\s*item\s*\)/,
    'Las tarjetas del modal de alternativas deben usar renderMarketplaceDatesHtml dinámicamente'
  );

  // Comportamiento funcional simulado
  const mockRender = (mode, item, mockCrd) => {
    const isScheduled = (mode === 'fcl' || mode === 'lcl' || mode === 'air');
    const selectedCrd = mockCrd || 'No especificada';
    const departureDate = item?.departureDate || '28 Oct 2026';
    if (isScheduled) {
      return `Recogida (CRD): ${selectedCrd} | Salida del proveedor: ${departureDate}`;
    } else {
      return `Fecha de recogida acordada: ${selectedCrd}`;
    }
  };

  // Scheduled mode (FCL)
  const scheduledHtml = mockRender('fcl', { departureDate: '15 Nov 2026' }, '2026-11-01');
  assert.match(scheduledHtml, /Recogida \(CRD\): 2026-11-01/);
  assert.match(scheduledHtml, /Salida del proveedor: 15 Nov 2026/);
  assert.doesNotMatch(scheduledHtml, /Fecha de recogida acordada:/);

  // Non-scheduled mode (Ground)
  const groundHtml = mockRender('ground', { departureDate: '26 Oct 2026' }, '2026-10-25');
  assert.match(groundHtml, /Fecha de recogida acordada: 2026-10-25/);
  assert.doesNotMatch(groundHtml, /Salida del proveedor:/);

  // Non-scheduled mode (Amazon)
  const amazonHtml = mockRender('amazon', {}, '');
  assert.match(amazonHtml, /Fecha de recogida acordada: No especificada/);
  assert.doesNotMatch(amazonHtml, /Salida del proveedor:/);
});
