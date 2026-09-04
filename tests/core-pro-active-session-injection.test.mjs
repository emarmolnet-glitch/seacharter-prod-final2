import assert from 'node:assert/strict';
import test from 'node:test';

// El módulo se instala sobre `window` al importarse, así que el doble de
// navegador debe existir antes de la importación dinámica.
class CustomEventStub {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
}

const listeners = new Map();
const storage = new Map();
const captured = [];

const windowStub = {
    location: { origin: 'https://core.example', href: 'https://core.example/' },
    CustomEvent: CustomEventStub,
    Headers,
    Request,
    FormData,
    URL,
    addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
    },
    dispatchEvent(event) {
        (listeners.get(event.type) || []).forEach((handler) => handler(event));
        return true;
    },
    fetch(input, init) {
        captured.push({ url: String(input), init });
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
    },
    document: { getElementById: () => null },
    sessionStorage: {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
    },
};
windowStub.window = windowStub;

globalThis.window = windowStub;
globalThis.document = windowStub.document;
globalThis.sessionStorage = windowStub.sessionStorage;
globalThis.CustomEvent = CustomEventStub;

const { applyActiveReference, getActiveSession, registerVesselIdentity } = await import('../src/active-session-context.mjs');
const { getLastTrustedPosition, rememberTrustedPosition } = await import('../src/geo-position-guard.mjs');

function lastRequest() {
    return captured[captured.length - 1];
}

function headerValue(request, name) {
    return new Headers(request.init?.headers || {}).get(name);
}

test('1. El selector # REF fija la referencia activa y su IMO dinámico', () => {
    applyActiveReference('rdm/2026-0080');
    registerVesselIdentity({
        reference: 'RDM/2026-0080',
        imo: '1079620',
        mmsi: '605123456',
        vesselName: 'MV CORE PRO',
    });

    const session = getActiveSession();
    assert.equal(session.reference, 'RDM/2026-0080');
    assert.equal(session.imo, '1079620');
    assert.equal(session.mmsi, '605123456');
    assert.equal(session.vesselName, 'MV CORE PRO');
});

test('2. Toda petición interna viaja con la referencia y el IMO en cabeceras', async () => {
    await window.fetch('/api/voyage/laytime?statement=1');
    const request = lastRequest();
    assert.equal(headerValue(request, 'X-Core-Contract-Ref'), 'RDM/2026-0080');
    assert.equal(headerValue(request, 'X-Core-Vessel-Imo'), '1079620');
});

test('3. Los endpoints cuyo sujeto es el buque activo reciben imo y referencia en la query', async () => {
    await window.fetch('/api/ais/live-position');
    const url = new URL(lastRequest().url, 'https://core.example');
    assert.equal(url.searchParams.get('imo'), '1079620');
    assert.equal(url.searchParams.get('ref'), 'RDM/2026-0080');
    assert.equal(url.searchParams.get('contractRef'), 'RDM/2026-0080');
});

test('4. Un imo explícito en la petición nunca se sobrescribe', async () => {
    await window.fetch('/api/ais/live-position?imo=9433947');
    const url = new URL(lastRequest().url, 'https://core.example');
    assert.equal(url.searchParams.get('imo'), '9433947');
});

test('5. Los listados de flota no se filtran por el buque activo', async () => {
    await window.fetch('/api/vessels?zone=med');
    const url = new URL(lastRequest().url, 'https://core.example');
    assert.equal(url.searchParams.get('imo'), null);
    assert.equal(headerValue(lastRequest(), 'X-Core-Vessel-Imo'), '1079620');
});

test('6. Las consultas al asistente llevan la sesión activa en el cuerpo', async () => {
    await window.fetch('/api/chat-assistant', {
        method: 'POST',
        body: JSON.stringify({ mensaje: '¿Dónde está el buque?', contexto: { modulo: 'TRACKING' } }),
    });
    const body = JSON.parse(lastRequest().init.body);
    assert.equal(body.activeSession.imo, '1079620');
    assert.equal(body.activeSession.reference, 'RDM/2026-0080');
    assert.equal(body.imo, '1079620');
    assert.equal(body.contractRef, 'RDM/2026-0080');
    assert.equal(body.contexto.sesionActiva.imo, '1079620');
    assert.equal(body.contexto.sesionActiva.referencia, 'RDM/2026-0080');
    assert.equal(body.contexto.sesionActiva.buque, 'MV CORE PRO');
});

test('7. Las peticiones externas quedan intactas', async () => {
    await window.fetch('https://api.datalastic.example/v0/vessel');
    assert.equal(lastRequest().url, 'https://api.datalastic.example/v0/vessel');
    assert.equal(lastRequest().init, undefined);
});

test('8. Cambiar de expediente invalida el IMO y la posición retenida del anterior', async () => {
    rememberTrustedPosition('tracking', { lat: 35.9315, lng: 0.0894 });
    assert.ok(getLastTrustedPosition('tracking'));

    applyActiveReference('RDM/2026-0081');

    const session = getActiveSession();
    assert.equal(session.reference, 'RDM/2026-0081');
    assert.equal(session.imo, '', 'el IMO obsoleto no puede sobrevivir al cambio de # REF');
    assert.equal(session.mmsi, '');
    assert.equal(session.vesselName, '');
    assert.equal(getLastTrustedPosition('tracking'), null, 'la posición del contrato anterior no puede heredarse');

    await window.fetch('/api/ais/live-position');
    const url = new URL(lastRequest().url, 'https://core.example');
    assert.equal(url.searchParams.get('ref'), 'RDM/2026-0081');
    assert.equal(url.searchParams.get('imo'), null);
    assert.equal(headerValue(lastRequest(), 'X-Core-Contract-Ref'), 'RDM/2026-0081');
});

test('9. El evento contract-reference:changed propaga el cambio al contexto global', () => {
    let announced = null;
    window.addEventListener('active-session:changed', (event) => {
        announced = event.detail;
    });
    window.dispatchEvent(new CustomEventStub('contract-reference:changed', { detail: { reference: 'RDM/2026-0082' } }));
    assert.equal(announced.reference, 'RDM/2026-0082');
    assert.equal(getActiveSession().reference, 'RDM/2026-0082');
    assert.equal(getActiveSession().imo, '');
});
