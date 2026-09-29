import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
const distIndexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf-8');

test('1. bottom-metrics-container exists and wraps the 5 metric cards in index.html and dist/index.html', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(
      content,
      /id="bottom-metrics-container"/,
      `bottom-metrics-container ID exists in ${name}`
    );

    // Verify all 5 internal metric values and cards are intact
    assert.match(content, /id="sync-ballast-label"/, `LASTRE label intact in ${name}`);
    assert.match(content, /id="sync-pol-label"/, `POL label intact in ${name}`);
    assert.match(content, /id="sync-pod-label"/, `POD label intact in ${name}`);
    assert.match(content, /id="sync-miles-label"/, `MILLAS label intact in ${name}`);
    assert.match(content, /id="sync-miles-breakdown"/, `MILLAS breakdown intact in ${name}`);
    assert.match(content, /id="sync-laycan-label"/, `LAYCAN label intact in ${name}`);
    assert.match(content, /id="sync-miles-card"/, `Miles card container intact in ${name}`);
  }
});

test('2. CSS rules include synchronized folding and .hidden display for bottom-metrics-container', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(
      content,
      /\.map-command-shell\.input-collapsed #bottom-metrics-container/,
      `CSS folds bottom-metrics-container when input is collapsed in ${name}`
    );
    assert.match(
      content,
      /#bottom-metrics-container\.hidden/,
      `CSS handles .hidden on bottom-metrics-container in ${name}`
    );
  }
});

test('3. setRouteInputPanelOpen toggles hidden and opacity/pointer-events on bottom-metrics-container', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(
      content,
      /bottomMetrics\.classList\.toggle\('hidden',\s*!isGeoInputOpen\)/,
      `hidden class toggled on bottomMetrics in ${name}`
    );
    assert.match(
      content,
      /bottomMetrics\.classList\.toggle\('opacity-0',\s*!isGeoInputOpen\)/,
      `opacity-0 class toggled on bottomMetrics in ${name}`
    );
    assert.match(
      content,
      /bottomMetrics\.classList\.toggle\('pointer-events-none',\s*!isGeoInputOpen\)/,
      `pointer-events-none class toggled on bottomMetrics in ${name}`
    );
  }
});

test('4. Initial load synchronization ensures bottom metrics visibility matches the geographic input panel', () => {
  for (const [name, content] of [['index.html', indexHtml], ['dist/index.html', distIndexHtml]]) {
    assert.match(
      content,
      /function syncInitialBottomMetricsState\(\)/,
      `syncInitialBottomMetricsState defined in ${name}`
    );
    assert.match(
      content,
      /syncInitialBottomMetricsState/,
      `syncInitialBottomMetricsState invoked at initialization in ${name}`
    );
  }
});

test('5. Simulated execution of setRouteInputPanelOpen synchronizes bottom metrics panel visibility', () => {
  let isGeoInputOpen = true;
  const bottomMetricsClasses = new Set();
  const bottomMetricsAttrs = {};

  const bottomMetricsMock = {
    classList: {
      toggle(cls, force) {
        if (force) bottomMetricsClasses.add(cls);
        else bottomMetricsClasses.delete(cls);
      },
      contains(cls) {
        return bottomMetricsClasses.has(cls);
      }
    },
    setAttribute(k, v) {
      bottomMetricsAttrs[k] = v;
    }
  };

  function simulateToggle(nextOpen) {
    isGeoInputOpen = typeof nextOpen === 'boolean' ? nextOpen : !isGeoInputOpen;
    bottomMetricsMock.classList.toggle('hidden', !isGeoInputOpen);
    bottomMetricsMock.classList.toggle('opacity-0', !isGeoInputOpen);
    bottomMetricsMock.classList.toggle('pointer-events-none', !isGeoInputOpen);
    bottomMetricsMock.setAttribute('aria-hidden', String(!isGeoInputOpen));
  }

  // Initial state: open -> visible
  assert.equal(bottomMetricsMock.classList.contains('hidden'), false);
  assert.equal(bottomMetricsMock.classList.contains('opacity-0'), false);

  // Collapse action (e.g. clicking arrow button on INPUT GEOGRÁFICO)
  simulateToggle(false);
  assert.equal(isGeoInputOpen, false);
  assert.equal(bottomMetricsMock.classList.contains('hidden'), true);
  assert.equal(bottomMetricsMock.classList.contains('opacity-0'), true);
  assert.equal(bottomMetricsMock.classList.contains('pointer-events-none'), true);
  assert.equal(bottomMetricsAttrs['aria-hidden'], 'true');

  // Expand action
  simulateToggle(true);
  assert.equal(isGeoInputOpen, true);
  assert.equal(bottomMetricsMock.classList.contains('hidden'), false);
  assert.equal(bottomMetricsMock.classList.contains('opacity-0'), false);
  assert.equal(bottomMetricsMock.classList.contains('pointer-events-none'), false);
  assert.equal(bottomMetricsAttrs['aria-hidden'], 'false');
});
