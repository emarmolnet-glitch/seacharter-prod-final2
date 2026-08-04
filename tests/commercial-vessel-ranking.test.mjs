import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildCommercialVesselRank,
  compareCommercialVesselRanks,
} from '../netlify/functions/_shared/commercial-vessel-ranking.mjs';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const aiFilterSource = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');
const matchingSources = readFileSync(new URL('../db/matching-sources.ts', import.meta.url), 'utf8');
const getVesselsSource = readFileSync(new URL('../netlify/functions/get-vessels.ts', import.meta.url), 'utf8');

test('DWT fit outranks geographic proximity', () => {
  const closeButOversized = buildCommercialVesselRank({
    vesselDwt: 60000,
    targetCargoDwt: 40000,
    laycanCompliant: true,
    transitHours: 8,
    distanceNm: 80,
  });
  const distantButEfficient = buildCommercialVesselRank({
    vesselDwt: 41000,
    targetCargoDwt: 40000,
    laycanCompliant: true,
    transitHours: 96,
    distanceNm: 1100,
  });

  assert.ok(compareCommercialVesselRanks(distantButEfficient, closeButOversized) < 0);
  assert.equal(distantButEfficient.dwtDifferenceMt, 1000);
});

test('ballast and laycan resolve exact DWT ties before distance', () => {
  const slowerNearVessel = buildCommercialVesselRank({
    vesselDwt: 40500,
    targetCargoDwt: 40000,
    estimatedBallastStatus: false,
    laycanCompliant: false,
    transitHours: 20,
    distanceNm: 100,
  });
  const viableFarVessel = buildCommercialVesselRank({
    vesselDwt: 39500,
    targetCargoDwt: 40000,
    estimatedBallastStatus: true,
    laycanCompliant: true,
    transitHours: 28,
    distanceNm: 300,
  });

  assert.equal(slowerNearVessel.dwtDifferenceMt, viableFarVessel.dwtDifferenceMt);
  assert.ok(compareCommercialVesselRanks(viableFarVessel, slowerNearVessel) < 0);
});

test('distance is only the final tie-breaker', () => {
  const near = buildCommercialVesselRank({ vesselDwt: 42000, targetCargoDwt: 40000, laycanCompliant: true, transitHours: 24, distanceNm: 200 });
  const far = buildCommercialVesselRank({ vesselDwt: 42000, targetCargoDwt: 40000, laycanCompliant: true, transitHours: 24, distanceNm: 500 });
  assert.ok(compareCommercialVesselRanks(near, far) < 0);
});

test('matching, source pagination and Radar expose the DWT commercial ranking', () => {
  assert.match(aiFilterSource, /compareCommercialVesselRanks\(a\.commercialRank, b\.commercialRank\)/);
  assert.match(matchingSources, /const dwtDifference = Math\.abs\(verifiedDwt - targetDwt\)/);
  assert.match(matchingSources, /sortCandidates\(commercialCandidates\)/);
  assert.match(getVesselsSource, /targetCargoDwt/);
  assert.match(indexSource, /Math\.abs\(dwt - target\)/);
  assert.match(indexSource, /data-commercial-dwt-rank="true"/);
  assert.match(indexSource, /data-radar-dwt-rank="true"/);
  assert.match(indexSource, /compareCommercialVesselRanks\(a\.commercialRank, b\.commercialRank\)/);
});
