import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateCargoVesselEligibility } from '../cargo-taxonomy.mjs';

const [indexSource, filterSource, sharedSource, endpointSource, aisFilterSource, registrySource, dueDiligenceSource, dataBridgeSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessels-filter.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/_shared/verified-vessel-classes.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessels-master-classes.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/vessel-master-class-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/due-diligence-entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/databridge.html', import.meta.url), 'utf8'),
]);

const {
  applyVerifiedVesselClass,
  clearVerifiedVesselClasses,
  getVerifiedVesselClass,
  hydrateVerifiedVesselClasses,
  recordVerifiedVesselClass,
  translateAisVesselClass,
} = await import(`data:text/javascript;base64,${Buffer.from(registrySource).toString('base64')}`);

const OPENSHIPS_VESSEL = Object.freeze({
  vesselName: 'MANAS',
  imo: '9447855',
  mmsi: '273345680',
  shipType: 'Cargo',
  vesselClass: 'General Cargo Vessel',
  dwt: 12000,
  MetaData: { ShipType: 'Cargo' },
});

test('la clase verificada en Data Bridge sobrescribe la clase genérica de OpenShips', () => {
  clearVerifiedVesselClasses();
  recordVerifiedVesselClass({
    imo: '9447855',
    vesselName: 'MANAS',
    vesselClass: 'Chemical/Oil Products Tanker',
    gross_tonnage: 8_765,
    loa_meters: 139.5,
    beam_meters: 21.8,
    flag: 'Barbados',
    year_built: 2011,
    verifiedAt: '2026-08-07T10:00:00.000Z',
  });

  assert.equal(getVerifiedVesselClass({ imo: '9447855' }), 'Chemical/Oil Products Tanker');

  const overridden = applyVerifiedVesselClass(OPENSHIPS_VESSEL);
  ['vesselClass', 'vesselType', 'vessel_type', 'shipType', 'ship_type', 'ShipType', 'type'].forEach(alias => {
    assert.equal(overridden[alias], 'Chemical/Oil Products Tanker', `alias ${alias} sin sobrescribir`);
  });
  assert.equal(overridden.MetaData.ShipType, 'Chemical/Oil Products Tanker');
  assert.equal(overridden.gross_tonnage, 8_765);
  assert.equal(overridden.loa_meters, 139.5);
  assert.equal(overridden.beam_meters, 21.8);
  assert.equal(overridden.flag, 'Barbados');
  assert.equal(overridden.year_built, 2011);
  assert.equal(overridden.vesselTechnicalProfileVerified, true);
  assert.equal(overridden.vesselClassVerified, true);
  assert.equal(overridden.vesselClassSource, 'VESSELS_MASTER');
  // El objeto original del feed no se muta.
  assert.equal(OPENSHIPS_VESSEL.shipType, 'Cargo');
});

test('un buque sin registro verificado conserva la clase del feed', () => {
  clearVerifiedVesselClasses();
  const untouched = applyVerifiedVesselClass(OPENSHIPS_VESSEL);
  assert.equal(untouched.shipType, 'Cargo');
  assert.equal(untouched.vesselClassVerified, undefined);
});

test('los códigos AIS numéricos se traducen a clases legibles', () => {
  assert.equal(translateAisVesselClass('70'), 'General Cargo');
  assert.equal(translateAisVesselClass(79), 'Cargo');
  assert.equal(translateAisVesselClass('80'), 'Tanker');
  assert.equal(translateAisVesselClass(84), 'Tanker');
  assert.equal(translateAisVesselClass('Chemical/Oil Products Tanker'), 'Chemical/Oil Products Tanker');
});

test('la clase validada sobrescribe un código AIS 70', () => {
  clearVerifiedVesselClasses();
  const feedVessel = { imo: '9301234', vesselClass: '70', shipType: '70' };
  recordVerifiedVesselClass({ imo: '9301234', vessel_type: 'Chemical/Oil Products Tanker', source: 'VESSELS_MASTER' });
  const overridden = applyVerifiedVesselClass(feedVessel);
  assert.equal(overridden.vesselClass, 'Chemical/Oil Products Tanker');
  assert.equal(overridden.shipType, 'Chemical/Oil Products Tanker');
  assert.equal(overridden.vesselClassSource, 'VESSELS_MASTER');
});

test('el registro reconoce IMO anidado y alias de clase comercial', () => {
  clearVerifiedVesselClasses();
  recordVerifiedVesselClass({
    Message: { ShipStaticData: { ImoNumber: '9447855' } },
    clase_comercial: 'Chemical/Oil Products Tanker',
  });
  assert.equal(
    getVerifiedVesselClass({ Message: { ShipStaticData: { ImoNumber: 9447855 } } }),
    'Chemical/Oil Products Tanker',
  );
});

test('la hidratación consulta vessels_master una sola vez por identificador', async () => {
  clearVerifiedVesselClasses();
  const requests = [];
  const fetchImpl = async (endpoint, options) => {
    requests.push({ endpoint, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        success: true,
        classes: [{ imo: '9447855', vessel_type: 'Chemical/Oil Products Tanker', source: 'VESSELS_MASTER' }],
      }),
    };
  };

  const first = await hydrateVerifiedVesselClasses([OPENSHIPS_VESSEL], { fetchImpl });
  assert.equal(first.changed, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].endpoint, '/api/vessels-master-classes');
  assert.deepEqual(requests[0].body.imos, ['9447855']);
  assert.equal(getVerifiedVesselClass(OPENSHIPS_VESSEL), 'Chemical/Oil Products Tanker');

  const second = await hydrateVerifiedVesselClasses([OPENSHIPS_VESSEL], { fetchImpl });
  assert.equal(second.changed, false);
  assert.equal(requests.length, 1);
});

