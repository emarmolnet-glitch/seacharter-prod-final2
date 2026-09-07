import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectParserSource = readFileSync(new URL('../netlify/functions/project-parser.js', import.meta.url), 'utf8');

function createHandler(sourceCode, mockGenAI) {
  const cleanCode = sourceCode
    .replace(/import\s+{\s*GoogleGenerativeAI\s*}\s+from\s+["']@google\/generative-ai["'];?/, '')
    .replace(/import\s+{\s*Buffer\s*}\s+from\s+["']node:buffer["'];?/, '')
    .replace(/export\s+default\s+handler;?/, '')
    .replace(/export\s+async\s+function\s+handler/, 'async function handler');

  const fn = new Function('GoogleGenerativeAI', 'Buffer', `${cleanCode}\nreturn handler;`);
  return fn(mockGenAI, Buffer);
}

const dummyHandler = createHandler(projectParserSource, class DummyAI {});
const { VALID_CATEGORIES, VALID_SHIPPING_MODES, normalizeCategory, normalizeShippingMode } = dummyHandler;

test('Controlled Vocabulary: exact lists are defined and exported on handler', () => {
  assert.deepEqual(VALID_CATEGORIES, [
    'Mercancía Ensacada / Dry Bulk',
    'Maquinaria / Equipos Industriales',
    'Vehículo / Unidades Rodadas',
    'Estructura Metálica',
    'Carga General / General Cargo',
    'Suministros / Supplies',
  ]);

  assert.deepEqual(VALID_SHIPPING_MODES, [
    'Big Bags / Granel',
    'Contenedor (FCL / LCL)',
    'Breakbulk / Maquinaria Suelta',
    'Plataforma / Flat Rack',
    'Ro-Ro / Vehículo Rodado',
  ]);
});

test('Controlled Vocabulary - category: semantic mapping across multi-industry terminology', () => {
  // Exact match preservation
  for (const cat of VALID_CATEGORIES) {
    assert.equal(normalizeCategory(cat), cat);
  }

  // 1. Mercancía Ensacada / Dry Bulk
  assert.equal(normalizeCategory('Granel', 'Sacos de cemento portland'), 'Mercancía Ensacada / Dry Bulk');
  assert.equal(normalizeCategory('Bulk', 'Big bags de fertilizante urea 46%'), 'Mercancía Ensacada / Dry Bulk');
  assert.equal(normalizeCategory('Dry Bulk', 'Cereales y grano de trigo a granel'), 'Mercancía Ensacada / Dry Bulk');
  assert.equal(normalizeCategory('Carga Ensacada', 'FIBC con pellets de biomasa'), 'Mercancía Ensacada / Dry Bulk');
  assert.equal(normalizeCategory('', 'Clínker para molienda en vrac'), 'Mercancía Ensacada / Dry Bulk');

  // 2. Maquinaria / Equipos Industriales
  assert.equal(normalizeCategory('Maquinaria', 'Excavadora sobre cadenas CAT 336'), 'Maquinaria / Equipos Industriales');
  assert.equal(normalizeCategory('Equipos de Proceso', 'Bastidor Skid de filtrado por ósmosis inversa'), 'Maquinaria / Equipos Industriales');
  assert.equal(normalizeCategory('Equipos Industriales', 'Transformador eléctrico trifásico 120 MVA'), 'Maquinaria / Equipos Industriales');
  assert.equal(normalizeCategory('Machinery', 'Generador diésel pesado y turbina de gas'), 'Maquinaria / Equipos Industriales');
  assert.equal(normalizeCategory('', 'Pala cargadora sobre ruedas Liebherr'), 'Maquinaria / Equipos Industriales');
  assert.equal(normalizeCategory('Crusher', 'Molino de bolas y chancadora de mandíbula'), 'Maquinaria / Equipos Industriales');

  // 3. Vehículo / Unidades Rodadas
  assert.equal(normalizeCategory('Vehículo', 'Cabeza tractora Mercedes Actros 6x4'), 'Vehículo / Unidades Rodadas');
  assert.equal(normalizeCategory('Automóvil', 'Flota de furgonetas de reparto'), 'Vehículo / Unidades Rodadas');
  assert.equal(normalizeCategory('Unidades Rodadas', 'Semirremolque frigorífico 3 ejes'), 'Vehículo / Unidades Rodadas');
  assert.equal(normalizeCategory('', 'Dúmper articulado para minería Volvo A45G'), 'Vehículo / Unidades Rodadas');
  assert.equal(normalizeCategory('Rolling Unit', 'Autobús interurbano Scania'), 'Vehículo / Unidades Rodadas');

  // 4. Estructura Metálica
  assert.equal(normalizeCategory('Estructura', 'Vigas de acero laminado HEB 500'), 'Estructura Metálica');
  assert.equal(normalizeCategory('Siderúrgico', 'Tuberías de acero sin soldadura para oleoducto'), 'Estructura Metálica');
  assert.equal(normalizeCategory('Steel Structure', 'Bobinas de chapa de acero galvanizado'), 'Estructura Metálica');
  assert.equal(normalizeCategory('', 'Perfiles metálicos y celosías estructurales'), 'Estructura Metálica');
  assert.equal(normalizeCategory('Metal', 'Andamios modulares y pasarelas de hierro'), 'Estructura Metálica');

  // 5. Suministros / Supplies
  assert.equal(normalizeCategory('Repuestos', 'Válvulas de control y compuerta en cajas'), 'Suministros / Supplies');
  assert.equal(normalizeCategory('Supplies', 'Filtros industriales y juntas de estanqueidad'), 'Suministros / Supplies');
  assert.equal(normalizeCategory('Ferretería', 'Tornillería de alta resistencia, pernos y tuercas'), 'Suministros / Supplies');
  assert.equal(normalizeCategory('', 'Cables eléctricos de media tensión y herramientas'), 'Suministros / Supplies');
  assert.equal(normalizeCategory('Spare Parts', 'Rodamientos y accesorios de mantenimiento'), 'Suministros / Supplies');

  // 6. Carga General / General Cargo (fallback estricto y bultos generales)
  assert.equal(normalizeCategory('Carga Paletizada', 'Palets con mercancía diversa empaquetada'), 'Carga General / General Cargo');
  assert.equal(normalizeCategory('Categoría Inexistente Desconocida', 'Bultos sin clasificar'), 'Carga General / General Cargo');
  assert.equal(normalizeCategory('', ''), 'Carga General / General Cargo');
});

test('Controlled Vocabulary - shipping_mode_supported: semantic mapping across modes', () => {
  // Exact match preservation
  for (const mode of VALID_SHIPPING_MODES) {
    assert.equal(normalizeShippingMode(mode), mode);
  }

  // 1. Big Bags / Granel
  assert.equal(normalizeShippingMode('Big Bags', 'Fertilizante en sacos'), 'Big Bags / Granel');
  assert.equal(normalizeShippingMode('Granel', 'Grano en bodega'), 'Big Bags / Granel');
  assert.equal(normalizeShippingMode('FIBC', 'Mineral ensacado'), 'Big Bags / Granel');
  assert.equal(normalizeShippingMode('', 'Big bags de clínker', 1000, 1.1, 1.1, 1.2, 'Mercancía Ensacada / Dry Bulk'), 'Big Bags / Granel');

  // 2. Contenedor (FCL / LCL)
  assert.equal(normalizeShippingMode("Contenedor 20'/40'", 'Cajas en container'), 'Contenedor (FCL / LCL)');
  assert.equal(normalizeShippingMode('Paletizado / Suelto', 'Cajas paletizadas'), 'Contenedor (FCL / LCL)');
  assert.equal(normalizeShippingMode('FCL / LCL', 'Grupaje marítimo LCL'), 'Contenedor (FCL / LCL)');
  assert.equal(normalizeShippingMode('', 'Palets con cajas de repuestos', 800, 1.2, 0.8, 1.6, 'Suministros / Supplies'), 'Contenedor (FCL / LCL)');

  // 3. Plataforma / Flat Rack
  assert.equal(normalizeShippingMode('Flat Rack', 'Pieza con exceso de gálibo'), 'Plataforma / Flat Rack');
  assert.equal(normalizeShippingMode('Plataforma', 'Equipo sobre MAFI'), 'Plataforma / Flat Rack');
  assert.equal(normalizeShippingMode('', 'Plataforma con bastidor sobredimensionado', 12000, 8.0, 2.8, 2.9), 'Plataforma / Flat Rack');

  // 4. Breakbulk / Maquinaria Suelta
  assert.equal(normalizeShippingMode('Breakbulk', 'Transformador de alta potencia'), 'Breakbulk / Maquinaria Suelta');
  assert.equal(normalizeShippingMode('Maquinaria Suelta', 'Turbina a vapor'), 'Breakbulk / Maquinaria Suelta');
  assert.equal(normalizeShippingMode('', 'Excavadora pesada sobre orugas', 32000, 9.5, 3.2, 3.4), 'Breakbulk / Maquinaria Suelta');
  assert.equal(normalizeShippingMode('', 'Vigas largas de 16 metros', 18000, 16.0, 0.6, 0.8, 'Estructura Metálica'), 'Breakbulk / Maquinaria Suelta');

  // 5. Ro-Ro / Vehículo Rodado
  assert.equal(normalizeShippingMode('Ro-Ro', 'Camiones de transporte'), 'Ro-Ro / Vehículo Rodado');
  assert.equal(normalizeShippingMode('Vehículo Rodado', 'Cabeza tractora con remolque'), 'Ro-Ro / Vehículo Rodado');
  assert.equal(normalizeShippingMode('', 'Dúmper minero y tractora', 22000, 8.5, 2.5, 3.5, 'Vehículo / Unidades Rodadas'), 'Ro-Ro / Vehículo Rodado');
});

test('Controlled Vocabulary: PROHIBITED to produce custom values outside eligible catalogs', () => {
  const customCategories = [
    'Bastidores Desalación',
    'Custom Category 99',
    'Paletizado / Suelto',
    'Equipos Especiales de Petróleo',
    'Material Varios',
    'Químicos Peligrosos',
    '12345',
    'null',
    'undefined'
  ];

  for (const cat of customCategories) {
    const normalized = normalizeCategory(cat);
    assert.ok(
      VALID_CATEGORIES.includes(normalized),
      `Category "${normalized}" derived from "${cat}" MUST belong strictly to VALID_CATEGORIES`
    );
  }

  const customModes = [
    'Aéreo',
    'Ferroviario',
    'Paletizado / Suelto',
    'Camión Lona',
    'Mafi Trailer Personalizado',
    'Modo Inventado 42',
    'Desconocido',
    '',
    null
  ];

  for (const mode of customModes) {
    const normalized = normalizeShippingMode(mode);
    assert.ok(
      VALID_SHIPPING_MODES.includes(normalized),
      `Shipping mode "${normalized}" derived from "${mode}" MUST belong strictly to VALID_SHIPPING_MODES`
    );
  }
});

test('End-to-end project-parser handler: guarantees 100% adherence to controlled vocabulary', async () => {
  class MockControlledGenAI {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: {
            text: () => JSON.stringify({
              success: true,
              items: [
                {
                  category: 'Mercancía Ensacada / Dry Bulk',
                  type: 'Big Bags de Cemento Gris',
                  quantity: 50,
                  length: 1.1,
                  width: 1.1,
                  height: 1.4,
                  weight: 1500,
                  shipping_mode_supported: 'Big Bags / Granel'
                },
                {
                  category: 'Equipos Extraños Fuera de Catálogo',
                  type: 'Transformador Eléctrico 85 MVA',
                  quantity: 1,
                  length: 7.2,
                  width: 3.1,
                  height: 3.8,
                  weight: 48000,
                  shipping_mode_supported: 'Modo Antiguo No Permitido'
                },
                {
                  category: 'Estructura Metálica',
                  type: 'Vigas IPE 600',
                  quantity: 12,
                  length: 12.5,
                  width: 0.3,
                  height: 0.6,
                  weight: 1450,
                  shipping_mode_supported: 'Contenedor (FCL / LCL)'
                },
                {
                  category: 'Vehículo',
                  type: 'Camión Volquete 8x4',
                  quantity: 2,
                  length: 8.8,
                  width: 2.5,
                  height: 3.2,
                  weight: 14000,
                  shipping_mode_supported: 'Ro-Ro / Vehículo Rodado'
                },
                {
                  category: 'Repuestos Varios',
                  type: 'Cajas de Tornillos y Válvulas',
                  quantity: 20,
                  length: 0.8,
                  width: 0.6,
                  height: 0.5,
                  weight: 120,
                  shipping_mode_supported: ''
                }
              ]
            })
          }
        })
      };
    }
  }

  const handler = createHandler(projectParserSource, MockControlledGenAI);
  process.env.GEMINI_API_KEY = 'test-key-controlled';

  const req = new Request('https://seacharter.netlify.app/.netlify/functions/project-parser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Lista de embarque con diversos tipos de carga de proyecto y general'
    }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.items.length, 5);

  for (const item of data.items) {
    assert.ok(
      VALID_CATEGORIES.includes(item.category),
      `Item category "${item.category}" must be strictly in VALID_CATEGORIES`
    );
    assert.ok(
      VALID_SHIPPING_MODES.includes(item.shipping_mode_supported),
      `Item mode "${item.shipping_mode_supported}" must be strictly in VALID_SHIPPING_MODES`
    );
  }

  // Check specific mapped entries
  assert.equal(data.items[0].category, 'Mercancía Ensacada / Dry Bulk');
  assert.equal(data.items[0].shipping_mode_supported, 'Big Bags / Granel');

  // Item 1 had non-catalog category and mode; should be normalized semantically:
  // "Transformador Eléctrico 85 MVA" -> Maquinaria / Equipos Industriales & Breakbulk / Maquinaria Suelta (> 15000 kg)
  assert.equal(data.items[1].category, 'Maquinaria / Equipos Industriales');
  assert.equal(data.items[1].shipping_mode_supported, 'Breakbulk / Maquinaria Suelta');

  assert.equal(data.items[2].category, 'Estructura Metálica');
  assert.equal(data.items[2].shipping_mode_supported, 'Contenedor (FCL / LCL)');

  assert.equal(data.items[3].category, 'Vehículo / Unidades Rodadas');
  assert.equal(data.items[3].shipping_mode_supported, 'Ro-Ro / Vehículo Rodado');

  assert.equal(data.items[4].category, 'Suministros / Supplies');
  assert.equal(data.items[4].shipping_mode_supported, 'Contenedor (FCL / LCL)');
});
