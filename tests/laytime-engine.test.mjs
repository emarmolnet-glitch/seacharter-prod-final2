import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLaytime } from '../laytime-engine.mjs';

const base = {
  quantityMt: 10_000,
  rateMtDay: 10_000,
  demurrageRateUsdDay: 6_000,
  laytimeRule: 'SHINC',
  weatherPermitting: true,
  onceOnDemurrage: true,
  norAcceptedAt: '2026-08-01T00:00:00.000Z',
};

test('calculates demurrage pro rata to the second', () => {
  const result = calculateLaytime({ ...base, operationCompletedAt: '2026-08-02T12:00:00.000Z' });
  assert.equal(result.allowedSeconds, 86_400);
  assert.equal(result.usedSeconds, 129_600);
  assert.equal(result.demurrageSeconds, 43_200);
  assert.equal(result.demurrageUsd, 3_000);
  assert.equal(result.status, 'ON_DEMURRAGE');
});

test('excludes weather stoppage when weather permitting applies', () => {
  const result = calculateLaytime({
    ...base,
    operationCompletedAt: '2026-08-02T06:00:00.000Z',
    incidents: [{ category: 'WEATHER', reason: 'Rain', startAt: '2026-08-01T06:00:00.000Z', endAt: '2026-08-01T12:00:00.000Z', countingFactor: 0 }],
  });
  assert.equal(result.usedSeconds, 86_400);
  assert.equal(result.excludedSeconds, 21_600);
  assert.equal(result.demurrageUsd, 0);
});

test('ignores exceptions after laytime expires under once on demurrage', () => {
  const result = calculateLaytime({
    ...base,
    allowedHours: 12,
    operationCompletedAt: '2026-08-02T00:00:00.000Z',
    incidents: [{ category: 'WEATHER', reason: 'Rain after expiry', startAt: '2026-08-01T14:00:00.000Z', endAt: '2026-08-01T18:00:00.000Z', countingFactor: 0 }],
  });
  assert.equal(result.usedSeconds, 86_400);
  assert.equal(result.demurrageSeconds, 43_200);
  assert.equal(result.ignoredExceptionSeconds, 14_400);
});

test('excludes Sunday under SHEX and flags missing port timezone', () => {
  const result = calculateLaytime({
    ...base,
    quantityMt: 20_000,
    laytimeRule: 'SHEX',
    norAcceptedAt: '2026-08-01T00:00:00.000Z',
    operationCompletedAt: '2026-08-03T00:00:00.000Z',
  });
  assert.equal(result.usedSeconds, 86_400);
  assert.equal(result.excludedSeconds, 86_400);
  assert.ok(result.missingCritical.includes('PORT_TIME_ZONE_FOR_SHEX'));
});

test('applies SHEX boundaries in the port timezone', () => {
  const result = calculateLaytime({
    ...base,
    quantityMt: 20_000,
    laytimeRule: 'SHEX',
    portTimeZone: 'Europe/Madrid',
    norAcceptedAt: '2026-08-01T22:00:00.000Z',
    operationCompletedAt: '2026-08-02T22:00:00.000Z',
  });
  assert.equal(result.usedSeconds, 0);
  assert.equal(result.excludedSeconds, 86_400);
  assert.equal(result.missingCritical.length, 0);
});

test('identifies critical NOR and allowed-time omissions', () => {
  const result = calculateLaytime({ operationCompletedAt: '2026-08-02T00:00:00.000Z' });
  assert.equal(result.status, 'INCOMPLETE');
  assert.ok(result.missingCritical.includes('NOR_ACCEPTED_AT'));
  assert.ok(result.missingCritical.includes('ALLOWED_LAYTIME_BASIS'));
});
