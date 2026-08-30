import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('marketVessels is safely declared and initialized in calculateAndDisplayAisFreight scope', () => {
  assert.match(indexHtml, /let marketVessels = Array\.isArray\(nearbyVessels\) \? nearbyVessels\.slice\(\) : \[\];/, 'initializes marketVessels with fallback array');
  assert.match(indexHtml, /window\.marketVessels = marketVessels;/, 'binds marketVessels to window for global access');
  assert.match(indexHtml, /marketCount: marketVessels\.length,/, 'consumes marketVessels.length safely in aisMarketFreightRates payload');
});

test('calculateAndDisplayAisFreight has top-level try/catch error boundary for uninterrupted execution', () => {
  assert.match(indexHtml, /function calculateAndDisplayAisFreight\(\)\s*\{\s*try\s*\{/, 'wraps function body in try block');
  assert.match(indexHtml, /catch\s*\(err\)\s*\{\s*console\.warn\('\[calculateAndDisplayAisFreight\] Advertencia en cálculo de flete AIS:', err\);\s*\}/, 'catches potential runtime errors gracefully');
});
