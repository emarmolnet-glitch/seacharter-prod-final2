import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../netlify/functions/vessel-live-profile.ts', import.meta.url), 'utf8');

test('live profile uses AISStream single-vessel filtering after resolving MMSI', () => {
  assert.match(source, /AISSTREAM_API_KEY/);
  assert.match(source, /FiltersShipMMSI: \[mmsi\]/);
  assert.match(source, /FilterMessageTypes: \["PositionReport", "ShipStaticData"\]/);
  assert.match(source, /resolveVesselFinderSnapshot\(resolvedImo\)/);
  assert.match(source, /liveMmsi = digitsOnly\(resolvedMmsi \|\| openShips\?\.mmsi \|\| ais\?\.mmsi \|\| master\?\.mmsi \|\| vesselFinderSnapshot\?\.mmsi\)/);
});

test('live profile searches nested IMO history and does not limit fallback to 24 hours', () => {
  assert.match(source, /raw_data#>>'\{MetaData,IMO\}'/);
  assert.match(source, /source_payload#>>'\{Message,ShipStaticData,ImoNumber\}'/);
  assert.doesNotMatch(source, /fetched_at >= NOW\(\) - INTERVAL '24 hours'/);
});

test('live profile always serializes the tracking vessel coordinate contract', () => {
  assert.match(source, /name: vesselName/);
  assert.match(source, /imo:/);
  assert.match(source, /destination:/);
  assert.match(source, /lat: hasPosition \? Number\(latitude\) : null/);
  assert.match(source, /lon: hasPosition \? Number\(longitude\) : null/);
  assert.match(source, /found: true/);
  assert.match(source, /VESSELFINDER_LIVE_FALLBACK/);
});
