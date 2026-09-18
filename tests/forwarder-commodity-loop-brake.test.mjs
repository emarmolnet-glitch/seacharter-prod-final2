import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. ForwarderWorkspace includes loop-safe braking in appliedTariff block for setInlandCost and setMercanciaCost', () => {
  assert.match(
    workspaceSource,
    /setInlandCost\(\s*prev\s*=>\s*\(\s*prev\s*===\s*computedInland\s*\?\s*prev\s*:\s*computedInland\s*\)\s*\);/,
    'Must use functional update checking prev === computedInland to prevent redundant re-renders'
  );

  assert.match(
    workspaceSource,
    /setMercanciaCost\(\s*prev\s*=>\s*\(\s*prev\s*===\s*computedMercancia\s*\?\s*prev\s*:\s*computedMercancia\s*\)\s*\);/,
    'Must use functional update checking prev === computedMercancia to prevent redundant re-renders'
  );
});

test('2. ForwarderWorkspace guards activeProject mutations against infinite loops in appliedTariff', () => {
  assert.match(
    workspaceSource,
    /if\s*\(\s*activeProject\.valor_total_mercancia_usd\s*!==\s*computedMercancia\s*\)\s*\{\s*activeProject\.valor_total_mercancia_usd\s*=\s*computedMercancia;\s*\}/,
    'Must only mutate activeProject.valor_total_mercancia_usd when the value actually changed'
  );

  assert.match(
    workspaceSource,
    /if\s*\(\s*activeProject\.land_freight_cost\s*!==\s*computedInland\s*\)\s*\{\s*activeProject\.land_freight_cost\s*=\s*computedInland;\s*\}/,
    'Must only mutate activeProject.land_freight_cost when the value actually changed'
  );
});

test('3. Functional simulation: loop-brake prevents redundant state updates and mutations', () => {
  const totalWeightTons = 1000;
  const appliedTariff = { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 };
  const computedInland = Math.round(totalWeightTons * appliedTariff.inlandUsdMt * 100) / 100;
  const commodityValueUsdMt = 55;
  const computedMercancia = Math.round(totalWeightTons * commodityValueUsdMt * 100) / 100;

  assert.equal(computedInland, 3000);
  assert.equal(computedMercancia, 55000);

  // First cycle: updates state
  const inlandUpdater = prev => (prev === computedInland ? prev : computedInland);
  const mercanciaUpdater = prev => (prev === computedMercancia ? prev : computedMercancia);

  const initialInland = 0;
  const nextInland = inlandUpdater(initialInland);
  assert.equal(nextInland, 3000);

  // Second cycle: same value, identity preserved
  const stableInland = inlandUpdater(nextInland);
  assert.equal(stableInland, nextInland);

  const initialMercancia = 0;
  const nextMercancia = mercanciaUpdater(initialMercancia);
  assert.equal(nextMercancia, 55000);

  const stableMercancia = mercanciaUpdater(nextMercancia);
  assert.equal(stableMercancia, nextMercancia);

  // Project object brake
  let mutationsCount = 0;
  const activeProject = {
    _valor: null,
    _inland: null,
    get valor_total_mercancia_usd() { return this._valor; },
    set valor_total_mercancia_usd(v) { mutationsCount++; this._valor = v; },
    get land_freight_cost() { return this._inland; },
    set land_freight_cost(v) { mutationsCount++; this._inland = v; }
  };

  // Run brake iteration 1
  if (activeProject) {
    if (activeProject.valor_total_mercancia_usd !== computedMercancia) {
      activeProject.valor_total_mercancia_usd = computedMercancia;
    }
    if (activeProject.land_freight_cost !== computedInland) {
      activeProject.land_freight_cost = computedInland;
    }
  }
  assert.equal(mutationsCount, 2, 'Two initial mutations occurred on first run');

  // Run brake iteration 2
  if (activeProject) {
    if (activeProject.valor_total_mercancia_usd !== computedMercancia) {
      activeProject.valor_total_mercancia_usd = computedMercancia;
    }
    if (activeProject.land_freight_cost !== computedInland) {
      activeProject.land_freight_cost = computedInland;
    }
  }
  assert.equal(mutationsCount, 2, 'No further mutations on identical subsequent runs');
});
