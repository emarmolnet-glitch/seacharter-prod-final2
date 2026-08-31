import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const moduleJs = readFileSync(new URL('../src/compatibilidad-module.js', import.meta.url), 'utf8');
const moduleCss = readFileSync(new URL('../compatibilidad.css', import.meta.url), 'utf8');
const netlifyFn = readFileSync(new URL('../netlify/functions/vessel-compatibility.ts', import.meta.url), 'utf8');

test('Compatibility module dynamically resolves active operation parameters from calculator and store', () => {
  assert.match(moduleJs, /resolveActiveOperation\(\)/, 'Must have resolveActiveOperation method');
  assert.match(moduleJs, /readRouteStateFromCalculator/, 'Must inherit route state from calculator and map');
  assert.match(moduleJs, /readValidatedCargoOperationState/, 'Must inherit cargo and rate state from calculator');
  assert.match(moduleJs, /SeaCharterStore/, 'Must synchronize with global reactive store');
  assert.match(moduleJs, /syncOperationFromState\(\)/, 'Must provide dynamic state synchronizer');
});

test('Compatibility module allows manual interactive vessel selection and updates hero decision view', () => {
  assert.match(moduleJs, /handleSelectVessel\(imo\)/, 'Must have interactive vessel selection handler');
  assert.match(moduleJs, /selectedVesselImo/, 'Must track manual selected vessel state');
  assert.match(moduleJs, /is-selected/, 'Must toggle is-selected class on user click');
  assert.match(moduleCss, /\.compatibility-vessel-card\.is-selected/, 'CSS must style selected candidate with visual feedback');
  assert.match(moduleJs, /Candidato Seleccionado Manualmente/, 'Must adapt hero badge when user chooses an alternative candidate');
});

test('Backend function and client filter strictly exclude non-commercial vessels and cross-reference with Neon DB', () => {
  assert.match(netlifyFn, /STRICT_NON_COMMERCIAL_RE/, 'Backend function must define strict non-commercial exclusion regex');
  assert.match(netlifyFn, /FROM vessels_master/, 'Backend function must query Neon DB Postgres vessels_master table');
  assert.match(moduleJs, /STRICT_NON_COMMERCIAL_RE/, 'Client fallback must enforce strict non-commercial exclusion');
  assert.match(moduleJs, /getDensityReactiveVessels/, 'Client integrates with density reactive fleet');
});
