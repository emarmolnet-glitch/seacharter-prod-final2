import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  destinationMatchesPol,
  evaluateCommercialTransitToPol,
  LONG_DISTANCE_TRANSIT_LABEL,
} from '../netlify/functions/_shared/ais-commercial-transit.mjs';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const getVesselsSource = readFileSync(new URL('../netlify/functions/get-vessels.ts', import.meta.url), 'utf8');

test('destination matching accepts the POL and compatible regional calls', () => {
  assert.equal(destinationMatchesPol('ES BIO / BILBAO', 'Bilbao'), true);
  assert.equal(destinationMatchesPol('ALGECIRAS', 'Cádiz', ['Algeciras', 'Huelva']), true);
  assert.equal(destinationMatchesPol('FOR ORDERS', 'Bilbao'), false);
});

test('long-distance vessel remains eligible when destination, laycan and transit are viable', () => {
  const result = evaluateCommercialTransitToPol({
    destination: 'BILBAO',
    polName: 'Bilbao',
    aisEta: '2026-08-13T08:00:00Z',
    laycanStart: '2026-08-12',
    laycanEnd: '2026-08-14',
    distanceNm: 2200,
    speedKnots: 12,
    now: new Date('2026-08-03T00:00:00Z'),
    visualRadiusNm: 1000,
  });

  assert.equal(result.candidate, true);
  assert.equal(result.longDistance, true);
  assert.equal(result.label, LONG_DISTANCE_TRANSIT_LABEL);
  assert.equal(result.transitFeasible, true);
});

test('declared ETA can validate arrival even when current-speed projection misses cancelling', () => {
  const result = evaluateCommercialTransitToPol({
    destination: 'BILBAO',
    polName: 'Bilbao',
    aisEta: '2026-08-10T08:00:00Z',
    laycanStart: '2026-08-09',
    laycanEnd: '2026-08-10',
    distanceNm: 4200,
    speedKnots: 7,
    now: new Date('2026-08-03T00:00:00Z'),
  });

  assert.equal(result.destinationConfirmed, true);
  assert.equal(result.etaWithinLaycan, true);
  assert.equal(result.transitFeasible, false);
  assert.equal(result.declaredEtaFeasible, true);
  assert.equal(result.candidate, true);
});

test('arrival after cancelling is rejected by both declared and projected ETA', () => {
  const result = evaluateCommercialTransitToPol({
    destination: 'DZBJA',
    polName: 'Bejaia',
    aisEta: '2026-08-11T08:00:00Z',
    laycanStart: '2026-08-09',
    laycanEnd: '2026-08-10',
    distanceNm: 4200,
    speedKnots: 7,
    now: new Date('2026-08-03T00:00:00Z'),
  });

  assert.equal(result.destinationConfirmed, true);
  assert.equal(result.declaredEtaFeasible, false);
  assert.equal(result.transitFeasible, false);
  assert.equal(result.candidate, false);
});

test('radar request and rendering preserve commercial transit candidates outside the visual radius', () => {
  assert.match(indexSource, /captureRadiusNm = 6500/);
  assert.match(indexSource, /matchingMode: '1'/);
  assert.match(indexSource, /laycanStart/);
  assert.match(indexSource, /LONG_DISTANCE_POL/);
  assert.match(indexSource, /Inbound to POL/);
  assert.match(getVesselsSource, /!insidePolGeofence && !insideRouteCorridor && !isCommercialTransitCandidate/);
  assert.match(getVesselsSource, /commercialTransitCandidate: isCommercialTransitCandidate/);
  assert.match(getVesselsSource, /commercialTransitScan[\s\S]*readVessels\(\)/);
});
