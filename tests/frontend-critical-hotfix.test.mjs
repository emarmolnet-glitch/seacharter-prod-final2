import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Neon candidate synchronization bypasses route and radar frontend guards', () => {
  const buttonTag = source.match(/<button id="btn-run-matching"[^>]*>/)?.[0] || '';
  assert.match(buttonTag, /data-neon-candidates-available="true"/);
  assert.doesNotMatch(buttonTag, /\sdisabled(?:\s|=|>)/);
  assert.match(source, /if \(syncButton\?\.dataset\.neonCandidatesAvailable === 'true'\) \{[\s\S]*?return syncMatchingCandidatesFromNeon\(\)/);
  assert.match(source, /renderCachedMatchingResults\(candidates, \{[\s\S]*?allowPolOnly: true[\s\S]*?bypassAllFilters: true/);
  assert.match(source, /Esperando importación de candidatos/);
});

test('calculator draft starts with no committed cargo rates', () => {
  assert.match(source, /cargo: 0, cargoQuantity: 0,[^\n]*loadRate: 0, dischRate: 0, dischargeRate: 0/);
  assert.match(source, /<option value="" selected>Selecciona una categoría<\/option>/);
  assert.match(source, /<option value="" selected>Selecciona una mercancía<\/option>/);
  assert.match(source, /if \(!cargoSelectionCommitted\) \{[\s\S]*?rateInput\.value = ''[\s\S]*?window\.State\.loadRate = 0/);
  assert.match(source, /loadRate: cargoSelectionCommitted[\s\S]*?: 0,[\s\S]*?dischargeRate: cargoSelectionCommitted/);
  assert.match(source, /targetMode === 'auto'[\s\S]*?applyMethodAndProductConditions\(side\)/);
  assert.doesNotMatch(source, /\b3600\b/);
});

test('Laydays automatically derives Cancelling with a three-day commercial margin', () => {
  const helperStart = source.indexOf('function addLaycanCommercialMargin');
  const helperEnd = source.indexOf('window.addLaycanCommercialMargin', helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  const addLaycanCommercialMargin = new Function(
    'normalizeDateInputValue',
    'LAYCAN_COMMERCIAL_MARGIN_DAYS',
    `${helperSource}; return addLaycanCommercialMargin;`,
  )((value) => String(value || ''), 3);

  assert.equal(addLaycanCommercialMargin('2026-08-15'), '2026-08-18');
  assert.match(source, /cancellingInput\.dataset\.autoFromLaydays = 'true'/);
  assert.match(source, /SeaCharterStore\.set\(readRouteStateFromCalculator\(\)\)/);
  assert.match(source, /markCancellingDateManual\(id\)/);
});
