import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [widgetSource, widgetStyles, indexSource] = await Promise.all([
  readFile(new URL('../AisMarketReferenceWidget.ts', import.meta.url), 'utf8'),
  readFile(new URL('../ais-market-reference-widget.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

test('AIS market widget consumes strictly validated live engine rates', () => {
  assert.match(widgetSource, /export type AisMarketRate = number &/);
  assert.match(widgetSource, /window\.aisMarketFreightRates/);
  assert.match(widgetSource, /AIS_MARKET_RATES_UPDATED/);
  assert.match(widgetSource, /AIS_RATE_ELEMENT_IDS\.fair/);
  assert.doesNotMatch(widgetSource, /rate:\s*(?:39\.83|42\.75|50\.18)/);
  assert.match(indexSource, /fair: rateJusto,[\s\S]*?standard: rateStandard,[\s\S]*?offmarket: rateOffMarket/);
  assert.match(indexSource, /new CustomEvent\('AIS_MARKET_RATES_UPDATED'/);
});

test('AIS rate application starts from owner purchase and propagates through the central margin rule', () => {
  assert.match(widgetSource, /const OWNER_FREIGHT_INPUT_ID = 'freight-rate';/);
  assert.match(widgetSource, /const CHARTERER_FREIGHT_INPUT_ID = 'freight-sell';/);
  assert.match(widgetSource, /getElementById\(OWNER_FREIGHT_INPUT_ID\)/);
  assert.match(widgetSource, /ownerFreightInput\.value = rate\.toFixed\(2\)/);
  assert.match(widgetSource, /window\.syncChartererFreightFromOwner\(rate\)/);
  assert.match(indexSource, /function syncChartererFreightFromOwner\(ownerFreight\)/);
  assert.match(indexSource, /calcularPrecioObjetivo\(ownerRate, chartererMarginPercent\)/);
  assert.match(indexSource, /delete chartererFreightInput\.dataset\.marginSynced/);
  assert.doesNotMatch(widgetSource, /ownerFreight\s*\*\s*\(1\s*\+/);
  assert.doesNotMatch(widgetSource, /State\.(?:costBunkers|costOpex|costPda|costTotal|breakEven)\s*=/);
});

test('AIS propagation emits input and change for owner and charterer fields', () => {
  assert.match(widgetSource, /new Event\('input', \{ bubbles: true \}\)/);
  assert.match(widgetSource, /new Event\('change', \{ bubbles: true \}\)/);
  assert.match(widgetSource, /emitReactiveEvents\(ownerFreightInput\)/);
  assert.match(widgetSource, /emitReactiveEvents\(chartererFreightInput\)/);
});

test('AIS widget title is rendered as a compact horizontal header', () => {
  assert.match(widgetSource, /title\.textContent = 'Referencia de Mercado AIS';/);
  assert.match(widgetSource, /header\.append\(title, eyebrow\)/);
  assert.match(widgetStyles, /\.ais-market-reference-widget__header\s*\{[\s\S]*?display: flex;/);
  assert.match(widgetStyles, /writing-mode: horizontal-tb;/);
  assert.match(widgetStyles, /white-space: nowrap;/);
});

test('AIS widget uses the calculator card surface instead of dark stacked blocks', () => {
  assert.match(widgetStyles, /\.ais-market-reference-widget\s*\{[\s\S]*?background: #f8fafc;/);
  assert.match(widgetStyles, /\.ais-market-reference-widget__scenario\s*\{[\s\S]*?background: #ffffff;/);
  assert.match(widgetStyles, /border: 1px solid #cbd5e1;/);
  assert.doesNotMatch(widgetStyles, /linear-gradient\(145deg/);
});

test('commercial negotiation mounts the isolated AIS widget module', () => {
  assert.match(indexSource, /<script type="module" src="\.\/AisMarketReferenceWidget\.ts"><\/script>/);
  assert.match(indexSource, /<aside id="ais-market-reference-widget"><\/aside>/);
});
