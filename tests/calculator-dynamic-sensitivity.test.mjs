import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const engine = require('../voyage-cost-engine.js');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const baseVoyage = {
  cargo: 20000,
  breakEvenArmador: 25,
  daysSea: 10,
  daysPort: 10,
  totalDays: 20,
  loadRate: 4000,
  dischRate: 4000,
  totalBunkers: 100000,
  opex: 3000,
  capexDaily: 2000,
  freightRate: 30,
  fuelBreakdown: {
    navigation: { cost: 50000 },
    port: { cost: 50000 },
    totalCost: 100000
  },
  ownerNetBreakdown: {
    grossRevenue: 600000,
    bunkerAndPortCosts: 250000,
    operatingCapitalCosts: 100000
  }
};

test('dynamic sensitivity keeps the official base break-even as its anchor', () => {
  const batch = engine.runSensitivityBatch(baseVoyage);

  assert.equal(batch.base.projectedBreakEven, 25);
  assert.ok(batch.best.projectedBreakEven < batch.base.projectedBreakEven);
  assert.ok(batch.stress.projectedBreakEven > batch.base.projectedBreakEven);
  assert.equal(batch.stress.addedPortDelayDays, 2);
  assert.ok(batch.best.savedPortDays > 0);
  assert.equal(batch.moderate, batch.stress, 'legacy report consumers keep reading the stress scenario');
});

test('risk panel exposes cards, negotiation thermometer and fixture advice', () => {
  assert.match(indexSource, /id="stress-test-panel"/);
  assert.match(indexSource, /sensitivity-scenario-grid/);
  assert.match(indexSource, /negotiation-thermometer/);
  assert.match(indexSource, /fixture-clause-advice/);
  assert.match(indexSource, /sensitivityPanel\.collapsibleSection\.isOpen = true/);
  assert.match(indexSource, /window\.SeaCharterMarineForecast/);
});
