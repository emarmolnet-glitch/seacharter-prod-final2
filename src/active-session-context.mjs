/**
 * Contexto de sesión activa de Core PRO.
 *
 * Actúa como fuente única de verdad del expediente seleccionado en el selector
 * superior (# REF) y del IMO dinámico del buque asociado a ese contrato, e
 * inyecta ambos de forma implícita en todas las peticiones HTTP internas
 * (rastreo AIS, carga de plancha y consultas al asistente incluidas) para que
 * ningún módulo pueda seguir enviando identificadores fijos u obsoletos.
 */

import { forgetTrustedPosition } from './geo-position-guard.mjs';

const REF_HEADER = 'X-Core-Contract-Ref';
const IMO_HEADER = 'X-Core-Vessel-Imo';
const TRACKING_POSITION_SCOPE = 'tracking';

const INTERNAL_API_PATTERN = /^\/(?:api|\.netlify\/functions)\//i;

/**
 * Endpoints cuya semántica es "el buque / contrato activo". Solo en ellos se
 * completan parámetros y claves de primer nivel, para no alterar los listados
 * de flota o del radar, donde un `imo` implícito reduciría el resultado.
 */
const IDENTITY_ENDPOINTS = [
    /\/ais\/live-position$/i,
    /\/ais-live-position$/i,
    /\/ais-coordinator$/i,
    /\/ais-ingest$/i,
    /\/vessel\/live-profile$/i,
    /\/vessel-live-profile$/i,
    /\/vessel-name-resolution$/i,
    /\/vessel-due-diligence(?:-save)?$/i,
    /\/vessel-speed-parameters$/i,
    /\/vessel-compatibility$/i,
    /\/voyage\/tracking(?:\/|$)/i,
    /\/voyage-tracking(?:\/|$)/i,
    /\/voyage\/laytime(?:\/|$)/i,
    /\/laytime-statement(?:\/|$)/i,
    /\/voyage\/active$/i,
    /\/voyage-active$/i,
    /\/chat-assistant$/i,
    /\/cerebro-ia$/i,
    /\/ia-reports(?:\/|$)/i,
    /\/core-pro-frozen-report(?:\/|$)/i,
];

const state = {
    reference: '',
    identity: { reference: '', imo: '', mmsi: '', vesselName: '' },
    installed: false,
};

function normalizeReference(value) {
    return String(value || '').trim().toUpperCase().replace(/^REF:\s*/i, '');
}

function normalizeImo(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length === 7 ? digits : '';
}

function normalizeMmsi(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length === 9 ? digits : '';
}

function readElementImo(...ids) {
    if (typeof document === 'undefined') return '';
    for (const id of ids) {
        const imo = normalizeImo(document.getElementById?.(id)?.value);
        if (imo) return imo;
    }
    return '';
}

/** Referencia del expediente activo, siempre leída en el momento de usarse. */
export function getActiveReference() {
    if (typeof window === 'undefined') return state.reference;
    const manager = window.ContractReference || window.ContractRefManager;
    const resolved = normalizeReference(
        manager?.getActiveContractRef?.()
        || window.getActiveContractRef?.()
        || document?.getElementById?.('quick-ref')?.value
        || state.reference,
    );
    if (resolved && resolved !== state.reference) state.reference = resolved;
    return state.reference;
}

/**
 * IMO dinámico del contrato activo. Solo se acepta la identidad registrada si
 * pertenece a la referencia vigente; en caso contrario se deduce del estado en
 * pantalla, nunca de un valor previamente cacheado de otro expediente.
 */
export function getActiveImo() {
    const reference = getActiveReference();
    if (state.identity.imo && (!state.identity.reference || state.identity.reference === reference)) {
        return state.identity.imo;
    }
    if (typeof window === 'undefined') return '';

    const trackingVessel = window.TrackingStore?.getState?.()?.vessel;
    const contractPayload = window.TrackingStore?.getState?.()?.contractPayload;
    const candidates = [
        contractPayload?.contract?.vesselImo,
        trackingVessel?.imo,
        window.GlobalStore?.activeVessel?.imo,
        window.GlobalStore?.calculatorVessel?.imo,
        window.VoyageStore?.getState?.()?.draft?.vessel?.imo,
        window.VoyageDraftStore?.getState?.()?.draft?.vessel?.imo,
    ];
    for (const candidate of candidates) {
        const imo = normalizeImo(candidate);
        if (imo) return imo;
    }
    return readElementImo('vessel-identity-imo', 'imo', 'tracking-input-vessel');
}

