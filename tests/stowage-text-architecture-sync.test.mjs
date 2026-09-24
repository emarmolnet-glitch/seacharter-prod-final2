import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const visualStowageSource = readFileSync(new URL('../src/components/VisualStowagePlan.jsx', import.meta.url), 'utf8');

// Extraer helpers desde VisualStowagePlan.jsx
function extractFunction(source, fnName) {
  const match = source.match(new RegExp(`export function ${fnName}\\([\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`${fnName} no encontrado`);
  const code = match[0].replace(`export function ${fnName}`, `function ${fnName}`);
  return new Function(`${code}; return ${fnName};`)();
}

const resolveVesselProfile = extractFunction(visualStowageSource, 'resolveVesselProfile');
const adaptRoRoJustification = extractFunction(visualStowageSource, 'adaptRoRoJustification');

test('Stowage Architecture Sync - 1. Integración de resolveVesselProfile y adaptRoRoJustification en ForwarderWorkspace', () => {
  assert.match(
    forwarderSource,
    /import\s+VisualStowagePlan\s+from\s+['"]\.\/VisualStowagePlan\.jsx['"]/,
    'Debe importar VisualStowagePlan'
  );
  assert.match(
    forwarderSource,
    /resolveVesselProfile/,
    'Debe usar resolveVesselProfile en el texto de ForwarderWorkspace'
  );
  assert.match(
    forwarderSource,
    /adaptRoRoJustification/,
    'Debe usar adaptRoRoJustification en el razonamiento técnico'
  );
});

test('Stowage Architecture Sync - 2. adaptRoRoJustification sustituye cunas de madera y Tanktop por terminología Ro-Ro', () => {
  const sampleJustification = 'Lógica de Asignación de Bodegas: La carga mayoritaria corresponde a Heavy Lift y maquinaria pesada/estructuras, posicionada en el Doble Fondo Reforzado (Tanktop, capacidad admisible de 20.0 t/m²) sobre cunas estructurales de madera y trincaje pesado G80, garantizando un centro de gravedad (KG) bajo y maximizando la estabilidad transversal.';

  const roroAdapted = adaptRoRoJustification(sampleJustification, 'RORO');
  assert.ok(!roroAdapted.includes('cunas estructurales de madera'), 'No debe contener cunas estructurales de madera');
  assert.ok(!roroAdapted.includes('cunas de madera'), 'No debe contener cunas de madera');
  assert.ok(!roroAdapted.includes('Tanktop'), 'No debe contener Tanktop');
  assert.match(roroAdapted, /estiba rodada asegurada con cadenas G80 en cubiertas horizontales/i, 'Debe incluir la terminología Ro-Ro requerida');

  // Perfil HANDYSIZE debe conservar el texto original sin alteraciones
  const handysizeOriginal = adaptRoRoJustification(sampleJustification, 'HANDYSIZE');
  assert.equal(handysizeOriginal, sampleJustification, 'En Handysize debe mantenerse el texto original');
});

test('Stowage Architecture Sync - 3. Perfil RORO: Título "ESTIBA RODADA (RO-RO / PURE CAR CARRIER)" y descripción dinámica', () => {
  assert.match(
    forwarderSource,
    /ESTIBA RODADA \(RO-RO \/ PURE CAR CARRIER\)/,
    'Debe cambiar el título final a "ESTIBA RODADA (RO-RO / PURE CAR CARRIER)" cuando el perfil sea Ro-Ro'
  );
  assert.match(
    forwarderSource,
    /currentProfile\s*===\s*['"]RORO['"][\s\S]*?3 Cubiertas Horizontales \+ Rampa de Popa/,
    'Debe sustituir la descripción estática de Handysize por datos dinámicos del buque Ro-Ro'
  );
});

test('Stowage Architecture Sync - 4. Perfil RORO: Grid con CUBIERTA SUPERIOR, PRINCIPAL e INFERIOR y eliminación de BODEGAS 1-4', () => {
  // Verificación de cubiertas horizontales en perfil Ro-Ro
  assert.match(
    forwarderSource,
    /name:\s*['"]CUBIERTA SUPERIOR['"]/,
    'El grid de Ro-Ro debe definir CUBIERTA SUPERIOR'
  );
  assert.match(
    forwarderSource,
    /name:\s*['"]CUBIERTA PRINCIPAL['"]/,
    'El grid de Ro-Ro debe definir CUBIERTA PRINCIPAL'
  );
  assert.match(
    forwarderSource,
    /name:\s*['"]CUBIERTA INFERIOR['"]/,
    'El grid de Ro-Ro debe definir CUBIERTA INFERIOR'
  );

  // Mapeo de variables de carga MT coincidiendo con el dibujo de VisualStowagePlan
  assert.match(
    forwarderSource,
    /weatherWeight[\s\S]*?mainWeight[\s\S]*?lowerWeight/,
    'Debe calcular las toneladas métricas de cubiertas horizontales (weatherWeight, mainWeight, lowerWeight) idénticas a VisualStowagePlan'
  );

  // Estiba rodada asegurada con cadenas G80 en cubiertas horizontales
  assert.match(
    forwarderSource,
    /Estiba rodada asegurada con cadenas G80 en cubiertas horizontales/,
    'Debe especificar el trincaje de estiba rodada con cadenas G80 en cubiertas horizontales'
  );
});

test('Stowage Architecture Sync - 5. Perfil COASTER: Oculta Bodegas 3 y 4 y muestra únicamente Bodega 1 y 2', () => {
  assert.match(
    forwarderSource,
    /currentProfile\s*===\s*['"]COASTER['"][\s\S]*?coasterGridCards/,
    'Debe contar con rama de renderizado para Coaster'
  );
  assert.match(
    forwarderSource,
    /name:\s*['"]BODEGA 1['"][\s\S]*?name:\s*['"]BODEGA 2['"]/,
    'Debe definir únicamente BODEGA 1 y BODEGA 2 para perfil Coaster'
  );
  assert.match(
    forwarderSource,
    /h1Weight[\s\S]*?h2Weight/,
    'Debe consolidar las toneladas métricas de las bodegas 3 y 4 en las bodegas 1 y 2'
  );
});
