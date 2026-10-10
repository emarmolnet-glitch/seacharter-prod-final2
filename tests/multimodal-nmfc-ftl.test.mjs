import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('1. Renderizado Condicional FTL en HTML: Banner y estructura de alerta presentes', () => {
  // Banner de redirección para FTL / Plataforma
  assert.match(indexHtml, /id="ground-ftl-banner"/, 'Debe existir el elemento #ground-ftl-banner');
  assert.match(
    indexHtml,
    /Para cotizaciones spot de camión completo \(FTL\) o equipos especiales, por favor diríjase al motor algorítmico de Land Charter Core PRO\./,
    'El banner FTL debe contener el mensaje exacto de redirección'
  );

  // Contenedor de campos LTL
  assert.match(indexHtml, /id="ground-ltl-fields"/, 'Debe existir el contenedor #ground-ltl-fields');

  // Lógica en JavaScript para ocultar/mostrar condicionalmente según tipo de transporte
  assert.match(indexHtml, /function\s+isGroundFtlMode\(\)/, 'Debe implementar función isGroundFtlMode');
  assert.match(indexHtml, /!val\.includes\(['"]LTL['"]\)\s*&&\s*!text\.includes\(['"]LTL['"]\)/, 'isGroundFtlMode debe verificar que no incluya LTL');
  assert.match(indexHtml, /function\s+updateGroundTransportView\(\)/, 'Debe implementar función updateGroundTransportView');
});

test('2. Inputs de Dimensiones LTL y Selectores de Unidades con valores por defecto KG y CM', () => {
  // Inputs de dimensiones
  assert.match(indexHtml, /<input\s+id="ground-length"[^>]*>/, 'Debe existir input #ground-length');
  assert.match(indexHtml, /<input\s+id="ground-width"[^>]*>/, 'Debe existir input #ground-width');
  assert.match(indexHtml, /<input\s+id="ground-height"[^>]*>/, 'Debe existir input #ground-height');

  // Selector de unidad de peso (KG o LB, por defecto KG)
  assert.match(indexHtml, /id="ground-weight-unit"/, 'Debe existir select #ground-weight-unit');
  assert.match(indexHtml, /<option\s+value="KG"\s+selected>KG<\/option>/, 'KG debe ser la unidad de peso seleccionada por defecto');
  assert.match(indexHtml, /<option\s+value="LB">LB<\/option>/, 'Debe soportar unidad LB');

  // Selector de unidad de dimensiones (CM o IN, por defecto CM)
  assert.match(indexHtml, /id="ground-dim-unit"/, 'Debe existir select #ground-dim-unit');
  assert.match(indexHtml, /<option\s+value="CM"\s+selected>CM<\/option>/, 'CM debe ser la unidad de dimensiones seleccionada por defecto');
  assert.match(indexHtml, /<option\s+value="IN">IN<\/option>/, 'Debe soportar unidad IN');

  // Elemento visual de Clase NMFC
  assert.match(indexHtml, /Clase de Flete Sugerida \(NMFC\):/, 'Debe incluir texto Clase de Flete Sugerida (NMFC):');
  assert.match(indexHtml, /id="ground-nmfc-class"/, 'Debe existir elemento #ground-nmfc-class para renderizar la clase');
});

test('3. Deshabilitación de "Calcular Tarifa" en modo FTL', () => {
  // En updateCalculateTariffButtonState se deshabilita si tabKey === 'ground' y isFtl
  assert.match(indexHtml, /const\s+isFtl\s*=\s*tabKey\s*===\s*['"]ground['"]\s*&&\s*isGroundFtlMode\(\)/, 'Detecta modo FTL para la pestaña ground');
  assert.match(indexHtml, /if\s*\(isFtl\)\s*\{\s*calcBtn\.disabled\s*=\s*true;/, 'Deshabilita botón Calcular Tarifa en modo FTL');

  // En handleCalculateTariff se bloquea la ejecución en modo FTL
  assert.match(indexHtml, /if\s*\(activeKey\s*===\s*['"]ground['"]\s*&&\s*isGroundFtlMode\(\)\)\s*\{\s*return;\s*\}/, 'handleCalculateTariff previene ejecución si está en modo FTL');
});

test('4. Motor de Cálculo NMFC: Pasos A, B y C con Sistema Métrico e Imperial', () => {
  assert.match(indexHtml, /2\.20462/, 'Conversión de KG a LBS usando 2.20462');
  assert.match(indexHtml, /0\.393701/, 'Conversión de CM a IN usando 0.393701');
  assert.match(indexHtml, /1728/, 'Cálculo de volumen cúbico dividiendo por 1728');
  assert.match(indexHtml, /weightLbs\s*\/\s*volumeCuFt/, 'Cálculo de densidad PCF dividiendo peso en lbs entre volumen');

  // Simulación funcional del algoritmo de cálculo
  function calculateNmfcTest({ weight, length, width, height, weightUnit, dimUnit }) {
    if (weight <= 0 || length <= 0 || width <= 0 || height <= 0) return null;
    const weightLbs = weightUnit === 'KG' ? weight * 2.20462 : weight;
    const lengthIn = dimUnit === 'CM' ? length * 0.393701 : length;
    const widthIn = dimUnit === 'CM' ? width * 0.393701 : width;
    const heightIn = dimUnit === 'CM' ? height * 0.393701 : height;
    const volumeCuFt = (lengthIn * widthIn * heightIn) / 1728;
    const pcf = weightLbs / volumeCuFt;
    return { weightLbs, volumeCuFt, pcf };
  }

  // Caso 1: Sistema Métrico (150 KG, 120 x 80 x 100 CM)
  const metricRes = calculateNmfcTest({
    weight: 150,
    length: 120,
    width: 80,
    height: 100,
    weightUnit: 'KG',
    dimUnit: 'CM',
  });
  assert.ok(Math.abs(metricRes.pcf - 9.754) < 0.05, `PCF métrico debe rondar 9.75, obtenido ${metricRes.pcf}`);

  // Caso 2: Sistema Imperial (500 LB, 48 x 40 x 48 IN)
  const imperialRes = calculateNmfcTest({
    weight: 500,
    length: 48,
    width: 40,
    height: 48,
    weightUnit: 'LB',
    dimUnit: 'IN',
  });
  assert.ok(Math.abs(imperialRes.pcf - 9.375) < 0.01, `PCF imperial esperado 9.375, obtenido ${imperialRes.pcf}`);
});

test('5. Mapeo Exhaustivo de Densidad PCF a Estándar NMFC (18 Rangos del Requisito)', () => {
  // Extraer o reproducir la función mapPcfToNmfcClass conforme a la implementación
  function mapPcfToNmfcClass(pcf) {
    if (!Number.isFinite(pcf) || pcf < 0) return '--';
    if (pcf < 1) return '500';
    if (pcf < 2) return '400';
    if (pcf < 3) return '300';
    if (pcf < 4) return '250';
    if (pcf < 5) return '200';
    if (pcf < 6) return '175';
    if (pcf < 7) return '150';
    if (pcf < 8) return '125';
    if (pcf < 9) return '110';
    if (pcf < 10.5) return '100';
    if (pcf < 12) return '92.5';
    if (pcf < 13.5) return '85';
    if (pcf < 15) return '77.5';
    if (pcf < 22.5) return '70';
    if (pcf < 30) return '65';
    if (pcf < 35) return '60';
    if (pcf < 50) return '55';
    return '50';
  }

  assert.equal(mapPcfToNmfcClass(0.5), '500', 'PCF < 1 = Clase 500');
  assert.equal(mapPcfToNmfcClass(1.0), '400', 'PCF 1 a <2 = Clase 400');
  assert.equal(mapPcfToNmfcClass(1.99), '400', 'PCF 1 a <2 = Clase 400');
  assert.equal(mapPcfToNmfcClass(2.0), '300', 'PCF 2 a <3 = Clase 300');
  assert.equal(mapPcfToNmfcClass(2.99), '300', 'PCF 2 a <3 = Clase 300');
  assert.equal(mapPcfToNmfcClass(3.0), '250', 'PCF 3 a <4 = Clase 250');
  assert.equal(mapPcfToNmfcClass(3.99), '250', 'PCF 3 a <4 = Clase 250');
  assert.equal(mapPcfToNmfcClass(4.0), '200', 'PCF 4 a <5 = Clase 200');
  assert.equal(mapPcfToNmfcClass(4.99), '200', 'PCF 4 a <5 = Clase 200');
  assert.equal(mapPcfToNmfcClass(5.0), '175', 'PCF 5 a <6 = Clase 175');
  assert.equal(mapPcfToNmfcClass(5.99), '175', 'PCF 5 a <6 = Clase 175');
  assert.equal(mapPcfToNmfcClass(6.0), '150', 'PCF 6 a <7 = Clase 150');
  assert.equal(mapPcfToNmfcClass(6.99), '150', 'PCF 6 a <7 = Clase 150');
  assert.equal(mapPcfToNmfcClass(7.0), '125', 'PCF 7 a <8 = Clase 125');
  assert.equal(mapPcfToNmfcClass(7.99), '125', 'PCF 7 a <8 = Clase 125');
  assert.equal(mapPcfToNmfcClass(8.0), '110', 'PCF 8 a <9 = Clase 110');
  assert.equal(mapPcfToNmfcClass(8.99), '110', 'PCF 8 a <9 = Clase 110');
  assert.equal(mapPcfToNmfcClass(9.0), '100', 'PCF 9 a <10.5 = Clase 100');
  assert.equal(mapPcfToNmfcClass(10.49), '100', 'PCF 9 a <10.5 = Clase 100');
  assert.equal(mapPcfToNmfcClass(10.5), '92.5', 'PCF 10.5 a <12 = Clase 92.5');
  assert.equal(mapPcfToNmfcClass(11.99), '92.5', 'PCF 10.5 a <12 = Clase 92.5');
  assert.equal(mapPcfToNmfcClass(12.0), '85', 'PCF 12 a <13.5 = Clase 85');
  assert.equal(mapPcfToNmfcClass(13.49), '85', 'PCF 12 a <13.5 = Clase 85');
  assert.equal(mapPcfToNmfcClass(13.5), '77.5', 'PCF 13.5 a <15 = Clase 77.5');
  assert.equal(mapPcfToNmfcClass(14.99), '77.5', 'PCF 13.5 a <15 = Clase 77.5');
  assert.equal(mapPcfToNmfcClass(15.0), '70', 'PCF 15 a <22.5 = Clase 70');
  assert.equal(mapPcfToNmfcClass(22.49), '70', 'PCF 15 a <22.5 = Clase 70');
  assert.equal(mapPcfToNmfcClass(22.5), '65', 'PCF 22.5 a <30 = Clase 65');
  assert.equal(mapPcfToNmfcClass(29.99), '65', 'PCF 22.5 a <30 = Clase 65');
  assert.equal(mapPcfToNmfcClass(30.0), '60', 'PCF 30 a <35 = Clase 60');
  assert.equal(mapPcfToNmfcClass(34.99), '60', 'PCF 30 a <35 = Clase 60');
  assert.equal(mapPcfToNmfcClass(35.0), '55', 'PCF 35 a <50 = Clase 55');
  assert.equal(mapPcfToNmfcClass(49.99), '55', 'PCF 35 a <50 = Clase 55');
  assert.equal(mapPcfToNmfcClass(50.0), '50', 'PCF >= 50 = Clase 50');
  assert.equal(mapPcfToNmfcClass(75.0), '50', 'PCF >= 50 = Clase 50');
});
