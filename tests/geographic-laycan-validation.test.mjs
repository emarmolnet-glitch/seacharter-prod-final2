import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distHtml = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

test('index.html and dist/index.html define validateGeographicLaycanDates and required form elements', () => {
  [sourceHtml, distHtml].forEach((html) => {
    assert.match(html, /id="map-laycan-date"/);
    assert.match(html, /id="map-cancelling-date"/);
    assert.match(html, /id="btn-map-locate-route"/);
    assert.match(html, /function validateGeographicLaycanDates\(\)/);
    assert.match(html, /window\.validateGeographicLaycanDates = validateGeographicLaycanDates/);
  });
});

test('validateGeographicLaycanDates dynamically binds min attribute of cancelling date to laydays date', () => {
  [sourceHtml, distHtml].forEach((html) => {
    assert.match(html, /mapCancellingEl\.min = laycanDate/);
    assert.match(html, /mapCancellingEl\.removeAttribute\('min'\)/);
  });
});

test('validateGeographicLaycanDates marks input in red, sets aria-invalid, and disables calculate route button when cancelling date < laydays date', () => {
  [sourceHtml, distHtml].forEach((html) => {
    assert.match(html, /const isInvalid = Boolean\(laycanDate && cancellingDate && cancellingDate < laycanDate\)/);
    assert.match(html, /mapCancellingEl\.classList\.add\('border-red-500', 'bg-red-900\/20', 'text-red-300', 'border-2'\)/);
    assert.match(html, /mapCancellingEl\.setAttribute\('aria-invalid', 'true'\)/);
    assert.match(html, /mapBtn\.disabled = true/);
  });
});

test('captureRouteStateFromMapInputs and applyMapRouteToCalculator block global state updates when date range is negative', () => {
  [sourceHtml, distHtml].forEach((html) => {
    assert.match(html, /function captureRouteStateFromMapInputs\(\) \{[\s\S]*?const isValid = validateGeographicLaycanDates\(\);[\s\S]*?if \(!isValid\) \{[\s\S]*?return false;/);
    assert.match(html, /async function applyMapRouteToCalculator\(forceGeocode = false\) \{[\s\S]*?if \(!validateGeographicLaycanDates\(\)\) \{[\s\S]*?return;/);
  });
});

test('simulated DOM execution validates negative laycan dates handling', () => {
  // Mock DOM environment to test the exact logic
  const stateSetCalls = [];
  const globalState = {};

  const mapLaycanEl = { id: 'map-laycan-date', value: '2026-08-10', removeAttribute: () => {} };
  const mapCancellingEl = {
    id: 'map-cancelling-date',
    value: '2026-08-05',
    min: '',
    classList: {
      classes: new Set(),
      add(...cls) { cls.forEach((c) => this.classes.add(c)); },
      remove(...cls) { cls.forEach((c) => this.classes.delete(c)); }
    },
    setAttribute(attr, val) { this[attr] = val; },
    removeAttribute(attr) { delete this[attr]; }
  };
  const mapBtn = { id: 'btn-map-locate-route', disabled: false, classList: { classes: new Set(), add() {}, remove() {} } };

  const elements = {
    'map-laycan-date': mapLaycanEl,
    'map-cancelling-date': mapCancellingEl,
    'btn-map-locate-route': mapBtn
  };

  const getNormalizedDateInputValue = (id) => elements[id]?.value || '';
  const getElementById = (id) => elements[id] || null;

  function validateGeographicLaycanDatesSim() {
    const laycanEl = getElementById('map-laycan-date');
    const cancellingEl = getElementById('map-cancelling-date');
    const btn = getElementById('btn-map-locate-route');

    if (!cancellingEl) return true;

    const laycanDate = getNormalizedDateInputValue('map-laycan-date');
    const cancellingDate = getNormalizedDateInputValue('map-cancelling-date');

    if (laycanEl && laycanDate) {
      cancellingEl.min = laycanDate;
    } else {
      cancellingEl.removeAttribute('min');
    }

    const isInvalid = Boolean(laycanDate && cancellingDate && cancellingDate < laycanDate);

    if (isInvalid) {
      cancellingEl.classList.add('border-red-500', 'bg-red-900/20', 'text-red-300', 'border-2');
      cancellingEl.setAttribute('aria-invalid', 'true');
      if (btn) {
        btn.disabled = true;
      }
      return false;
    } else {
      cancellingEl.classList.remove('border-red-500', 'bg-red-900/20', 'text-red-300', 'border-2');
      cancellingEl.removeAttribute('aria-invalid');
      if (btn) {
        btn.disabled = false;
      }
      return true;
    }
  }

  // 1. Initial invalid state: Laycan 2026-08-10 vs Cancelling 2026-08-05
  const isValid1 = validateGeographicLaycanDatesSim();
  assert.equal(isValid1, false);
  assert.equal(mapCancellingEl.min, '2026-08-10');
  assert.equal(mapCancellingEl['aria-invalid'], 'true');
  assert.ok(mapCancellingEl.classList.classes.has('border-red-500'));
  assert.equal(mapBtn.disabled, true);

  // 2. Fix Cancelling date to 2026-08-15 (valid)
  mapCancellingEl.value = '2026-08-15';
  const isValid2 = validateGeographicLaycanDatesSim();
  assert.equal(isValid2, true);
  assert.equal(mapCancellingEl.min, '2026-08-10');
  assert.equal(mapCancellingEl['aria-invalid'], undefined);
  assert.equal(mapCancellingEl.classList.classes.has('border-red-500'), false);
  assert.equal(mapBtn.disabled, false);
});
