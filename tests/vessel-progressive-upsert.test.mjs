import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, endpointSource, cacheSource, serviceSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-due-diligence-save.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/vessel-technical-cache.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/dueDiligenceService.js', import.meta.url), 'utf8'),
]);

test('Core PRO sends a sparse PATCH payload for progressive due diligence', () => {
  const saveStart = indexSource.indexOf('async function saveCurrentVesselToDB()');
  const saveEnd = indexSource.indexOf('let allAuditedVessels', saveStart);
  const saveSource = indexSource.slice(saveStart, saveEnd);
  assert.match(saveSource, /method: 'PATCH'/);
  assert.match(saveSource, /const payloadCandidate = \{/);
  assert.match(saveSource, /value === null \|\| value === undefined/);
  assert.match(saveSource, /isMissingVesselTechnicalValue\(value\)/);
  assert.match(saveSource, /has_scrubber: hasScrubber/);
  assert.match(saveSource, /GROSS_TONNAGE: mergedTechnicalState\.gross_tonnage/);
  assert.match(saveSource, /LOA_METERS: mergedTechnicalState\.loa_meters/);
  assert.match(saveSource, /BEAM_METERS: mergedTechnicalState\.beam_meters/);
  assert.match(saveSource, /console\.log\('Payload enviado a DB:', payload\)/);
});

test('Due Diligence modal merges the partial profile and uses canonical PATCH aliases', () => {
  assert.match(serviceSource, /function mergeNonEmptyPersistenceState/);
  assert.match(serviceSource, /export function buildDueDiligencePersistencePayload/);
  assert.match(serviceSource, /payload\.GROSS_TONNAGE = grossTonnage/);
  assert.match(serviceSource, /payload\.LOA_METERS = loaMeters/);
  assert.match(serviceSource, /payload\.BEAM_METERS = beamMeters/);
  assert.match(serviceSource, /method: 'PATCH'/);
  assert.match(serviceSource, /console\.log\('Payload enviado a DB:', payloadVessel\)/);
});

test('the master upsert preserves confirmed values when incoming fields are null', () => {
  [
    'vessel_name', 'dwt', 'vessel_type', 'draft_meters', 'flag', 'year_built',
    'gross_tonnage', 'net_tonnage', 'loa_meters', 'beam_meters',
  ].forEach(column => {
    assert.match(cacheSource, new RegExp(`${column} = COALESCE\\(EXCLUDED\\.${column}, vessels_master\\.${column}\\)`));
  });
});

test('incomplete master profiles are accepted and marked partial after consolidation', () => {
  assert.match(endpointSource, /function getTechnicalProfileCompleteness/);
  assert.match(endpointSource, /profileCompleteness\.complete \? "VALIDATED" : "PARTIAL"/);
  assert.match(endpointSource, /partial: !profileCompleteness\.complete/);
  assert.match(endpointSource, /profile_completeness: profileCompleteness/);
  assert.match(endpointSource, /source_payload = COALESCE\(source_payload, '\{\}'::jsonb\) \|\| \$4::jsonb/);
  assert.doesNotMatch(endpointSource, /Se requiere (?:DWT|GT|LOA|BEAM)/i);
});

test('N/A placeholders are normalized to null before the non-destructive upsert', () => {
  assert.match(endpointSource, /const EMPTY_TECHNICAL_VALUES = new Set/);
  assert.match(endpointSource, /EMPTY_TECHNICAL_VALUES\.has\(text\.toLowerCase\(\)\)/);
  assert.match(endpointSource, /buildSupplementalTechnicalPatch/);
});

test('backend accepts exact database column aliases from both form writers', () => {
  assert.match(endpointSource, /\["GROSS_TONNAGE", "gross_tonnage", "grossTonnage", "gt", "GT"\]/);
  assert.match(endpointSource, /"LOA_METERS",[\s\S]*"loa_meters"/);
  assert.match(endpointSource, /"BEAM_METERS",[\s\S]*"beam_meters"/);
});
