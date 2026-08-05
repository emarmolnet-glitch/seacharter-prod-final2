import test from 'node:test';
import assert from 'node:assert/strict';
import mapLoader from '../map_loader.js';

test('calculateDistanceToPort calculates correct Haversine distance in nautical miles', () => {
    // Barcelona: 41.3851, 2.1734; Genoa: 44.4056, 8.9463 (~347 NM)
    const dist = mapLoader.calculateDistanceToPort(41.3851, 2.1734, 44.4056, 8.9463);
    assert.equal(typeof dist, 'number');
    assert.ok(dist > 340 && dist < 360, `Distance should be approximately 347 NM, got ${dist}`);

    // Same point -> 0 NM
    const zeroDist = mapLoader.calculateDistanceToPort(36.14, -5.35, 36.14, -5.35);
    assert.equal(zeroDist, 0);

    // Invalid coordinates return null
    assert.equal(mapLoader.calculateDistanceToPort(null, -5.35, 36.14, -5.35), null);
    assert.equal(mapLoader.calculateDistanceToPort(36.14, 'invalid', 36.14, -5.35), null);
});

test('inferSpatialVesselStatus classifies vessels by the nearest known port', () => {
    const port = { lat: 36.14, lon: -5.35 };

    assert.equal(
        mapLoader.inferSpatialVesselStatus({ latitude: 36.15, longitude: -5.35 }, [port]),
        'En Puerto / Fondeado'
    );
    assert.equal(
        mapLoader.inferSpatialVesselStatus({ latitude: 36.25, longitude: -5.35 }, [port]),
        'En tránsito (Alta mar)'
    );
});

test('inferSpatialVesselStatus prioritizes an En ruta destination display', () => {
    const status = mapLoader.inferSpatialVesselStatus({
        latitude: 36.14,
        longitude: -5.35,
        destinationDisplay: 'En ruta (a 0 NM de Gibraltar)',
        navigational_status: 'Moored'
    }, [{ lat: 36.14, lon: -5.35 }]);

    assert.equal(status, 'Navegando');
});

test('readRealVesselSpeed preserves real zero and rejects missing speed', () => {
    assert.equal(mapLoader.readRealVesselSpeed({ PositionReport: { Sog: 0 } }), 0);
    assert.equal(mapLoader.readRealVesselSpeed({ latitude: 36.14, longitude: -5.35 }), null);
});

test('getGeofencedPortDisplay extracts reported AIS Destination and appends distance to POL', () => {
    const vessel = {
        latitude: 36.14,
        longitude: -5.35,
        destination: 'ROTTERDAM',
        lastPortOfCall: 'BARCELONA'
    };
    const routeContext = {
        polName: 'GIBRALTAR',
        polLat: 36.14,
        polLon: -5.35
    };

    const res = mapLoader.getGeofencedPortDisplay(vessel, routeContext);
    assert.equal(res.lastPortDisplay, 'BARCELONA');
    assert.equal(res.destinationDisplay, 'ROTTERDAM / A 0 NM de GIBRALTAR');
    assert.equal(vessel._geoComputed, true);
    assert.equal(vessel.distanciaPolNm, 0);
});

test('getGeofencedPortDisplay falls back to "En ruta (a [X] NM de POL)" when AIS destination is missing or N/A', () => {
    const vessel = {
        latitude: 41.3851,
        longitude: 2.1734,
        destination: 'N/A',
        lastPortOfCall: ''
    };
    const routeContext = {
        polName: 'Génova',
        polLat: 44.4056,
        polLon: 8.9463
    };

    const res = mapLoader.getGeofencedPortDisplay(vessel, routeContext);
    assert.equal(res.lastPortDisplay, 'Desconocido / En Navegación');
    assert.ok(res.destinationDisplay.startsWith('En ruta (a '), `Expected "En ruta...", got ${res.destinationDisplay}`);
    assert.ok(res.destinationDisplay.includes('NM de Génova'), `Expected "NM de Génova", got ${res.destinationDisplay}`);
});

test('getGeofencedPortDisplay uses cached results for 60 FPS performance optimization', () => {
    const vessel = {
        _geoComputed: true,
        destinationDisplay: 'VALENCIA / A 120 NM de BARCELONA',
        lastPortDisplay: 'ALICANTE',
        distanciaPolNm: 120
    };

    const res = mapLoader.getGeofencedPortDisplay(vessel, { polName: 'OTHER' });
    assert.equal(res.destinationDisplay, 'VALENCIA / A 120 NM de BARCELONA');
    assert.equal(res.lastPortDisplay, 'ALICANTE');
    assert.equal(res.distanciaPolNm, 120);
});

test('normalizeShipFields attaches geofenced port display fields during data hydration', () => {
    const rawShip = {
        vesselName: 'RODAHMAR CARRIER',
        imo: '9123456',
        mmsi: '247324000',
        latitude: 36.14,
        longitude: -5.35,
        destination: 'ALBARRACÍN',
        lastPortOfCall: 'ALGECIRAS'
    };

    const normalized = mapLoader.normalizeShipFields(rawShip);
    assert.equal(typeof normalized.destinationDisplay, 'string');
    assert.equal(typeof normalized.lastPortDisplay, 'string');
    assert.ok(normalized.lastPortDisplay.includes('ALGECIRAS') || normalized.lastPortDisplay.includes('Desconocido'));
    assert.ok(normalized.destinationDisplay.includes('ALBARRACÍN'));
});
