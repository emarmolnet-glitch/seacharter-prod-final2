import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('1. Limpieza de inputs en pestaña LCL (Grupage / Carga Fraccionada)', () => {
  // lcl-pol
  const polMatch = indexHtml.match(/<input\s+id="lcl-pol"[^>]*>/);
  assert.ok(polMatch, 'Debe existir input #lcl-pol');
  assert.match(polMatch[0], /value=""/, 'lcl-pol debe iniciar con value=""');
  assert.match(polMatch[0], /placeholder="[^"]*origen[^"]*"/i, 'lcl-pol debe mantener placeholder descriptivo de origen');

  // lcl-pod
  const podMatch = indexHtml.match(/<input\s+id="lcl-pod"[^>]*>/);
  assert.ok(podMatch, 'Debe existir input #lcl-pod');
  assert.match(podMatch[0], /value=""/, 'lcl-pod debe iniciar con value=""');
  assert.match(podMatch[0], /placeholder="[^"]*destino[^"]*"/i, 'lcl-pod debe mantener placeholder descriptivo de destino');

  // lcl-gross-weight
  const weightMatch = indexHtml.match(/<input\s+id="lcl-gross-weight"[^>]*>/);
  assert.ok(weightMatch, 'Debe existir input #lcl-gross-weight');
  assert.match(weightMatch[0], /value=""/, 'lcl-gross-weight debe iniciar con value=""');
  assert.match(weightMatch[0], /placeholder="[^"]*KG[^"]*"/i, 'lcl-gross-weight debe tener placeholder descriptivo');

  // lcl-gross-volume
  const volumeMatch = indexHtml.match(/<input\s+id="lcl-gross-volume"[^>]*>/);
  assert.ok(volumeMatch, 'Debe existir input #lcl-gross-volume');
  assert.match(volumeMatch[0], /value=""/, 'lcl-gross-volume debe iniciar con value=""');
  assert.match(volumeMatch[0], /placeholder="[^"]*CBM[^"]*"/i, 'lcl-gross-volume debe tener placeholder descriptivo');

  // lcl-cargo-type
  const cargoMatch = indexHtml.match(/<input\s+id="lcl-cargo-type"[^>]*>/);
  assert.ok(cargoMatch, 'Debe existir input #lcl-cargo-type');
  assert.match(cargoMatch[0], /value=""/, 'lcl-cargo-type debe iniciar con value=""');
  assert.match(cargoMatch[0], /placeholder="[^"]*mercanc[ií]a[^"]*"/i, 'lcl-cargo-type debe tener placeholder descriptivo');

  // Subtotal banner LCL
  assert.match(indexHtml, /<output\s+id="lcl-quote-total"[^>]*>€0\.00<\/output>/, 'Banner inferior LCL debe inicializarse en €0.00');
});

test('2. Limpieza de inputs en pestaña AÉREO (Air Freight Cargo)', () => {
  // air-origin
  const originMatch = indexHtml.match(/<input\s+id="air-origin"[^>]*>/);
  assert.ok(originMatch, 'Debe existir input #air-origin');
  assert.match(originMatch[0], /value=""/, 'air-origin debe iniciar con value=""');
  assert.match(originMatch[0], /placeholder="[^"]*Aeropuerto[^"]*origen[^"]*"/i, 'air-origin debe mantener placeholder descriptivo');

  // air-dest
  const destMatch = indexHtml.match(/<input\s+id="air-dest"[^>]*>/);
  assert.ok(destMatch, 'Debe existir input #air-dest');
  assert.match(destMatch[0], /value=""/, 'air-dest debe iniciar con value=""');
  assert.match(destMatch[0], /placeholder="[^"]*Aeropuerto[^"]*destino[^"]*"/i, 'air-dest debe mantener placeholder descriptivo');

  // air-gross-weight
  const weightMatch = indexHtml.match(/<input\s+id="air-gross-weight"[^>]*>/);
  assert.ok(weightMatch, 'Debe existir input #air-gross-weight');
  assert.match(weightMatch[0], /value=""/, 'air-gross-weight debe iniciar con value=""');
  assert.match(weightMatch[0], /placeholder="[^"]*KG[^"]*"/i, 'air-gross-weight debe tener placeholder descriptivo');

  // air-dimensions-volume
  const volumeMatch = indexHtml.match(/<input\s+id="air-dimensions-volume"[^>]*>/);
  assert.ok(volumeMatch, 'Debe existir input #air-dimensions-volume');
  assert.match(volumeMatch[0], /value=""/, 'air-dimensions-volume debe iniciar con value=""');
  assert.match(volumeMatch[0], /placeholder="[^"]*CBM[^"]*"/i, 'air-dimensions-volume debe tener placeholder descriptivo');

  // Subtotal banner Aéreo
  assert.match(indexHtml, /<output\s+id="air-quote-total"[^>]*>€0\.00<\/output>/, 'Banner inferior Aéreo debe inicializarse en €0.00');
});

