import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyDraught,
  parseAisEta,
  predictOpenTonnage,
} from '../open-tonnage-predictor.mjs';

const sourceHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('classifyDraught identifies ballast below sixty percent and laden above it', () => {
  assert.equal(classifyDraught(6, 12).status, 'IN_BALLAST');
  assert.equal(classifyDraught(9, 12).status, 'LADEN');
  assert.equal(classifyDraught(9, null).status, 'UNKNOWN');
});

test('parseAisEta infers the year for compact AIS month-day-hour-minute values', () => {
  const eta = parseAisEta('08151200', new Date('2026-08-11T00:00:00Z'));
  assert.equal(eta?.toISOString(), '2026-08-15T12:00:00.000Z');
});

test('ballast vessels project directly from their current position to the POL', () => {
  const projection = predictOpenTonnage({
    vessel: { draft: 5.5, verifiedDesignDraft: 10, spdBallast: 12 },
    ais: { currentDistanceToLoadPort: 1200 },
  }, {
    now: '2026-08-11T00:00:00Z',
    laycanStart: '2026-08-15',
    laycanEnd: '2026-08-20',
  });

  assert.equal(projection.commercialStatus, 'IN_BALLAST');
  assert.equal(projection.freeAt, '2026-08-11T00:00:00.000Z');
  assert.equal(projection.laycanStatus, 'WITHIN');
  assert.equal(projection.viable, true);
});

test('laden vessels add destination ETA, three operation days and ballast transit', () => {
  const projection = predictOpenTonnage({
    vessel: { draft: 9, verifiedDesignDraft: 12, spdBallast: 12 },
    ais: { eta: '2026-08-13T00:00:00Z' },
    routing: { destinationToPolDistanceNm: 1200 },
  }, {
    now: '2026-08-11T00:00:00Z',
    laycanStart: '2026-08-15',
    laycanEnd: '2026-08-21',
  });

  assert.equal(projection.commercialStatus, 'LADEN');
  assert.equal(projection.freeAt, '2026-08-16T00:00:00.000Z');
  assert.equal(projection.arrivalAtPol, '2026-08-20T04:00:00.000Z');
  assert.equal(projection.viable, true);
});

test('arrivals after cancelling are marked outside dates', () => {
  const projection = predictOpenTonnage({
    vessel: { draft: 9, verifiedDesignDraft: 12, spdBallast: 12 },
    ais: { eta: '2026-08-13T00:00:00Z' },
    routing: { destinationToPolDistanceNm: 1200 },
  }, {
    now: '2026-08-11T00:00:00Z',
    laycanStart: '2026-08-15',
    laycanEnd: '2026-08-18',
  });

  assert.equal(projection.laycanStatus, 'LATE');
  assert.equal(projection.viable, false);
});

test('matching UI exposes the Laycan segmented control, prediction labels and filtering hooks', () => {
  assert.match(sourceHtml, /id="matching-view-viable"/);
  assert.match(sourceHtml, /Viables Laycan/);
  assert.match(sourceHtml, /id="matching-view-compatible"/);
  assert.match(sourceHtml, /Flota Compatible/);
  assert.match(sourceHtml, /OpenTonnagePredictor\?\.predictOpenTonnage/);
  assert.match(sourceHtml, /data-open-tonnage-viable/);
  assert.match(sourceHtml, /Disponible \/ Viable/);
  assert.match(sourceHtml, /Fuera de fechas/);
  assert.match(sourceHtml, /applyMatchingFleetView/);
  assert.match(sourceHtml, /setActiveVessels\?\.\(displayedVessels/);
  assert.match(sourceHtml, /setActiveVessels\?\.\(\[\], \{ source: 'matching-clear' \}\)/);
  assert.match(sourceHtml, /LATE ETA/);
  assert.match(sourceHtml, /is-late-eta/);
});
