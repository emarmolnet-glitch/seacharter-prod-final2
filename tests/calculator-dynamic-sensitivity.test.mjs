import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const engine = require('../voyage-cost-engine.js');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const engineSource = await readFile(new URL('../voyage-cost-engine.js', import.meta.url), 'utf8');
const voyageDraftEntrySource = await readFile(new URL('../src/voyage-draft-entry.js', import.meta.url), 'utf8');

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
  assert.match(engineSource, /Impacto Meteoceánico/);
  assert.match(engineSource, /meteocean-impact__metrics/);
});

test('meteocean risk adds wind buffers per port and one laytime operational buffer', () => {
  const result = engine.calculateMeteoceanRisk({
    draftVoyage: {
      weather: {
        source: 'voyage-store-weather',
        ports: {
          pol: { role: 'POL', portName: 'Bilbao', windKnots: 26, operationalStatus: 'Normal', condition: 'Viento' },
          pod: { role: 'POD', portName: 'Aveiro', windKnots: 28, operationalStatus: 'Lluvia', condition: 'Temporal' },
        },
      },
    },
    laytimeDays: 10,
    demurrageRate: 10000,
  });

  assert.equal(result.maneuverBufferDays, 1);
  assert.equal(result.operationalBufferDays, 2);
  assert.equal(result.totalBufferDays, 3);
  assert.equal(result.financialImpact, 30000);
  assert.equal(result.risks.filter((risk) => risk.type === 'wind').length, 2);
  assert.equal(result.risks.filter((risk) => risk.type === 'operational').length, 1);
});

test('meteocean risk reads DraftVoyage weather from the global store without fetching', () => {
  const previousStore = globalThis.VoyageDraftStore;
  globalThis.VoyageDraftStore = {
    getState: () => ({
      draft: {
        weather: {
          ports: {
            pol: { role: 'POL', portName: 'Gijón', windKnots: 25, operationalStatus: 'Normal', condition: 'Estable' },
            pod: { role: 'POD', portName: 'Dublín', windKnots: 26, operationalStatus: 'Riesgo', condition: 'Temporal' },
          },
        },
      },
    }),
  };

  try {
    const result = engine.calculateMeteoceanRisk({ laytimeDays: 5, demurrageRate: 12000 });
    assert.equal(result.maneuverBufferDays, 0.5, '25 kn is not penalized because the threshold is strictly greater than 25');
    assert.equal(result.operationalBufferDays, 1);
    assert.equal(result.totalBufferDays, 1.5);
    assert.equal(result.financialImpact, 18000);
    assert.match(voyageDraftEntrySource, /window\.VoyageDraftStore = voyageStore/);
    assert.doesNotMatch(engineSource.slice(engineSource.indexOf('function calculateMeteoceanRisk'), engineSource.indexOf('function buildFixtureClauseAdvice')), /fetch\s*\(/);
  } finally {
    globalThis.VoyageDraftStore = previousStore;
  }
});