test('3. Limpieza de inputs en pestaña TERRESTRE EE.UU. (Camión / LTL)', () => {
  // ground-pickup-zip
  const pickupMatch = indexHtml.match(/<input\s+id="ground-pickup-zip"[^>]*>/);
  assert.ok(pickupMatch, 'Debe existir input #ground-pickup-zip');
  assert.match(pickupMatch[0], /value=""/, 'ground-pickup-zip debe iniciar con value=""');
  assert.match(pickupMatch[0], /placeholder="[^"]*recogida[^"]*"/i, 'ground-pickup-zip debe mantener placeholder descriptivo');

  // ground-delivery-zip
  const deliveryMatch = indexHtml.match(/<input\s+id="ground-delivery-zip"[^>]*>/);
  assert.ok(deliveryMatch, 'Debe existir input #ground-delivery-zip');
  assert.match(deliveryMatch[0], /value=""/, 'ground-delivery-zip debe iniciar con value=""');
  assert.match(deliveryMatch[0], /placeholder="[^"]*entrega[^"]*"/i, 'ground-delivery-zip debe mantener placeholder descriptivo');

  // ground-pallets
  const palletsMatch = indexHtml.match(/<input\s+id="ground-pallets"[^>]*>/);
  assert.ok(palletsMatch, 'Debe existir input #ground-pallets');
  assert.match(palletsMatch[0], /value=""/, 'ground-pallets debe iniciar con value=""');
  assert.match(palletsMatch[0], /placeholder="[^"]*pallets[^"]*"/i, 'ground-pallets debe tener placeholder descriptivo');

  // ground-weight-lbs
  const weightMatch = indexHtml.match(/<input\s+id="ground-weight-lbs"[^>]*>/);
  assert.ok(weightMatch, 'Debe existir input #ground-weight-lbs');
  assert.match(weightMatch[0], /value=""/, 'ground-weight-lbs debe iniciar con value=""');
  assert.match(weightMatch[0], /placeholder="[^"]*LBS[^"]*"/i, 'ground-weight-lbs debe tener placeholder descriptivo');

  // Subtotal banner Terrestre
  assert.match(indexHtml, /<output\s+id="ground-quote-total"[^>]*>\$0\.00<\/output>/, 'Banner inferior Terrestre EE.UU. debe inicializarse en $0.00');
});

test('4. Limpieza de inputs en pestaña AMAZON FBA (Centros Logísticos)', () => {
  // amazon-origin-port
  const originMatch = indexHtml.match(/<input\s+id="amazon-origin-port"[^>]*>/);
  assert.ok(originMatch, 'Debe existir input #amazon-origin-port');
  assert.match(originMatch[0], /value=""/, 'amazon-origin-port debe iniciar con value=""');
  assert.match(originMatch[0], /placeholder="[^"]*origen[^"]*"/i, 'amazon-origin-port debe mantener placeholder descriptivo');

  // amazon-fba-fc-code
  const fcMatch = indexHtml.match(/<input\s+id="amazon-fba-fc-code"[^>]*>/);
  assert.ok(fcMatch, 'Debe existir input #amazon-fba-fc-code');
  assert.match(fcMatch[0], /value=""/, 'amazon-fba-fc-code debe iniciar con value=""');
  assert.match(fcMatch[0], /placeholder="[^"]*ONT8[^"]*"/i, 'amazon-fba-fc-code debe mantener placeholder descriptivo');

  // amazon-cartons
  const cartonsMatch = indexHtml.match(/<input\s+id="amazon-cartons"[^>]*>/);
  assert.ok(cartonsMatch, 'Debe existir input #amazon-cartons');
  assert.match(cartonsMatch[0], /value=""/, 'amazon-cartons debe iniciar con value=""');
  assert.match(cartonsMatch[0], /placeholder="[^"]*cajas[^"]*"/i, 'amazon-cartons debe tener placeholder descriptivo');

  // amazon-total-weight
  const weightMatch = indexHtml.match(/<input\s+id="amazon-total-weight"[^>]*>/);
  assert.ok(weightMatch, 'Debe existir input #amazon-total-weight');
  assert.match(weightMatch[0], /value=""/, 'amazon-total-weight debe iniciar con value=""');
  assert.match(weightMatch[0], /placeholder="[^"]*KG[^"]*"/i, 'amazon-total-weight debe tener placeholder descriptivo');

  // Subtotal banner Amazon FBA
  assert.match(indexHtml, /<output\s+id="amazon-quote-total"[^>]*>€0\.00<\/output>/, 'Banner inferior Amazon FBA debe inicializarse en €0.00');
});

test('5. Subtotales y cotizaciones se mantienen en cero hasta pulsar "Calcular Tarifa"', () => {
  assert.match(indexHtml, /window\.calculatedMultimodalTabs/, 'Debe rastrear las pestañas calculadas');
  assert.match(indexHtml, /handleCalculateTariff/, 'Implementa handleCalculateTariff para el cálculo interactivo');
  assert.match(indexHtml, /formatModeCurrency\(0,\s*currency\)/, 'Renderiza 0 hasta que la tarifa es calculada');
});