function getActiveMmsi() {
    const reference = getActiveReference();
    if (state.identity.mmsi && (!state.identity.reference || state.identity.reference === reference)) {
        return state.identity.mmsi;
    }
    if (typeof window === 'undefined') return '';
    return normalizeMmsi(
        window.TrackingStore?.getState?.()?.contractPayload?.contract?.vesselMmsi
        || window.TrackingStore?.getState?.()?.vessel?.mmsi
        || window.GlobalStore?.activeVessel?.mmsi,
    );
}

/** Instantánea del contexto activo utilizada por la UI y por los payloads. */
export function getActiveSession() {
    const reference = getActiveReference();
    return {
        reference,
        imo: getActiveImo(),
        mmsi: getActiveMmsi(),
        vesselName: state.identity.reference === reference ? state.identity.vesselName : '',
    };
}

/**
 * Vincula una identidad de buque a un expediente concreto. La llaman los
 * módulos que resuelven telemetría o contratos, de forma que el IMO inyectado
 * en las siguientes peticiones sea exactamente el del contrato activo.
 */
export function registerVesselIdentity({ reference = '', imo = '', mmsi = '', vesselName = '' } = {}) {
    const normalizedReference = normalizeReference(reference) || getActiveReference();
    const normalizedImo = normalizeImo(imo);
    const normalizedMmsi = normalizeMmsi(mmsi);
    if (!normalizedImo && !normalizedMmsi && !vesselName) return state.identity;
    state.identity = {
        reference: normalizedReference,
        imo: normalizedImo || (state.identity.reference === normalizedReference ? state.identity.imo : ''),
        mmsi: normalizedMmsi || (state.identity.reference === normalizedReference ? state.identity.mmsi : ''),
        vesselName: String(vesselName || '').trim()
            || (state.identity.reference === normalizedReference ? state.identity.vesselName : ''),
    };
    return state.identity;
}

/** Descarta la identidad memorizada: obligatorio al cambiar de expediente. */
export function clearVesselIdentity() {
    state.identity = { reference: '', imo: '', mmsi: '', vesselName: '' };
}

/**
 * Aplica el cambio del selector # REF al estado global y notifica al resto de
 * módulos. El IMO y la posición retenida del expediente anterior se descartan
 * para que ninguna petición o marcador arrastre datos del contrato saliente.
 */
export function applyActiveReference(value, { silent = false } = {}) {
    const reference = normalizeReference(value);
    if (!reference || reference === state.reference) {
        if (reference) state.reference = reference;
        return state.reference;
    }
    state.reference = reference;
    clearVesselIdentity();
    forgetTrustedPosition(TRACKING_POSITION_SCOPE);
    if (typeof window !== 'undefined') {
        const manager = window.ContractReference || window.ContractRefManager;
        try {
            manager?.setActiveContractRef?.(reference) || window.setActiveContractRef?.(reference);
        } catch (_error) {}
        if (!silent && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new window.CustomEvent('active-session:changed', {
                detail: { reference, imo: '' },
            }));
        }
    }
    return reference;
}

function isInternalApiRequest(url) {
    return INTERNAL_API_PATTERN.test(url.pathname);
}

function isIdentityEndpoint(url) {
    const path = url.pathname.replace(/\/+$/, '');
    return IDENTITY_ENDPOINTS.some((pattern) => pattern.test(path));
}

function resolveRequestUrl(input) {
    const base = typeof window !== 'undefined' ? window.location?.href : undefined;
    const raw = typeof input === 'string'
        ? input
        : input instanceof URL
            ? input.href
            : input?.url;
    if (!raw) return null;
    try {
        const url = new URL(raw, base || 'https://core.pro.invalid/');
        if (base) {
            const origin = new URL(base).origin;
            if (url.origin !== origin) return null;
        }
        return url;
    } catch (_error) {
        return null;
    }
}

function injectQueryIdentity(url, session) {
    // Los handlers leen la referencia como `ref` o `contractRef` segun el
    // endpoint, asi que se envian ambos alias. Nunca se sobrescribe un valor
    // que la llamada haya declarado de forma explicita.
    const hasReference = url.searchParams.has('ref')
        || url.searchParams.has('contractRef')
        || url.searchParams.has('contract_ref');
    if (session.reference && !hasReference) {
        url.searchParams.set('ref', session.reference);
        url.searchParams.set('contractRef', session.reference);
        url.searchParams.set('contract_ref', session.reference);
    }
    if (session.imo && !url.searchParams.has('imo')) {
        url.searchParams.set('imo', session.imo);
    }
    return url;
}

function toSpanishSession(session) {
    // `contexto.sesionActiva` es el contrato documentado en la instruccion de
    // sistema del asistente, que lo lee con nombres en castellano.
    return {
        referencia: session.reference,
        imo: session.imo,
        mmsi: session.mmsi,
        buque: session.vesselName,
    };
}

