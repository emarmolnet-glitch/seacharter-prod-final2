import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const endpointSource = readFileSync(new URL('../netlify/functions/vessel-identity-batch.ts', import.meta.url), 'utf8');

function loadIdentityHelpers(source) {
  const start = source.indexOf('const VESSEL_IDENTITY_PLACEHOLDERS');
  const end = source.indexOf('window.normalizeAisVesselForRadar = function', start);
  assert.ok(start >= 0 && end > start);
  const windowMock = {};
  new Function('window', source.slice(start, end))(windowMock);
  return windowMock;
}

test('AIS identity normalization maps payload aliases without converting MMSI into IMO', () => {
  for (const source of [indexSource]) {
    const windowMock = loadIdentityHelpers(source);
    const normalized = windowMock.normalizeCommercialVesselIdentity({
      MMSI: '123456789',
      source_payload: JSON.stringify({
        MetaData: { SHIPNAME: 'PACIFIC TRADER', IMO: 'IMO 9876543' },
      }),
    });

    assert.equal(normalized.vesselName, 'PACIFIC TRADER');
    assert.equal(normalized.SHIPNAME, 'PACIFIC TRADER');
    assert.equal(normalized.imo, '9876543');
    assert.equal(normalized.IMO, '9876543');
    assert.equal(normalized.mmsi, '123456789');

    const mmsiOnly = windowMock.normalizeCommercialVesselIdentity({ MMSI: '123456789' });
    assert.equal(mmsiOnly.imo, null);
    assert.equal(mmsiOnly.IMO, null);
    assert.equal(mmsiOnly.vesselName, 'Desconocido');
  }
});

test('Due Diligence accepts IMO, MMSI, or a usable name and rejects placeholders', () => {
  const windowMock = loadIdentityHelpers(indexSource);
  assert.equal(windowMock.hasDueDiligenceIdentity({ IMO: 'IMO 9876543' }), true);
  assert.equal(windowMock.hasDueDiligenceIdentity({ MMSI: '123456789' }), true);
  assert.equal(windowMock.hasDueDiligenceIdentity({ SHIPNAME: 'ATLANTIC STAR' }), true);
  assert.equal(windowMock.hasDueDiligenceIdentity({ name: 'Desconocido' }), false);
  assert.equal(windowMock.hasDueDiligenceIdentity({ name: 'undefined', imo: '123456789' }), false);
});

test('Radar awaits one batch IMO/MMSI enrichment before strict filtering and committing vessels', () => {
  for (const source of [indexSource]) {
    const processStart = source.indexOf('async function processMatchingRadarResponse');
    const processEnd = source.indexOf('window.processMatchingRadarResponse = processMatchingRadarResponse;', processStart);
    const processSource = source.slice(processStart, processEnd);
    assert.match(processSource, /await window\.enrichMatchingVesselIdentities\(/);
    assert.ok(processSource.indexOf('await window.enrichMatchingVesselIdentities(') < processSource.indexOf('window.GlobalStore.setRadarVessels'));
    assert.match(source, /const requiresMasterEnrichment = vessel => \{[\s\S]*!Number\.isFinite\(dwt\)[\s\S]*dwt <= 0/);
    assert.match(source, /fetch\('\/api\/vessel-identity-batch',[\s\S]*body: JSON\.stringify\(\{ mmsis: pendingMmsis, imos: pendingImos \}\)/);
    assert.ok(processSource.indexOf('await window.enrichMatchingVesselIdentities(') < processSource.indexOf('applyStrictRadarTaxonomyFilter'));
    assert.match(source, /const \{ matches, taxonomyFilter \} = await processMatchingRadarResponse\(/);
  }
});

test('batch identity endpoint performs one read-only vessels_master lookup by IMO or MMSI', () => {
  assert.match(endpointSource, /Array\.from\(new Set\([\s\S]*\.slice\(0, 100\)/);
  assert.match(endpointSource, /FROM vessels_master[\s\S]*imo_number = ANY\(\$1::integer\[\]\)[\s\S]*regexp_replace\(COALESCE\(mmsi, ''\), '\\\\D', '', 'g'\) = ANY\(\$2::text\[\]\)/);
  assert.match(endpointSource, /CASE WHEN audit_status = 'VALIDATED' THEN 0 ELSE 1 END/);
  assert.match(endpointSource, /path: "\/api\/vessel-identity-batch"/);
  assert.doesNotMatch(endpointSource, /INSERT|UPDATE|DELETE FROM vessels_master/i);
});

test('Density and Matching use the shared normalized Due Diligence predicate', () => {
  for (const source of [indexSource]) {
    assert.match(source, /const hasDueDiligenceIdentity = window\.hasDueDiligenceIdentity\?\.\(v\) === true;/);
    assert.match(source, /const hasDueDiligenceIdentity = window\.hasDueDiligenceIdentity\?\.\(vessel\) === true;/);
    assert.match(source, /Sin identidad para auditar/);
  }
});
