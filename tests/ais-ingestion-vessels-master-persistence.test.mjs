import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const radarLiveSource = readFileSync(new URL('../netlify/functions/radar-live.mts', import.meta.url), 'utf8');
const vesselsMasterSyncSource = readFileSync(new URL('../db/vessels-master-sync.ts', import.meta.url), 'utf8');
const strictDryCargoSource = readFileSync(new URL('../netlify/functions/_shared/strict-dry-cargo.ts', import.meta.url), 'utf8');

test('radar-live.mts background collector filters non-commercial traffic and upserts merchant vessels into vessels_master', () => {
  assert.match(radarLiveSource, /STRICT_NOISE_RE\s*=\s*\/\\b\(fishing\|pesquero/i, 'Has strict noise exclusion regex');
  assert.match(radarLiveSource, /STRICT_CARGO_RE\s*=\s*\/\\b\(bulk\|bulker\|cargo/i, 'Has strict cargo whitelist regex');
  assert.match(radarLiveSource, /numType >= 70 && numType <= 79/, 'Validates AIS cargo range 70-79');
  assert.match(radarLiveSource, /INSERT INTO vessels_master/, 'Performs INSERT into vessels_master');
  assert.match(radarLiveSource, /ON CONFLICT \(imo_number\) DO UPDATE SET/, 'Executes UPSERT on conflict imo_number');
  assert.match(radarLiveSource, /UPDATE vessels_master SET[\s\S]*WHERE mmsi = \$6/, 'Performs update by MMSI fallback');
});

test('vessels-master-sync.ts enforces isCommercialMasterCandidate before writing to vessels_master', () => {
  assert.match(vesselsMasterSyncSource, /function isCommercialMasterCandidate\(vessel: RadarVesselMasterInput\): boolean/, 'Defines commercial candidate validator');
  assert.match(vesselsMasterSyncSource, /STRICT_MASTER_EXCLUSION_PATTERN\s*=\s*\/\\b\(fishing\|pesquero/i, 'Excludes fishing, tugs, pleasure, noise');
  assert.match(vesselsMasterSyncSource, /STRICT_MASTER_CARGO_PATTERN\s*=\s*\/\\b\(bulk carrier\|bulker/i, 'Validates commercial merchant types');
  assert.match(vesselsMasterSyncSource, /numCode >= 70 && numCode <= 79/, 'Validates AIS code 70-79');
  assert.match(vesselsMasterSyncSource, /if \(!isCommercialMasterCandidate\(row\)\) return null;/, 'Discards non-commercial rows in normalizeMasterVessel');
});

test('strict-dry-cargo.ts provides strict AIS code 70-79 and commercial text classification', () => {
  assert.match(strictDryCargoSource, /STRICT_EXCLUDED_PATTERN\s*=\s*\/\\b\(fishing\|pesquero/i, 'Excludes noise');
  assert.match(strictDryCargoSource, /STRICT_CARGO_PATTERN\s*=\s*\/\\b\(bulk carrier\|bulker/i, 'Contains dry cargo whitelist');
  assert.match(strictDryCargoSource, /code >= 70 && code <= 79/, 'Validates cargo transponder code 70-79');
});