function injectJsonIdentity(rawBody, session, allowTopLevel) {
    if (typeof rawBody !== 'string' || !rawBody.trim().startsWith('{')) return rawBody;
    let parsed;
    try {
        parsed = JSON.parse(rawBody);
    } catch (_error) {
        return rawBody;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return rawBody;

    parsed.activeSession = { ...session, ...(parsed.activeSession || {}) };
    if (allowTopLevel) {
        if (session.reference) {
            if (!parsed.contractRef) parsed.contractRef = session.reference;
            if (!parsed.reference) parsed.reference = session.reference;
        }
        if (session.imo && !parsed.imo) parsed.imo = session.imo;
    }
    if (parsed.contexto && typeof parsed.contexto === 'object' && !Array.isArray(parsed.contexto)) {
        const declared = parsed.contexto.sesionActiva || {};
        const injected = toSpanishSession(session);
        parsed.contexto.sesionActiva = {
            referencia: declared.referencia || injected.referencia,
            imo: declared.imo || injected.imo,
            mmsi: declared.mmsi || injected.mmsi,
            buque: declared.buque || injected.buque,
        };
    }
    return JSON.stringify(parsed);
}

function injectFormDataIdentity(formData, session) {
    if (session.reference && !formData.has('contract_ref')) formData.append('contract_ref', session.reference);
    if (session.imo && !formData.has('imo')) formData.append('imo', session.imo);
    return formData;
}

/**
 * Envuelve `window.fetch` para adjuntar la referencia y el IMO activos a toda
 * petición interna: cabeceras siempre, y parámetros o claves de payload en los
 * endpoints cuyo sujeto es el contrato o el buque activo.
 */
export function installFetchIdentityInjection(target = typeof window !== 'undefined' ? window : null) {
    if (!target || typeof target.fetch !== 'function' || target.__coreProIdentityInjected) return null;
    const baseFetch = target.fetch.bind(target);

    target.fetch = function identityAwareFetch(input, init) {
        const url = resolveRequestUrl(input);
        if (!url || !isInternalApiRequest(url)) return baseFetch(input, init);

        const session = getActiveSession();
        if (!session.reference && !session.imo) return baseFetch(input, init);

        try {
            const isRequestObject = typeof Request === 'function' && input instanceof Request;
            const method = String(init?.method || (isRequestObject ? input.method : 'GET') || 'GET').toUpperCase();
            const allowTopLevel = isIdentityEndpoint(url);

            const headers = new Headers(init?.headers || (isRequestObject ? input.headers : undefined));
            if (session.reference && !headers.has(REF_HEADER)) headers.set(REF_HEADER, session.reference);
            if (session.imo && !headers.has(IMO_HEADER)) headers.set(IMO_HEADER, session.imo);

            if (allowTopLevel) injectQueryIdentity(url, session);

            const nextInit = { ...(init || {}), headers };
            const body = init?.body;
            if (typeof body === 'string') {
                nextInit.body = injectJsonIdentity(body, session, allowTopLevel);
            } else if (typeof FormData === 'function' && body instanceof FormData) {
                nextInit.body = injectFormDataIdentity(body, session);
            }

            if (isRequestObject && !init) {
                return baseFetch(new Request(url.toString(), input), { headers });
            }
            return baseFetch(url.toString(), nextInit);
        } catch (_error) {
            return baseFetch(input, init);
        }
    };
    target.__coreProIdentityInjected = true;
    state.installed = true;
    return target.fetch;
}

export const ActiveSessionContext = Object.freeze({
    IMO_HEADER,
    REF_HEADER,
    TRACKING_POSITION_SCOPE,
    applyActiveReference,
    clearVesselIdentity,
    getActiveImo,
    getActiveReference,
    getActiveSession,
    installFetchIdentityInjection,
    registerVesselIdentity,
});

if (typeof window !== 'undefined') {
    window.ActiveSessionContext = ActiveSessionContext;
    window.getActiveSessionContext = getActiveSession;

    window.addEventListener('contract-reference:changed', (event) => {
        const reference = normalizeReference(event?.detail?.reference);
        if (!reference || reference === state.reference) return;
        state.reference = reference;
        clearVesselIdentity();
        forgetTrustedPosition(TRACKING_POSITION_SCOPE);
        window.dispatchEvent(new CustomEvent('active-session:changed', { detail: { reference, imo: '' } }));
    });

    window.addEventListener('contract-reference:cleared', () => {
        state.reference = '';
        clearVesselIdentity();
        forgetTrustedPosition(TRACKING_POSITION_SCOPE);
    });

    installFetchIdentityInjection(window);
    getActiveReference();
}

export default ActiveSessionContext;
