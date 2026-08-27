import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const engineSource = await readFile(new URL('../voyage-cost-engine.js', import.meta.url), 'utf8');

const helperBlock = indexSource.match(
  /function readOperationalPdaBase\(type\)[\s\S]*?function buildOperationalPdaBreakdown\(type, basePda, incrementalCost\)[\s\S]*?\n        }/,
)?.[0];

test('operational PDA binding publishes base plus overtime without compounding', () => {
  assert.ok(helperBlock, 'operational PDA binding helpers must be present');
  const inputs = {
    'pda-pol': { value: '10000', dataset: {} },
    'pda-pod': { value: '12000', dataset: {} },
  };
  const context = {
    document: { getElementById: id => inputs[id] || null },
    State: {
      pdaPolBreakdown: [{ item: 'POL dues', amount: 10000 }],
      pdaPodBreakdown: [{ item: 'POD dues', amount: 12000 }],
    },
    getPortPdaBreakdown: (type, total) => [{ item: `${type.toUpperCase()} dues`, amount: total }],
    Number,
    Math,
  };

  vm.runInNewContext(`${helperBlock}
    globalThis.firstBase = readOperationalPdaBase('pol');
    globalThis.firstTotal = publishOperationalPdaTotal('pol', firstBase, 1500);
    globalThis.secondBase = readOperationalPdaBase('pol');
    globalThis.secondTotal = publishOperationalPdaTotal('pol', secondBase, 1500);
    globalThis.breakdown = buildOperationalPdaBreakdown('pol', secondBase, 1500);
  `, context);

  assert.equal(context.firstBase, 10000);
  assert.equal(context.firstTotal, 11500);
  assert.equal(context.secondBase, 10000);
  assert.equal(context.secondTotal, 11500);
  assert.equal(inputs['pda-pol'].value, '11500');
  assert.equal(context.State.pdaPol, 11500);
  assert.deepEqual(
    context.breakdown.map(({ item, amount }) => ({ item, amount })),
    [
      { item: 'POL dues', amount: 10000 },
      { item: 'Coste Incremental Overtime', amount: 1500 },
    ],
  );
});

test('executive insight consumes the published real incremental PDA cost', () => {
  assert.match(engineSource, /calcResults\.pdaIncrementalCost/);
  assert.match(engineSource, /coste incremental de \$\{moneyFormatter\.format\(overtimeSurcharge\)\} integrado en la PDA/);
  assert.match(indexSource, /pdaIncrementalCost: operationalPenaltyAmount/);
});

test('executive dashboard exposes a direct report action', () => {
  assert.match(indexSource, /id="btn-executive-report-summary"[\s\S]*?onclick="generateExecutiveReport\(\)"[\s\S]*?Ver Reporte Ejecutivo del Viaje/);
});
