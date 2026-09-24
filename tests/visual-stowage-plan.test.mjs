import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visualStowageSource = readFileSync(new URL('../src/components/VisualStowagePlan.jsx', import.meta.url), 'utf8');
const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('VisualStowagePlan - 1. Estructura de silueta gráfica 2D del buque mercante con proa, popa y cubierta', () => {
  // Verificación de componente exportado
  assert.match(visualStowageSource, /export\s+function\s+VisualStowagePlan/, 'Debe exportar la función VisualStowagePlan');
  assert.match(visualStowageSource, /export\s+default\s+VisualStowagePlan/, 'Debe exportar por defecto VisualStowagePlan');

  // Silueta lateral esquemática SVG
  assert.match(visualStowageSource, /<svg[\s\S]*?viewBox="0 0 1000 320"/, 'El SVG debe definir viewBox 0 0 1000 320');
  assert.match(visualStowageSource, /PROA \/ BOW/, 'Debe incluir señalización de Proa / Bow');
  assert.match(visualStowageSource, /POPA \/ STERN/, 'Debe incluir señalización de Popa / Stern');
  assert.match(visualStowageSource, /CASTILLO PROA/, 'Debe modelar el castillo de proa');
  assert.match(visualStowageSource, /PUENTE \/ POPA/, 'Debe modelar el puente y superestructura de popa');
  assert.match(visualStowageSource, /CUBIERTA[\s\S]*?WEATHER DECK/, 'Debe modelar la cubierta superior (Weather Deck)');
});

test('VisualStowagePlan - 2. Modo Claro e Impresión: Fondo tenue, bordes, acento azul y texto blanco en bodegas ocupadas', () => {
  // 1. Fondo general del barco a gris tenue (bg-gray-100 o #f3f4f6) y borde exterior gris medio (border-gray-400 o #9ca3af)
  assert.match(
    visualStowageSource,
    /bg-gray-100[\s\S]*?border-gray-400/,
    'El contenedor de la silueta debe tener fondo gris tenue bg-gray-100 y borde border-gray-400'
  );
  assert.match(
    visualStowageSource,
    /<stop offset="0%" stopColor="#f3f4f6" \/>/,
    'El casco del buque debe rellenarse con gris tenue #f3f4f6'
  );
  assert.match(
    visualStowageSource,
    /stroke="#9ca3af"/,
    'El contorno del buque debe usar trazo gris medio #9ca3af'
  );

  // 2. Bodegas vacías con fondo blanco puro y texto gris oscuro (#1f2937 o text-gray-800)
  assert.match(
    visualStowageSource,
    /stopColor="#ffffff"/,
    'Las bodegas vacías deben utilizar fondo blanco puro #ffffff'
  );
  assert.match(
    visualStowageSource,
    /fill="#1f2937"/,
    'El texto de las bodegas vacías debe ser gris oscuro / negro (#1f2937)'
  );

  // 3. Bodega OCUPADA (con carga): color de acento azul corporativo (#2563eb / bg-blue-600)
  assert.match(
    visualStowageSource,
    /stopColor="#2563eb"/,
    'Las bodegas ocupadas deben utilizar acento azul corporativo #2563eb'
  );

  // 4. Texto dentro de bodega ocupada estrictamente BLANCO (fill="#ffffff") y en negrita (fontWeight="bold")
  assert.match(
    visualStowageSource,
    /fill="#ffffff"[\s\S]*?fontSize="13"[\s\S]*?fontWeight="bold"[\s\S]*?fontFamily="monospace"[\s\S]*?\{weightMT\.toFixed\(1\)\}\s*MT/,
    'El texto de toneladas métricas en bodega ocupada debe ser estrictamente BLANCO y en negrita'
  );
  assert.match(
    visualStowageSource,
    /fill="#ffffff"[\s\S]*?fontSize="10"[\s\S]*?fontWeight="bold"[\s\S]*?fontFamily="monospace"[\s\S]*?\{weightPct\.toFixed\(1\)\}\s*%\s*peso/,
    'El texto de porcentaje de peso en bodega ocupada debe ser estrictamente BLANCO y en negrita'
  );

  // 5. Etiquetas exteriores (PROA, POPA, CUBIERTA) en gris oscuro (text-gray-700 / #374151) sobre fondo claro
  assert.match(
    visualStowageSource,
    /text-gray-700/,
    'Los contenedores de etiquetas exteriores deben usar la clase text-gray-700'
  );
  assert.match(
    visualStowageSource,
    /fill="#374151"[\s\S]*?CASTILLO PROA/,
    'La etiqueta exterior CASTILLO PROA debe usar gris oscuro #374151'
  );
  assert.match(
    visualStowageSource,
    /fill="#374151"[\s\S]*?PUENTE \/ POPA/,
    'La etiqueta exterior PUENTE / POPA debe usar gris oscuro #374151'
  );
});

test('VisualStowagePlan - 3. Mantiene la tabla inferior de "VALIDACIÓN TÉCNICA E HIDRODINÁMICA" con Volumen, Presión y GM en Modo Claro', () => {
  // Título de la tabla inferior
  assert.match(
    visualStowageSource,
    /VALIDACIÓN TÉCNICA E HIDRODINÁMICA \(CÓDIGO CSS OMI &amp; ESTABILIDAD INTACTA\)/,
    'Debe incluir el título de validación técnica e hidrodinámica'
  );

  // Fila de Volumen Cúbico Ocupado
  assert.match(visualStowageSource, /Volumen Cúbico Ocupado/, 'Debe detallar el Volumen Cúbico Ocupado');
  assert.match(visualStowageSource, /volOccupied\.toFixed\(2\)\}\s*m³/, 'Debe mostrar el valor calculado en m³');

  // Fila de Presión Máxima de Plancha / Tanktop
  assert.match(visualStowageSource, /Presión Máx\. Doble Fondo/, 'Debe detallar la Presión Máxima de Plancha');
  assert.match(visualStowageSource, /maxPressure\.toFixed\(2\)\}\s*t\/m²/, 'Debe mostrar el valor de presión en t/m²');

  // Fila de Altura Metacéntrica (GM)
  assert.match(visualStowageSource, /Altura Metacéntrica \(GM\)/, 'Debe detallar la Altura Metacéntrica GM');
  assert.match(visualStowageSource, /gm\.toFixed\(2\)\}\s*m/, 'Debe mostrar el valor de GM en metros');
  assert.match(visualStowageSource, /ESTABILIDAD INTACTA \[OK\]/, 'Debe emitir dictamen de estabilidad');
});

test('VisualStowagePlan - 4. Integración y conexión de datos en ForwarderWorkspace.jsx', () => {
  // Importación
  assert.match(
    forwarderSource,
    /import\s+VisualStowagePlan\s+from\s+['"]\.\/VisualStowagePlan\.jsx['"]/,
    'ForwarderWorkspace debe importar VisualStowagePlan'
  );

  // Integración dentro del reporte ejecutivo
  assert.match(
    forwarderSource,
    /<VisualStowagePlan[\s\S]*?stowagePlan=\{[\s\S]*?vesselType=\{/,
    'ForwarderWorkspace debe renderizar <VisualStowagePlan /> con stowagePlan y vesselType'
  );

  // Mantiene la sección de estiba con page-break para el reporte impreso
  assert.match(
    forwarderSource,
    /<section[\s\S]*?className="stowage-plan-section/,
    'Debe preservar la sección .stowage-plan-section con reglas de impresión'
  );
});