test('un fallo de red no marca el identificador como resuelto', async () => {
  clearVerifiedVesselClasses();
  let attempts = 0;
  const failingFetch = async () => {
    attempts += 1;
    throw new Error('network down');
  };
  const result = await hydrateVerifiedVesselClasses([OPENSHIPS_VESSEL], { fetchImpl: failingFetch });
  assert.equal(result.changed, false);
  await hydrateVerifiedVesselClasses([OPENSHIPS_VESSEL], { fetchImpl: failingFetch });
  assert.equal(attempts, 2);
});

test('el motor de aptitud descarta un tanker verificado en una ruta de carga seca', () => {
  clearVerifiedVesselClasses();
  const genericEligibility = evaluateCargoVesselEligibility({
    cargoTypeId: '20',
    vessel: OPENSHIPS_VESSEL,
    shipType: OPENSHIPS_VESSEL.shipType,
    dwt: 12000,
    quantity: 11000,
  });
  assert.equal(genericEligibility.eligible, true);

  recordVerifiedVesselClass({ imo: '9447855', vesselClass: 'Chemical/Oil Products Tanker' });
  const verifiedVessel = applyVerifiedVesselClass(OPENSHIPS_VESSEL);
  const verifiedEligibility = evaluateCargoVesselEligibility({
    cargoTypeId: '20',
    vessel: verifiedVessel,
    shipType: verifiedVessel.shipType,
    dwt: 12000,
    quantity: 11000,
  });
  assert.equal(verifiedEligibility.eligible, false);
  assert.match(
    verifiedEligibility.criticalReasons.join(' | '),
    /Dise[nñ]o de buque incompatible/i,
  );
});

test('el radar de Core PRO prioriza la ficha técnica verificada', () => {
  assert.match(indexSource, /src\/vessel-master-class-registry\.js/);
  assert.match(indexSource, /const verifiedProfile = window\.VesselMasterClassRegistry\?\.getVerifiedVesselClassRecord\?\.\(vessel\)/);
  assert.match(indexSource, /readDensityPositiveNumber\(verifiedProfile, \['grossTonnage', 'gross_tonnage'\]\)/);
  assert.match(indexSource, /readDensityPositiveNumber\(verifiedProfile, \['loaMeters', 'loa_meters'\]\)/);
  assert.match(indexSource, /readDensityTechnicalValue\(verifiedProfile, \['flag'\]\)/);
  assert.match(indexSource, /readDensityTechnicalValue\(verifiedProfile, \['yearBuilt', 'year_built'\]\)/);
  assert.match(indexSource, /data-vessel-class-source="VESSELS_MASTER"/);
  assert.match(indexSource, /verifiedProfile\?\.vesselClass[\s\S]*translateAisVesselClass/);
  assert.match(indexSource, /hydrateVerifiedVesselClasses\(visibleRows\)/);
  assert.match(indexSource, /window\.applyVerifiedVesselClass\(radarVessel\)/);
  assert.match(dueDiligenceSource, /recordVerifiedVesselClass\?\.\(verifiedVessel\)/);
  assert.match(dueDiligenceSource, /applyVerifiedVesselClass\?\.\(verifiedVessel\)/);
});

test('Data Bridge hidrata y renderiza las especificaciones técnicas maestras', () => {
  assert.match(dataBridgeSource, /Especificaciones Técnicas/);
  assert.match(dataBridgeSource, /hydrateDataBridgeMasterProfiles/);
  assert.match(dataBridgeSource, /gross_tonnage/);
  assert.match(dataBridgeSource, /loa_meters/);
  assert.match(dataBridgeSource, /beam_meters/);
  assert.match(dataBridgeSource, /year_built/);
});

test('los servicios de backend resuelven la clase verificada antes de puntuar', () => {
  assert.match(endpointSource, /path: "\/api\/vessels-master-classes"/);
  assert.match(endpointSource, /gross_tonnage/);
  assert.match(endpointSource, /loa_meters/);
  assert.match(endpointSource, /beam_meters/);
  assert.match(endpointSource, /year_built/);
  assert.match(endpointSource, /fecha_ultima_actualizacion AS verified_at/);
  assert.doesNotMatch(endpointSource, /\bcreated_at\b/);
  assert.match(sharedSource, /overrideVesselClassesFromMaster/);
  assert.match(aisFilterSource, /await overrideVesselClassesFromMaster\(vessels\)/);
  assert.match(aisFilterSource, /const vessels_buffer = verifiedSnapshotVessels/);
  assert.match(filterSource, /WHERE imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(filterSource, /const masterByImo = new Map/);
  assert.match(filterSource, /matchesRequestedType\(master\?\.vessel_type \|\| row\.vessel_type, vesselType\)/);
  assert.doesNotMatch(filterSource, /JOIN LATERAL/);
});
