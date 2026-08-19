import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWeatherTool, getWeatherForecast } from '../netlify/functions/_shared/weather-tooling.mjs';

const context = {
  meteorologia: {
    source: 'mock-short-term-forecast',
    mode: 'short-term',
    targetDate: '2026-08-24',
    laydays: '2026-08-24',
    cancelling: '2026-08-29',
    daysUntilLaycan: 5,
    ports: {
      pol: {
        role: 'POL',
        portName: 'Bejaia',
        temperatureC: 24,
        windKnots: 18,
        operationalStatus: 'Normal',
        condition: 'Brisa moderada',
      },
      pod: {
        role: 'POD',
        portName: 'Rotterdam',
        temperatureC: 19,
        windKnots: 23,
        operationalStatus: 'Precaución',
        condition: 'Viento fresco',
      },
    },
  },
};

test('weather tool resolves a port forecast from the injected assistant context', () => {
  const result = getWeatherForecast('Béjaïa', context);

  assert.equal(result.success, true);
  assert.equal(result.role, 'POL');
  assert.equal(result.forecast.portName, 'Bejaia');
  assert.equal(result.forecast.windKnots, 18);
  assert.equal(result.daysUntilLaycan, 5);
});

test('weather tool supports route roles and reports available ports when missing', async () => {
  const podResult = await executeWeatherTool({ name: 'getWeatherForecast', args: { portName: 'POD' } }, context);
  const missingResult = getWeatherForecast('Oran', context);

  assert.equal(podResult.success, true);
  assert.equal(podResult.forecast.portName, 'Rotterdam');
  assert.equal(missingResult.success, false);
  assert.deepEqual(missingResult.availablePorts, ['Bejaia', 'Rotterdam']);
});
