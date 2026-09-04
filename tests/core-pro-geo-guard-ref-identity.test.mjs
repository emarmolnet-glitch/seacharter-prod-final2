import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    forgetTrustedPosition,
    getLastTrustedPosition,
    isTrustworthyCoordinate,
    normalizeTrustedPosition,
    rememberTrustedPosition,
    resolveOperationsPortPosition,
    resolveSafeMapPosition,
} from '../src/geo-position-guard.mjs';

const trackingSource = await readFile(new URL('../tracking-live.js', import.meta.url), 'utf8');
const globeSource = await readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');
const loaderSource = await readFile(new URL('../src/map-cartography-loader.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const assistantEntrySource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const chatFunctionSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');

const MOSTAGANEM = { name: 'Mostaganem', lat: 35.9315, lng: 0.0894 };
const AVEIRO = { name: 'Aveiro', lat: 40.6405, lng: -8.6538 };

test('1. Null Island y el meridiano de Greenwich quedan prohibidos como posición del marcador', () => {
    assert.equal(isTrustworthyCoordinate(0, 0), false, '(0,0) es Null Island');
    assert.equal(isTrustworthyCoordinate('0', '0'), false);
    assert.equal(isTrustworthyCoordinate(51.5, 0), false, 'Canal de la Mancha / Inglaterra por longitud nula');
    assert.equal(isTrustworthyCoordinate(0, -1.2), false, 'latitud nula de relleno');
    assert.equal(isTrustworthyCoordinate(0.005, 0.004), false, 'entorno inmediato de Null Island');
    assert.equal(isTrustworthyCoordinate(null, null), false);
    assert.equal(isTrustworthyCoordinate(undefined, undefined), false);
    assert.equal(isTrustworthyCoordinate('', ''), false);
    assert.equal(isTrustworthyCoordinate(91, 181), false, 'centinelas AIS de "no disponible"');
    assert.equal(isTrustworthyCoordinate(120, 45), false, 'fuera de rango');

    assert.equal(isTrustworthyCoordinate(MOSTAGANEM.lat, MOSTAGANEM.lng), true);
    assert.equal(isTrustworthyCoordinate(AVEIRO.lat, AVEIRO.lng), true);
});

test('2. normalizeTrustedPosition descarta payloads vacíos y normaliza los válidos', () => {
    assert.equal(normalizeTrustedPosition(null), null);
    assert.equal(normalizeTrustedPosition({ lat: null, lng: null }), null);
    assert.equal(normalizeTrustedPosition({ latitude: 0, longitude: 0 }), null);
    assert.equal(normalizeTrustedPosition({ lat: 51.5, lon: null }), null);

    const normalized = normalizeTrustedPosition({ latitude: MOSTAGANEM.lat, longitude: MOSTAGANEM.lng, speed: 0 });
    assert.equal(normalized.lat, MOSTAGANEM.lat);
    assert.equal(normalized.lng, MOSTAGANEM.lng);
    assert.equal(normalized.lon, MOSTAGANEM.lng);
    assert.equal(normalized.latitude, MOSTAGANEM.lat);
    assert.equal(normalized.longitude, MOSTAGANEM.lng);
    assert.equal(normalized.speed, 0);
});

test('3. La última posición válida se retiene cuando la telemetría devuelve vessel:null', () => {
    const scope = 'test-retencion';
    forgetTrustedPosition(scope);

    const live = resolveSafeMapPosition({ scope, candidate: { lat: MOSTAGANEM.lat, lng: MOSTAGANEM.lng } });
    assert.equal(live.positionTrust, 'live');
    assert.equal(live.lat, MOSTAGANEM.lat);

    // La API externa pierde la señal AIS en puerto: vessel:null / coordenadas vacías.
    const lost = resolveSafeMapPosition({ scope, candidate: null });
    assert.equal(lost.positionTrust, 'retained');
    assert.equal(lost.positionSource, 'last_known_valid');
    assert.equal(lost.lat, MOSTAGANEM.lat);
    assert.equal(lost.lng, MOSTAGANEM.lng);

    const zeroed = resolveSafeMapPosition({ scope, candidate: { lat: 0, lng: 0 } });
    assert.equal(zeroed.lat, MOSTAGANEM.lat, 'un payload en (0,0) nunca desplaza la posición retenida');

    assert.equal(getLastTrustedPosition(scope).lat, MOSTAGANEM.lat);
    forgetTrustedPosition(scope);
    assert.equal(getLastTrustedPosition(scope), null);
});

test('4. Sin posición retenida el mapa se fija en el puerto de operaciones del dossier', () => {
    const scope = 'test-puerto';
    forgetTrustedPosition(scope);

    const dossier = { phase: 3, ports: { pol: MOSTAGANEM, pod: AVEIRO } };
    const beforeOperations = resolveSafeMapPosition({ scope, candidate: { lat: null, lng: null }, dossier });
    assert.equal(beforeOperations.positionTrust, 'port_fallback');
    assert.equal(beforeOperations.positionSource, 'operations_port:pol');
    assert.equal(beforeOperations.portName, 'Mostaganem');
    assert.equal(beforeOperations.lat, MOSTAGANEM.lat);

    const afterOperations = resolveOperationsPortPosition({ phase: 5, ports: { pol: MOSTAGANEM, pod: AVEIRO } });
    assert.equal(afterOperations.positionSource, 'operations_port:pod');
    assert.equal(afterOperations.portName, 'Aveiro');
    assert.equal(afterOperations.lat, AVEIRO.lat);

    assert.equal(resolveOperationsPortPosition({ ports: { pol: { name: 'Sin coordenadas' } } }), null);
    assert.equal(resolveSafeMapPosition({ scope, candidate: null, dossier: null }), null);
    forgetTrustedPosition(scope);
});

test('5. rememberTrustedPosition ignora coordenadas no fiables', () => {
    const scope = 'test-memoria';
    forgetTrustedPosition(scope);
    assert.equal(rememberTrustedPosition(scope, { lat: 0, lng: 0 }), null);
    assert.equal(getLastTrustedPosition(scope), null);
    const stored = rememberTrustedPosition(scope, AVEIRO, { source: 'ais_coordinator', imo: '1079620' });
    assert.equal(stored.lat, AVEIRO.lat);
    assert.equal(getLastTrustedPosition(scope).imo, '1079620');
    forgetTrustedPosition(scope);
});

test('6. tracking-live delega en el blindaje geográfico y degrada la telemetría sin vaciar el mapa', () => {
    assert.match(trackingSource, /from '\.\/src\/geo-position-guard\.mjs'/);
    assert.match(trackingSource, /function resolveTrackingPosition/);
    assert.match(trackingSource, /function getTrackingDossierPorts/);
    assert.match(trackingSource, /return normalizeTrustedPosition\(value\)/);
    assert.match(trackingSource, /isTrustworthyCoordinate\(telemetry\.latitude, telemetry\.longitude\)/);
    assert.match(trackingSource, /positionTrust: 'retained', aisSignalLost: true/);
    assert.match(trackingSource, /Última posición válida retenida/);
    assert.match(trackingSource, /Puerto de operaciones activo/);
});

test('7. La renderización cartográfica comparte la misma validación anti-teleportación', () => {
    assert.match(globeSource, /function isTrustworthyCoordinatePair/);
    assert.match(globeSource, /window\.GeoPositionGuard/);
    assert.match(globeSource, /if \(!isTrustworthyCoordinatePair\(lat, lng\)\) return null;/);
    assert.match(globeSource, /isTrustworthyCoordinatePair\(vessel\.lat, vessel\.lng\)/);
    assert.match(loaderSource, /import '\.\/geo-position-guard\.mjs';/);
});

test('8. El selector # REF actualiza el estado global y descarta la identidad anterior', () => {
    assert.match(indexSource, /src="\.\/src\/active-session-context\.mjs/);
    assert.match(indexSource, /window\.ActiveSessionContext\?\.applyActiveReference\?\.\(activeReference\)/);
    assert.match(indexSource, /window\.GlobalStore\.activeContractRef = activeReference;/);
    assert.match(indexSource, /document\.body\.dataset\.activeContractRef/);
    assert.match(trackingSource, /addEventListener\('active-session:changed'/);
    assert.match(trackingSource, /function handleActiveReferenceChange/);
});

test('9. Cada petición HTTP interna inyecta la referencia y el IMO dinámico del contrato activo', async () => {
    const sessionSource = await readFile(new URL('../src/active-session-context.mjs', import.meta.url), 'utf8');
    assert.match(sessionSource, /X-Core-Contract-Ref/);
    assert.match(sessionSource, /X-Core-Vessel-Imo/);
    assert.match(sessionSource, /function installFetchIdentityInjection/);
    assert.match(sessionSource, /ais\\\/live-position/);
    assert.match(sessionSource, /laytime-statement/);
    assert.match(sessionSource, /chat-assistant/);
    assert.match(sessionSource, /forgetTrustedPosition/);
});

test('10. El asistente recibe siempre la sesión activa como identidad autorizada', () => {
    assert.match(assistantEntrySource, /sesionActiva/);
    assert.match(assistantEntrySource, /ActiveSessionContext\?\.getActiveSession\?\.\(\)/);
    assert.match(chatFunctionSource, /contexto\.sesionActiva/);
});
