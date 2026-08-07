import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const mapLoader = require('../map_loader.js');
const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');

test('AIS normalization prioritizes COG over HDG from nested position reports', () => {
  const vessel = mapLoader.normalizeShipFields({
    source_payload: JSON.stringify({
      Message: {
        PositionReport: { Latitude: 36.12, Longitude: -5.42, Cog: 127.5, TrueHeading: 311 },
      },
    }),
  });

  assert.equal(vessel.navigationCourse, 127.5);
  assert.equal(vessel.headingSource, 'COG');
  assert.equal(vessel.COG, 127.5);
  assert.equal(vessel.HDG, 311);
  assert.equal(vessel.hasHeading, true);
});

test('AIS normalization falls back to HDG when COG is unavailable', () => {
  const vessel = mapLoader.normalizeShipFields({
    latitude: 51.9,
    longitude: 4.4,
    COG: 360,
    HDG: 271,
  });

  assert.equal(vessel.navigationCourse, 271);
  assert.equal(vessel.headingSource, 'HDG');
  assert.equal(vessel.COG, undefined);
  assert.equal(vessel.HDG, 271);
  assert.equal(vessel.hasHeading, true);
});

test('AIS normalization preserves an explicit unknown-direction state', () => {
  const vessel = mapLoader.normalizeShipFields({
    latitude: 35.9,
    longitude: -5.3,
    COG: 'N/D',
    HDG: 511,
  });

  assert.equal(vessel.navigationCourse, undefined);
  assert.equal(vessel.headingSource, null);
  assert.equal(vessel.hasHeading, false);
});

test('3D globe renders native Three.js heading vectors without image fallbacks', () => {
  assert.match(globeSource, /const course = findValidAisDirection[\s\S]*if \(course !== null\)[\s\S]*const heading = findValidAisDirection/);
  assert.match(globeSource, /new THREE\.ConeGeometry\(VESSEL_VECTOR_RADIUS, VESSEL_VECTOR_LENGTH, VESSEL_VECTOR_SEGMENTS\)/);
  assert.match(globeSource, /headingRadians[\s\S]*Math\.cos\(headingRadians\)[\s\S]*Math\.sin\(headingRadians\)/);
  assert.match(globeSource, /new THREE\.Matrix4\(\)\.makeBasis\(side, direction, normal\)/);
  assert.match(globeSource, /\.customThreeObject\([\s\S]*\.customLayerData\(\[\]\)/);
  assert.doesNotMatch(globeSource, /\.htmlElement\(|\.htmlElementsData\(/);
  assert.doesNotMatch(globeSource, /applyVesselDecluttering|getDeclutterBucketKey|OVERLAP_BUCKET_DEGREES/);
});
