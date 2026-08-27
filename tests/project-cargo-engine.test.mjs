import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const engine = require('../project-cargo-engine.js');

test('ignores standard cargo categories', () => {
    const result = engine.calculateProjectCargoRequirements({
        cargoType: 'Minerales y Construcción',
        unitWeightMT: 120,
        length: 18,
        width: 4
    });

    assert.equal(result.isProjectCargo, false);
    assert.equal(result.estimatedLashingCost, 0);
    assert.deepEqual(result.requiredEquipment, []);
});

test('prices heavy lift equipment and geared vessel requirement', () => {
    const result = engine.calculateProjectCargoRequirements({
        cargoType: 'Carga de Proyecto (Breakbulk)',
        unitWeightMT: 120,
        length: 12,
        width: 4,
        height: 4
    });

    assert.equal(result.isProjectCargo, true);
    assert.ok(result.appliedRules.includes('HEAVY_LIFT'));
    assert.ok(result.requiredEquipment.includes('Spreaders / lifting beams'));
    assert.match(result.craneRequirements, /SWL mínimo 120T/);
    assert.equal(result.estimatedLashingCost, 8920);
    assert.equal(result.portCostAllocation.pol + result.portCostAllocation.pod, result.estimatedLashingCost);
});

test('applies long cargo multiplier and SPMT rental', () => {
    const result = engine.calculateProjectCargoRequirements({
        cargoType: 'Heavy Lift transformer Breakbulk',
        unitWeightMT: 95,
        length: 18,
        width: 4,
        handlingMode: 'roro-spmt',
        operationDays: 2
    });

    assert.ok(result.appliedRules.includes('HEAVY_LIFT'));
    assert.ok(result.appliedRules.includes('OUT_OF_GAUGE_LENGTH'));
    assert.ok(result.appliedRules.includes('RORO_HEAVY_TRANSPORT'));
    assert.ok(result.requiredEquipment.includes('SPMT'));
    assert.ok(result.estimatedLashingCost > 20000);
});

test('binds project cargo allocations into both PDA breakdowns and executive insights', () => {
    const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const voyageEngineSource = fs.readFileSync(new URL('../voyage-cost-engine.js', import.meta.url), 'utf8');

    assert.match(indexSource, /Project Cargo — Izado, Estiba y Trincaje/);
    assert.match(indexSource, /projectCargoPolCost/);
    assert.match(indexSource, /projectCargoPodCost/);
    assert.match(indexSource, /State\.projectCargoAssessment = projectCargoAssessment/);
    assert.match(voyageEngineSource, /projectCargoAssessment\.insightMessage/);
});
