import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const creditEndpoint = await readFile(new URL('../netlify/functions/credits-status.mts', import.meta.url), 'utf8');
const radarEndpoint = await readFile(new URL('../netlify/functions/radar-live.mts', import.meta.url), 'utf8');
const historyEndpoint = await readFile(new URL('../netlify/functions/port-risk-history.ts', import.meta.url), 'utf8');

test('historical risk uses a unified flex toolbar with port-specific controls', () => {
  assert.match(indexSource, /\.core-pro-unified-toolbar\s*\{[\s\S]*display:\s*flex/);
  assert.match(indexSource, /core-pro-unified-toolbar__views/);
  assert.match(indexSource, /core-pro-unified-toolbar__filters/);
  assert.match(indexSource, /core-pro-unified-toolbar__actions/);
  assert.match(indexSource, /id="factor-clima"/);
  assert.match(indexSource, /id="t-fondeo"/);
  assert.match(indexSource, /id="factor-clima-pod"/);
  assert.match(indexSource, /id="t-fondeo-pod"/);
});

test('voyage time results calculate the complete POL to POD chain', () => {
  assert.match(indexSource, /const finalPolDate = new Date\(baseDate\.getTime\(\) \+ \(polRiskDays \* dayMs\)\)/);
  assert.match(indexSource, /const radarPodDate = new Date\(finalPolDate\.getTime\(\) \+ \(\(laytimePol \+ navigationDays\) \* dayMs\)\)/);
  assert.match(indexSource, /const finalPodDate = new Date\(radarPodDate\.getTime\(\) \+ \(podRiskDays \* dayMs\)\)/);
  assert.match(indexSource, /id="res-radar-pod-eta"/);
  assert.match(indexSource, /id="res-final-pod-eta"/);
});

test('Data Bridge exposes history, live radar, and credit status controllers', () => {
  assert.match(historyEndpoint, /"\/api\/risk\/history"/);
  assert.match(radarEndpoint, /path:\s*"\/api\/radar\/live"/);
  assert.match(creditEndpoint, /path:\s*"\/api\/credits\/status"/);
  assert.match(indexSource, /\/api\/radar\/live/);
  assert.match(indexSource, /\/api\/risk\/history/);
});

test('unknown DWT remains visible in the vessel result UI', () => {
  assert.match(indexSource, /hasKnownDwt \? `\$\{vesselDwt\.toLocaleString\(\)\} MT` : 'UNKNOWN'/);
  assert.match(indexSource, /DWT UNKNOWN/);
});
