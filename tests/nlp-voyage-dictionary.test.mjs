import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractNaturalVoyageEntities,
  MARITIME_ENTITY_DICTIONARY,
} from '../netlify/functions/_shared/nlp-voyage-dictionary.mjs';

const referenceDate = new Date('2026-08-18T00:00:00Z');

test('extracts colloquial loading and discharge ports', () => {
  const scenario = extractNaturalVoyageEntities(
    'Cargamos en Bilbao y descargamos en Rotterdam, 25.000 toneladas de clinker.',
    referenceDate,
  );

  assert.equal(scenario.pol, 'Bilbao');
  assert.equal(scenario.pod, 'Rotterdam');
  assert.equal(scenario.cargo_qty, 25000);
  assert.equal(scenario.cargo_type, 'clinker');
});

test('maps origin, destination, cargo and deadline into standard fields', () => {
  const scenario = extractNaturalVoyageEntities(
    'Origen: Valencia, destino: Casablanca; carga 12.500 tm de cemento; fecha límite el 3 de octubre de 2026.',
    referenceDate,
  );

  assert.deepEqual(scenario, {
    pol: 'Valencia',
    pod: 'Casablanca',
    laydays: '2026-10-03',
    cancelling: '2026-10-08',
    cargo_qty: 12500,
    cargo_type: 'cemento',
    loading_rate: 0,
    discharge_rate: 0,
  });
});

test('extracts route and explicit natural laycan range', () => {
  const scenario = extractNaturalVoyageEntities(
    'Salida desde Huelva hacia Amberes con 30000 mt de grano, desde el 5 de noviembre de 2026 hasta el 9 de noviembre de 2026.',
    referenceDate,
  );

  assert.equal(scenario.pol, 'Huelva');
  assert.equal(scenario.pod, 'Amberes');
  assert.equal(scenario.laydays, '2026-11-05');
  assert.equal(scenario.cancelling, '2026-11-09');
  assert.equal(scenario.cargo_type, 'grano');
});

test('keeps technical labels and slash-separated laycan dates working', () => {
  const scenario = extractNaturalVoyageEntities(
    'POL: Bilbao; POD: Rotterdam; Laycan: 2026-09-20 / 2026-09-25; 18,000 MT de fertilizante.',
    referenceDate,
  );

  assert.equal(scenario.pol, 'Bilbao');
  assert.equal(scenario.pod, 'Rotterdam');
  assert.equal(scenario.laydays, '2026-09-20');
  assert.equal(scenario.cancelling, '2026-09-25');
  assert.equal(scenario.cargo_qty, 18000);
  assert.equal(scenario.cargo_type, 'fertilizante');
});

test('preserves the existing English route vocabulary', () => {
  const scenario = extractNaturalVoyageEntities(
    'Loading port: Bilbao; discharge port: Rotterdam; 8,000 tonnes of grain.',
    referenceDate,
  );

  assert.equal(scenario.pol, 'Bilbao');
  assert.equal(scenario.pod, 'Rotterdam');
  assert.equal(scenario.cargo_qty, 8000);
  assert.equal(scenario.cargo_type, 'grain');
});

test('understands origin-to-destination phrasing without technical acronyms', () => {
  const scenario = extractNaturalVoyageEntities(
    'Origen Almería hacia Génova; material grano; el barco tiene que estar el 8 de octubre de 2026.',
    referenceDate,
  );

  assert.equal(scenario.pol, 'Almería');
  assert.equal(scenario.pod, 'Génova');
  assert.equal(scenario.cargo_type, 'grano');
  assert.equal(scenario.laydays, '2026-10-08');
  assert.equal(scenario.cancelling, '2026-10-13');
});

test('infers a shared month in between-day expressions', () => {
  const scenario = extractNaturalVoyageEntities(
    'Puerto de salida Gijón; puerto de llegada Bremen; plazo entre el día 20 y el 25 de septiembre de 2026.',
    referenceDate,
  );

  assert.equal(scenario.pol, 'Gijón');
  assert.equal(scenario.pod, 'Bremen');
  assert.equal(scenario.laydays, '2026-09-20');
  assert.equal(scenario.cancelling, '2026-09-25');
});

test('keeps the requested maritime synonym groups explicit', () => {
  assert.ok(MARITIME_ENTITY_DICTIONARY.pol.includes('puerto de embarque'));
  assert.ok(MARITIME_ENTITY_DICTIONARY.pod.includes('descargamos en'));
  assert.ok(MARITIME_ENTITY_DICTIONARY.laycan.includes('fecha límite'));
  assert.ok(MARITIME_ENTITY_DICTIONARY.cargoQuantity.includes('tm'));
  assert.ok(MARITIME_ENTITY_DICTIONARY.cargoType.includes('cemento'));
});

test('does not promote literal POL or POD labels to port names', () => {
  const scenario = extractNaturalVoyageEntities(
    'Ajusta ritmo de carga 1500 en POL y ritmo de descarga 2000 en POD.',
    referenceDate,
  );

  assert.equal(scenario.pol, '');
  assert.equal(scenario.pod, '');
  assert.equal(scenario.loading_rate, 1500);
  assert.equal(scenario.discharge_rate, 2000);
});
