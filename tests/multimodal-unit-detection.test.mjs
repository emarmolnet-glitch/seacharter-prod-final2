import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  extractCountryCode,
  detectUnitSystem,
  detectCurrency,
  getUnitsForSystem,
  useUnitDetection,
  EU_COUNTRIES,
} from '../src/hooks/useUnitDetection.mjs';

import iContainersService, {
  createFclQuote,
  createLclQuote,
  createAirQuote,
  createLtlQuote,
  createEcommerceOrder,
} from '../services/icontainers-service.js';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('1. Lógica de Detección Geográfica: detectUnitSystem e ISO country extractor', () => {
  // US cases -> IMPERIAL
  assert.equal(extractCountryCode('US'), 'US');
  assert.equal(extractCountryCode('USMIA'), 'US');
  assert.equal(extractCountryCode('New York (USNYC)'), 'US');
  assert.equal(extractCountryCode('Houston, TX (77002)'), 'US');
  assert.equal(extractCountryCode('Chicago, IL (60601)'), 'US');
  assert.equal(extractCountryCode('JFK - John F. Kennedy Int. New York'), 'US');
  assert.equal(extractCountryCode('ONT8 - Moreno Valley, CA 92555'), 'US');
  assert.equal(extractCountryCode('USA'), 'US');
  assert.equal(extractCountryCode('United States'), 'US');

  // Non-US cases
  assert.equal(extractCountryCode('ESVLC'), 'ES');
  assert.equal(extractCountryCode('Valencia (ESVLC)'), 'ES');
  assert.equal(extractCountryCode('MAD - Adolfo Suárez Madrid-Barajas'), 'ES');
  assert.equal(extractCountryCode('DEHAM'), 'DE');
  assert.equal(extractCountryCode('FRLEH'), 'FR');
  assert.equal(extractCountryCode('SGSIN'), 'SG');
  assert.equal(extractCountryCode('CNSZX'), 'CN');
  assert.equal(extractCountryCode('Shenzhen / Ningbo (China)'), 'CN');

  // Detect Unit System
  // Si Origen o Destino es US -> IMPERIAL
  assert.equal(detectUnitSystem('USMIA', 'ESVLC'), 'IMPERIAL');
  assert.equal(detectUnitSystem('ESVLC', 'USNYC'), 'IMPERIAL');
  assert.equal(detectUnitSystem('Houston, TX (77002)', 'Chicago, IL (60601)'), 'IMPERIAL');
  assert.equal(detectUnitSystem('MAD', 'JFK - John F. Kennedy Int. New York'), 'IMPERIAL');
  assert.equal(detectUnitSystem('Shenzhen (China)', 'ONT8 - Moreno Valley, CA 92555'), 'IMPERIAL');

  // Si ninguno es US -> METRIC por defecto
  assert.equal(detectUnitSystem('ESVLC', 'Jebel Ali'), 'METRIC');
  assert.equal(detectUnitSystem('Valencia', 'Rotterdam'), 'METRIC');
  assert.equal(detectUnitSystem('ESBCN', 'SGSIN'), 'METRIC');
  assert.equal(detectUnitSystem('', ''), 'METRIC');
  assert.equal(detectUnitSystem(null, undefined), 'METRIC');
});

test('2. getUnitsForSystem devuelve unidades correspondientes para METRIC e IMPERIAL', () => {
  const metric = getUnitsForSystem('METRIC');
  assert.equal(metric.weightUnit, 'kg');
  assert.equal(metric.dimensionUnit, 'cm');
  assert.equal(metric.distanceUnit, 'km');

  const imperial = getUnitsForSystem('IMPERIAL');
  assert.equal(imperial.weightUnit, 'lbs');
  assert.equal(imperial.dimensionUnit, 'in');
  assert.equal(imperial.distanceUnit, 'mi');
});

test('3. Cambio de Moneda (USD / EUR): Reglas geográficas de Europa vs US/LatAm/Asia', () => {
  // Europa pura -> EUR
  assert.equal(detectCurrency('ESVLC', 'FRLEH'), 'EUR');
  assert.equal(detectCurrency('Valencia (ESVLC)', 'Hamburg (DEHAM)'), 'EUR');
  assert.equal(detectCurrency('MAD', 'CDG'), 'EUR');

  // US interno -> USD
  assert.equal(detectCurrency('Houston, TX', 'Chicago, IL'), 'USD');
  assert.equal(detectCurrency('USMIA', 'USNYC'), 'USD');

  // Asia / LatAm -> USD
  assert.equal(detectCurrency('CNSZX', 'SGSIN'), 'USD');
  assert.equal(detectCurrency('BRSSZ', 'SGSIN'), 'USD');

  // Vacío / sin país -> USD
  assert.equal(detectCurrency('', ''), 'USD');
  assert.equal(detectCurrency(null, undefined), 'USD');
});

