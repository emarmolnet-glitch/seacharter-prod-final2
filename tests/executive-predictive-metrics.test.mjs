import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDynamicEta, calculateLaytimeProjection } from '../src/executive-predictive-metrics.mjs';

test('dynamic ETA uses remaining nautical miles and live AIS speed', () => {
  const metrics = calculateDynamicEta({
    remainingDistanceNm: 326.82,
    speedKnots: 12,
    calculatedAt: '2026-08-08T00:00:00.000Z',
  });

  assert.equal(metrics.sailingHours, 27.235);
  assert.equal(metrics.dynamicEtaAt, '2026-08-09T03:14:06.000Z');
});

test('dynamic ETA stays unavailable when AIS speed is not usable', () => {
  const metrics = calculateDynamicEta({ remainingDistanceNm: 326.82, speedKnots: 0 });

  assert.equal(metrics.dynamicEtaAt, null);
  assert.equal(metrics.sailingHours, null);
});

test('laytime projection aggregates operations and prices projected extra hours', () => {
  const projection = calculateLaytimeProjection([
    {
      operation: 'LOAD',
      laytimeRule: 'SHEX',
      quantityMt: 30_000,
      rateMtDay: 15_000,
      allowedHours: 36,
      demurrageRateUsdDay: 24_000,
      calculation: { usedSeconds: 18 * 3_600 },
    },
    {
      operation: 'DISCHARGE',
      quantityMt: 30_000,
      rateMtDay: 30_000,
      allowedHours: 24,
      demurrageRateUsdDay: 18_000,
      calculation: { usedSeconds: 0 },
    },
  ], '2026-08-10T12:00:00.000Z');

  assert.equal(projection.allowedHours, 60);
  assert.equal(projection.projectedUsedHours, 72);
  assert.equal(projection.projectedExtraHours, 12);
  assert.equal(projection.projectedDemurrageUSD, 12_000);
  assert.equal(projection.projectedCompletionAt, '2026-08-13T12:00:00.000Z');
  assert.equal(projection.laytimeRule, 'SHEX');
});

test('laytime exposure keeps operation-specific overruns instead of offsetting them', () => {
  const projection = calculateLaytimeProjection([
    {
      operation: 'LOAD',
      quantityMt: 20_000,
      rateMtDay: 10_000,
      allowedHours: 24,
      demurrageRateUsdDay: 24_000,
      calculation: { usedSeconds: 0 },
    },
    {
      operation: 'DISCHARGE',
      quantityMt: 10_000,
      rateMtDay: 20_000,
      allowedHours: 36,
      demurrageRateUsdDay: 12_000,
      calculation: { usedSeconds: 0 },
    },
  ], '2026-08-10T12:00:00.000Z');

  assert.equal(projection.allowedHours, 60);
  assert.equal(projection.projectedUsedHours, 60);
  assert.equal(projection.projectedExtraHours, 24);
  assert.equal(projection.projectedDemurrageUSD, 24_000);
});
