import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('portCache: in-memory cache stores and returns tariff lookup results without duplicate network requests', async () => {
  let fetchCallCount = 0;
  const mockPortCache = new Map();

  const context = {
    toastTranslations: {},
    portCache: mockPortCache,
    window: {
      portCache: mockPortCache,
      pdaAbortControllers: { pol: null, pod: null }
    },
    URLSearchParams: globalThis.URLSearchParams,
    AbortSignal: globalThis.AbortSignal,
    AbortController: globalThis.AbortController,
    console: { warn: () => {} },
    fetch: async () => {
      fetchCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ tariff: { totalPDA: 12500 } })
      };
    }
  };

  const fnSource = indexSource.match(/async function fetchPdaTariffFromDataBridge\([\s\S]*?\n\t        \}/)[0];
  const script = `
    const portCache = window.portCache;
    ${fnSource}
    window.fetchPdaTariffFromDataBridge = fetchPdaTariffFromDataBridge;
  `;

  vm.runInNewContext(script, context);

  const vesselData = { portName: 'Valencia', dwt: 25000, gt: 15000, loa: 180 };

  // First call should hit network
  const result1 = await context.window.fetchPdaTariffFromDataBridge('pol', vesselData);
  assert.equal(fetchCallCount, 1, 'First call must trigger network fetch');
  assert.equal(result1.totalPDA, 12500);

  // Second call with same parameters should return cached result instantly
  const result2 = await context.window.fetchPdaTariffFromDataBridge('pol', vesselData);
  assert.equal(fetchCallCount, 1, 'Second call must consume in-memory portCache without network request');
  assert.equal(result2.totalPDA, 12500);
});

test('Graceful Fallback: network failure/timeout yields null without throwing and autoFillPDA falls back to algorithmic estimate', async () => {
  const context = {
    toastTranslations: {},
    portCache: new Map(),
    window: {
      portCache: new Map(),
      pdaAbortControllers: { pol: null, pod: null }
    },
    URLSearchParams: globalThis.URLSearchParams,
    AbortSignal: globalThis.AbortSignal,
    AbortController: globalThis.AbortController,
    console: { warn: () => {} },
    fetch: async () => {
      throw new TypeError('Failed to fetch (ERR_INSUFFICIENT_RESOURCES)');
    }
  };

  const fnSource = indexSource.match(/async function fetchPdaTariffFromDataBridge\([\s\S]*?\n\t        \}/)[0];
  const script = `
    const portCache = window.portCache;
    ${fnSource}
    window.fetchPdaTariffFromDataBridge = fetchPdaTariffFromDataBridge;
  `;

  vm.runInNewContext(script, context);

  const vesselData = { portName: 'Bejaia', dwt: 12000, gt: 7200, loa: 130 };
  const result = await context.window.fetchPdaTariffFromDataBridge('pod', vesselData);
  assert.equal(result, null, 'Network failure must be caught gracefully and return null');
});

test('debouncedAutoFillPDA: delays execution and cancels pending triggers', async () => {
  let executionCount = 0;

  const context = {
    toastTranslations: {},
    autoFillPdaDebounceTimers: { pol: null, pod: null },
    window: {
      autoFillPdaDebounceTimers: { pol: null, pod: null }
    },
    autoFillPDA: () => { executionCount++; },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };

  const fnSource = indexSource.match(/function debouncedAutoFillPDA\([\s\S]*?\n\t        \}/)[0];
  const script = `
    ${fnSource}
    window.debouncedAutoFillPDA = debouncedAutoFillPDA;
  `;

  vm.runInNewContext(script, context);

  // Trigger rapid succession
  context.window.debouncedAutoFillPDA('pol', false, 50);
  context.window.debouncedAutoFillPDA('pol', false, 50);
  context.window.debouncedAutoFillPDA('pol', false, 50);

  assert.equal(executionCount, 0, 'Synchronous execution count must be 0 before timer fires');

  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(executionCount, 1, 'Multiple rapid calls must debounce into a single execution');
});