test('4. Renderizado reactivo en la UI (index.html): Etiquetas y escuchadores de origen y destino', () => {
  // Observa campos de origen Y destino
  assert.match(indexHtml, /'fcl-pod',\s*'lcl-pod',\s*'air-dest',\s*'ground-delivery-zip',\s*'amazon-fba-fc-code'/, 'Debe escuchar todos los campos de destino multimodal');
  assert.match(indexHtml, /'fcl-pol',\s*'lcl-pol',\s*'air-origin',\s*'ground-pickup-zip',\s*'amazon-origin-port'/, 'Debe escuchar todos los campos de origen multimodal');

  // updateMultimodalUnitLabels actualiza las etiquetas con las unidades dinámicas
  assert.match(indexHtml, /function\s+updateMultimodalUnitLabels\s*\(\s*unitSystem\s*\)/, 'Debe definir la función updateMultimodalUnitLabels');
  assert.match(indexHtml, /isImperial\s*\?\s*['"]lbs['"]\s*:\s*['"]kg['"]/, 'Actualiza peso reactivamente a lbs o kg');
  assert.match(indexHtml, /isImperial\s*\?\s*['"]in['"]\s*:\s*['"]cm['"]/, 'Actualiza dimensiones reactivamente a in o cm');
  assert.match(indexHtml, /isImperial\s*\?\s*['"]mi['"]\s*:\s*['"]km['"]/, 'Actualiza distancia reactivamente a mi o km');

  // Exportado en window para testing e interoperabilidad
  assert.match(indexHtml, /window\.detectUnitSystem\s*=\s*detectUnitSystem/, 'Expone detectUnitSystem en window');
  assert.match(indexHtml, /window\.updateMultimodalUnitLabels\s*=\s*updateMultimodalUnitLabels/, 'Expone updateMultimodalUnitLabels en window');
});

test('5. Transformación en el Payload (API Brutus & Quick Quote): weightUnit y dimensionUnit', async () => {
  // Verificar que el payload de sincronización Data Bridge en index.html incluye weightUnit y dimensionUnit
  assert.match(indexHtml, /weightUnit/, 'El payload incluye explícitamente weightUnit');
  assert.match(indexHtml, /dimensionUnit/, 'El payload incluye explícitamente dimensionUnit');

  // Probar que createFclQuote, createLclQuote, createAirQuote, createLtlQuote, createEcommerceOrder
  // inyectan weightUnit y dimensionUnit en el cuerpo JSON de la petición
  let capturedBody = null;
  const mockFetch = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return {
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ uuid: 'test-uuid', rates: [{ totalAmount: 1200 }] }),
    };
  };

  // Mock global fetch para testear el cliente API
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    // 1. FCL con weightUnit y dimensionUnit
    await createFclQuote({
      originIso: 'ESVLC',
      destIso: 'USMIA',
      containers: [{ containerType: '40HC', quantity: 1 }],
      weightUnit: 'lbs',
      dimensionUnit: 'in',
    });
    assert.equal(capturedBody.weightUnit, 'lbs');
    assert.equal(capturedBody.dimensionUnit, 'in');

    // 2. LCL con weightUnit y dimensionUnit
    await createLclQuote({
      originIso: 'ESVLC',
      destIso: 'Jebel Ali',
      cargo: { grossWeight: 1500, volume: 4.5 },
      weightUnit: 'kg',
      dimensionUnit: 'cm',
    });
    assert.equal(capturedBody.weightUnit, 'kg');
    assert.equal(capturedBody.dimensionUnit, 'cm');

    // 3. Air quote con weightUnit y dimensionUnit
    await createAirQuote({
      originIata: 'MAD',
      destIata: 'JFK',
      cargo: { grossWeight: 450 },
      weightUnit: 'lbs',
      dimensionUnit: 'in',
    });
    assert.equal(capturedBody.weightUnit, 'lbs');
    assert.equal(capturedBody.dimensionUnit, 'in');

    // 4. Ground LTL con weightUnit y dimensionUnit
    await createLtlQuote({
      originZip: '77002',
      destZip: '60601',
      cargo: { pallets: 4 },
      weightUnit: 'lbs',
      dimensionUnit: 'in',
    });
    assert.equal(capturedBody.weightUnit, 'lbs');
    assert.equal(capturedBody.dimensionUnit, 'in');

    // 5. Ecommerce order con weightUnit y dimensionUnit
    await createEcommerceOrder({
      hubCode: 'ONT8',
      shipper: { name: 'Shipper Inc' },
      consignee: { name: 'Amazon FC' },
      packageData: { boxes: 120 },
      weightUnit: 'lbs',
      dimensionUnit: 'in',
    });
    assert.equal(capturedBody.weightUnit, 'lbs');
    assert.equal(capturedBody.dimensionUnit, 'in');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
