import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visualStowageSource = readFileSync(new URL('../src/components/VisualStowagePlan.jsx', import.meta.url), 'utf8');

// Extraer resolveVesselProfile desde el código fuente sin requerir loader jsx
function createResolverFromSource(source) {
  const match = source.match(/export function resolveVesselProfile\([\s\S]*?\n\}/);
  if (!match) throw new Error('resolveVesselProfile no encontrado');
  const code = match[0].replace('export function resolveVesselProfile', 'function resolveVesselProfile');
  return new Function(`${code}; return resolveVesselProfile;`)();
}

const resolveVesselProfile = createResolverFromSource(visualStowageSource);

test('VisualStowagePlan Dynamic - 1. resolveVesselProfile detecta perfiles navales correctamente', () => {
  assert.equal(resolveVesselProfile('Coaster'), 'COASTER');
  assert.equal(resolveVesselProfile('Mini-Bulker'), 'COASTER');
  assert.equal(resolveVesselProfile('Coaster / Buque de Carga General (Mini-Bulker)'), 'COASTER');
  assert.equal(resolveVesselProfile('Cabotaje 3.500 DWT'), 'COASTER');

  assert.equal(resolveVesselProfile('Ro-Ro Cargo'), 'RORO');
  assert.equal(resolveVesselProfile('Pure Ro-Ro Carrier'), 'RORO');
  assert.equal(resolveVesselProfile('Ro-Lo Vessel'), 'RORO');
  assert.equal(resolveVesselProfile('Vehicle Carrier'), 'RORO');

  assert.equal(resolveVesselProfile('Handysize Bulk Carrier'), 'HANDYSIZE');
  assert.equal(resolveVesselProfile('Multi-Purpose MPP / Handysize Bulker'), 'HANDYSIZE');
  assert.equal(resolveVesselProfile('Geared Breakbulk (Lo-Lo)'), 'HANDYSIZE');
  assert.equal(resolveVesselProfile('Supramax Bulk Carrier'), 'HANDYSIZE');
});

test('VisualStowagePlan Dynamic - 2. Renderizado condicional de arquitectura naval por perfil', () => {
  // Coaster / Mini-Bulker: solo 2 bodegas diáfanas y sin grúas pesadas
  assert.match(visualStowageSource, /profile\s*===\s*['"]COASTER['"]\s*\?\s*2\s*:/, 'Debe restringir el conteo a 2 bodegas diáfanas en perfil Coaster');
  assert.match(visualStowageSource, /Bodega Diáfana/, 'Debe titular Bodega Diáfana en perfil Coaster');
  assert.match(visualStowageSource, /profile\s*===\s*['"]HANDYSIZE['"][\s\S]*?deck-cranes/, 'Las grúas solo deben dibujarse en buques Handysize/MPP');

  // Ro-Ro / Ro-Lo: cubiertas horizontales continuas y rampa en popa
  assert.match(visualStowageSource, /profile\s*===\s*['"]RORO['"][\s\S]*?stern-ramp/, 'Debe modelar la rampa de popa (Stern Ramp) en perfil Ro-Ro');
  assert.match(visualStowageSource, /roro-horizontal-decks/, 'Debe renderizar cubiertas horizontales en perfil Ro-Ro');
  assert.match(visualStowageSource, /Weather Deck[\s\S]*?Main Car Deck[\s\S]*?Lower Hold Deck/, 'Debe definir Weather Deck, Main Deck y Lower Deck');
});

test('VisualStowagePlan Dynamic - 3. Reasignación segura de toneladas métricas para perfil Coaster', () => {
  // Reasignación segura bloqueando compartimentos 3 y 4
  assert.match(visualStowageSource, /if\s*\(profile\s*===\s*['"]COASTER['"]\)\s*\{/, 'Debe aislar la asignación para Coaster');
  assert.match(visualStowageSource, /h1Weight[\s\S]*?h2Weight/, 'Debe consolidar las toneladas en Bodegas 1 y 2');
});
