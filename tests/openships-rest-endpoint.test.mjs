import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchOpenShipsLive } from '../netlify/functions/_shared/openships-rest.mjs';

function createFetchCapture() {
  const requests = [];
  return {
    requests,
    fetchImpl: async input => {
      requests.push(new URL(input));
      return Response.json([]);
    },
  };
}

test('OpenShips requests a regional 3000 NM box with separate coordinate parameters', async () => {
  const capture = createFetchCapture();

  await fetchOpenShipsLive({
    env: {
      OPENSHIPS_API_URL: 'https://api.openships.test/v1/?region=pol&box=-180,-90,180,90&bbox=legacy',
    },
    latitude: 40,
    longitude: 10,
    limit: 250,
    fetchImpl: capture.fetchImpl,
  });

  assert.equal(capture.requests.length, 1);
  const requestUrl = capture.requests[0];
  assert.equal(requestUrl.pathname, '/v1/external/vessels/position/box');
  assert.equal(requestUrl.searchParams.get('minLat'), '-10');
  assert.equal(requestUrl.searchParams.get('maxLat'), '90');
  assert.equal(requestUrl.searchParams.get('minLon'), '-40');
  assert.equal(requestUrl.searchParams.get('maxLon'), '60');
  assert.equal(requestUrl.searchParams.get('box'), null);
  assert.equal(requestUrl.searchParams.get('bbox'), null);
  assert.equal(requestUrl.searchParams.get('limit'), '250');
  assert.equal(requestUrl.searchParams.get('region'), 'pol');
});

test('OpenShips clamps the regional coordinates and does not duplicate the endpoint path', async () => {
  const capture = createFetchCapture();

  await fetchOpenShipsLive({
    env: {
      OPENSHIPS_API_URL: 'https://api.openships.test/v1/external/vessels/position/box',
    },
    latitude: 80,
    longitude: 170,
    fetchImpl: capture.fetchImpl,
  });

  const requestUrl = capture.requests[0];
  assert.equal(requestUrl.pathname, '/v1/external/vessels/position/box');
  assert.equal(requestUrl.searchParams.get('minLat'), '30');
  assert.equal(requestUrl.searchParams.get('maxLat'), '90');
  assert.equal(requestUrl.searchParams.get('minLon'), '120');
  assert.equal(requestUrl.searchParams.get('maxLon'), '180');
});

test('OpenShips supports a global live lookup box for identifier searches without a seed position', async () => {
  const capture = createFetchCapture();

  await fetchOpenShipsLive({
    env: { OPENSHIPS_API_URL: 'https://api.openships.test/v1' },
    latitude: 0,
    longitude: 0,
    radiusDegrees: 180,
    fetchImpl: capture.fetchImpl,
  });

  const requestUrl = capture.requests[0];
  assert.equal(requestUrl.searchParams.get('minLat'), '-90');
  assert.equal(requestUrl.searchParams.get('maxLat'), '90');
  assert.equal(requestUrl.searchParams.get('minLon'), '-180');
  assert.equal(requestUrl.searchParams.get('maxLon'), '180');
});

test('OpenShips reuses successful identical searches from the in-memory cache', async () => {
  const capture = createFetchCapture();
  const options = {
    env: { OPENSHIPS_API_URL: 'https://cache-hit.openships.test/v1' },
    latitude: 25,
    longitude: -30,
    limit: 100,
    fetchImpl: capture.fetchImpl,
  };

  const firstResult = await fetchOpenShipsLive(options);
  const secondResult = await fetchOpenShipsLive(options);

  assert.equal(capture.requests.length, 1);
  assert.strictEqual(secondResult, firstResult);
});

test('OpenShips fetches identical searches again after the one-hour cache TTL expires', async () => {
  const originalNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  const capture = createFetchCapture();
  const options = {
    env: { OPENSHIPS_API_URL: 'https://cache-expiry.openships.test/v1' },
    latitude: -12,
    longitude: 42,
    fetchImpl: capture.fetchImpl,
  };

  try {
    await fetchOpenShipsLive(options);
    now += 60 * 60 * 1000 + 1;
    await fetchOpenShipsLive(options);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(capture.requests.length, 2);
});

test('OpenShips exposes the corrected regional URL to the browser fallback after HTTP 400', async () => {
  await assert.rejects(
    fetchOpenShipsLive({
      env: { OPENSHIPS_API_URL: 'https://api.openships.test/v1' },
      latitude: 36.75,
      longitude: 5.08,
      fetchImpl: async () => Response.json({ message: 'Bad bounding box' }, { status: 400 }),
    }),
    error => {
      const fallbackUrl = new URL(error?.diagnostics?.clientFallback?.url);
      return error?.diagnostics?.httpStatus === 400
        && error?.diagnostics?.clientFallback?.allowed === true
        && fallbackUrl.searchParams.get('minLat') === '-13.25'
        && fallbackUrl.searchParams.get('maxLat') === '86.75'
        && fallbackUrl.searchParams.get('minLon') === '-44.92'
        && fallbackUrl.searchParams.get('maxLon') === '55.08'
        && fallbackUrl.searchParams.has('box') === false
        && fallbackUrl.searchParams.has('bbox') === false;
    },
  );
});
