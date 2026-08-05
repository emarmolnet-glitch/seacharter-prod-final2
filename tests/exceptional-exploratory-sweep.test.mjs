import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('index.html removes the Barrido Exploratorio Excepcional controls from Density', () => {
  assert.doesNotMatch(indexSource, /id="exceptional-exploratory-sweep-panel"/);
  assert.doesNotMatch(indexSource, /id="exceptional-vessel-category-select"/);
  assert.doesNotMatch(indexSource, /id="btn-explorar-categoria"/);
  assert.doesNotMatch(indexSource, /id="exceptional-sweep-result"/);
  assert.doesNotMatch(indexSource, /Barrido Exploratorio Excepcional \(Sondear Zona\)/);
});

test('all primary Density panels are expanded by default', () => {
  const panelTitles = [
    'ANÁLISIS DE DENSIDAD DE FLOTA',
    'ALGORITMO DE FLETE JUSTO AIS',
    'CENTRO DE MAPA DENSIDAD',
    'MAPA DE DENSIDAD',
    'BUQUES DETECTADOS EN TIEMPO REAL (OPENSHIPS)',
  ];

  panelTitles.forEach((title) => {
    const titleIndex = indexSource.indexOf(title);
    const panelStart = indexSource.lastIndexOf('data-collapsible-section', titleIndex);
    const panelMarkup = indexSource.slice(panelStart, titleIndex);

    assert.ok(titleIndex >= 0, `Missing Density panel: ${title}`);
    assert.match(panelMarkup, /data-default-open="true"/, `${title} should be open by default`);
  });
});

test('matchExceptionalCategory classifies vessels correctly by DWT and class name', () => {
  const matchStart = indexSource.indexOf('function matchExceptionalCategory(');
  const matchEnd = indexSource.indexOf('window.matchExceptionalCategory = matchExceptionalCategory;', matchStart);
  const matchSource = indexSource.slice(matchStart, matchEnd);

  const windowMock = {};
  new Function('window', `${matchSource}\nwindow.matchExceptionalCategory = matchExceptionalCategory;`)(windowMock);
  const matchFn = windowMock.matchExceptionalCategory;

  // DWT Range tests
  assert.equal(matchFn({ dwt: 3000, vesselClass: 'Cargo' }, 'Coaster'), true);
  assert.equal(matchFn({ dwt: 8000, vesselClass: 'Cargo' }, 'Mini Bulker'), true);
  assert.equal(matchFn({ dwt: 28000, vesselClass: 'Cargo' }, 'Handysize'), true);
  assert.equal(matchFn({ dwt: 42000, vesselClass: 'Cargo' }, 'Handymax'), true);
  assert.equal(matchFn({ dwt: 55000, vesselClass: 'Cargo' }, 'Supramax'), true);
  assert.equal(matchFn({ dwt: 63000, vesselClass: 'Cargo' }, 'Ultramax'), true);
  assert.equal(matchFn({ dwt: 75000, vesselClass: 'Cargo' }, 'Panamax'), true);

  // String keyword tests (overrides when DWT is 0)
  assert.equal(matchFn({ dwt: 0, vesselClass: 'Handysize Bulk Carrier' }, 'Handysize'), true);
  assert.equal(matchFn({ dwt: 0, vesselClass: 'Supramax Vessel' }, 'Supramax'), true);
  assert.equal(matchFn({ dwt: 0, vesselClass: 'Coaster Freight' }, 'Coaster'), true);
});

test('ejecutarBarridoExploratorioExcepcional enforces Strict Sandbox Isolation and exploratoryVesselsCache', async () => {
  const sweepStart = indexSource.indexOf('window.ejecutarBarridoExploratorioExcepcional = function');
  const sweepEnd = indexSource.indexOf('function assignAisProspectionZone', sweepStart);
  const sweepSource = indexSource.slice(sweepStart, sweepEnd);

  // Exploratory Cache definition
  assert.match(indexSource, /window\.exploratoryVesselsCache = window\.exploratoryVesselsCache \|\| \[\]/);

  // UI feedback & setTimeout
  assert.match(sweepSource, /Sondeando radar\.\.\./);
  assert.match(sweepSource, /setTimeout\(doSweepCalculation, 900\)/);

  // Button reset logic
  assert.match(sweepSource, /const resetBtn = \(\) =>/);
  assert.match(sweepSource, /resetBtn\(\)/);

  // POL requirement and warning banner
  assert.match(sweepSource, /getAisOperationalPort\('POL'\)/);
  assert.match(sweepSource, /bg-yellow-50/);
  assert.match(sweepSource, /Define primero un Puerto de Carga \(POL\)/);

  // Step A: Main store check (read-only)
  assert.match(sweepSource, /GlobalStore\.getRawVessels/);

  // Step B & C: Isolated exploratory cache fallback and fetch
  assert.match(sweepSource, /window\.exploratoryVesselsCache/);

  // Step D: Store fetched results EXCLUSIVELY in exploratoryVesselsCache
  assert.match(sweepSource, /window\.exploratoryVesselsCache = payload\.vessels/);

  // Console debug log
  assert.match(sweepSource, /console\.log\('Buques crudos evaluados:', radarData\.length, 'Radio usado:', radiusNm\)/);

  // Distance and DWT filtering only
  assert.match(sweepSource, /calculateAisDistanceNm/);
  assert.match(sweepSource, /matchExceptionalCategory\(vessel, selectedCategory\)/);

  // Strict Sandbox Guarantees: NEVER mutate GlobalStore, filteredVessels, or trigger Coincidencia
  assert.doesNotMatch(sweepSource, /GlobalStore\.setRawVessels/);
  assert.doesNotMatch(sweepSource, /GlobalStore\.vessels\s*=/);
  assert.doesNotMatch(sweepSource, /GlobalStore\.rawVessels\s*=/);
  assert.doesNotMatch(sweepSource, /window\.filteredVessels\s*=/);
  assert.doesNotMatch(sweepSource, /ais:vessels-updated/);
});
