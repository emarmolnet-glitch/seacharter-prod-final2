(function initializeContractReference(globalObject) {
    'use strict';

    const SESSION_KEY = 'active_contract_ref';
    const SHARED_STORAGE_KEY = 'active_core_pro_session';
    const BROADCAST_CHANNEL_NAME = 'core_bridge_sync';
    const URL_KEYS = ['ref', 'contract_ref'];

    let activeCachedReference = '';
    let isInitializedOnMount = false;

    function normalizeReference(value) {
        return String(value || '').trim().toUpperCase();
    }

    function readSessionReference() {
        try {
            return normalizeReference(globalObject.sessionStorage?.getItem(SESSION_KEY));
        } catch (_error) {
            return '';
        }
    }

    function writeSessionReference(reference) {
        const normalized = normalizeReference(reference);
        if (!normalized) return;
        try {
            const current = readSessionReference();
            if (current === normalized) return;
            globalObject.sessionStorage?.setItem(SESSION_KEY, normalized);
        } catch (_error) {}
    }

    function writeSharedActiveSession(reference) {
        const normalized = normalizeReference(reference);
        if (!normalized) return;

        let existingSharedRef = '';
        try {
            const raw = globalObject.localStorage?.getItem(SHARED_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                existingSharedRef = normalizeReference(parsed?.reference);
            }
        } catch (_error) {}

        if (existingSharedRef === normalized) return;

        const payload = { reference: normalized, timestamp: Date.now() };
        try {
            globalObject.localStorage?.setItem(SHARED_STORAGE_KEY, JSON.stringify(payload));
        } catch (_error) {}
        try {
            if (typeof globalObject.BroadcastChannel === 'function') {
                const channel = new globalObject.BroadcastChannel(BROADCAST_CHANNEL_NAME);
                channel.postMessage({ type: 'active_core_pro_session', ...payload });
                channel.close?.();
            }
        } catch (_error) {}
    }

    function clearSharedActiveSession() {
        activeCachedReference = '';
        try {
            globalObject.localStorage?.removeItem(SHARED_STORAGE_KEY);
        } catch (_error) {}
        try {
            if (typeof globalObject.BroadcastChannel === 'function') {
                const channel = new globalObject.BroadcastChannel(BROADCAST_CHANNEL_NAME);
                channel.postMessage({ type: 'active_core_pro_session_cleared', reference: null, timestamp: Date.now() });
                channel.close?.();
            }
        } catch (_error) {}
    }

    function readUrlReference() {
        const params = new URLSearchParams(globalObject.location?.search || '');
        for (const key of URL_KEYS) {
            const reference = normalizeReference(params.get(key));
            if (reference) return reference;
        }
        return '';
    }

    function writeUrlReference(reference) {
        if (!globalObject.location || !globalObject.history?.replaceState) return;
        const normalized = normalizeReference(reference);
        if (!normalized) return;

        let url;
        try {
            url = new URL(globalObject.location.href);
        } catch (_error) {
            return;
        }

        const rawRef = url.searchParams.get('ref');
        const hasLegacyRef = url.searchParams.has('contract_ref');
        if (rawRef === normalized && !hasLegacyRef) {
            return;
        }

        url.searchParams.set('ref', normalized);
        url.searchParams.delete('contract_ref');
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        const currentUrl = `${globalObject.location.pathname || ''}${globalObject.location.search || ''}${globalObject.location.hash || ''}`;
        if (currentUrl !== nextUrl) {
            globalObject.history.replaceState(globalObject.history.state, '', nextUrl);
        }
    }

    function generateVoyageRef() {
        const randomValues = new Uint32Array(1);
        if (globalObject.crypto?.getRandomValues) {
            globalObject.crypto.getRandomValues(randomValues);
        } else {
            randomValues[0] = Math.floor(Math.random() * 0xFFFFFFFF);
        }
        const suffix = String(randomValues[0] % 10000).padStart(4, '0');
        return `RDM/${new Date().getFullYear()}-${suffix}`;
    }

    const generateReference = generateVoyageRef;

    function generateNextVoyageRef(currentReference = '') {
        const year = new Date().getFullYear();
        const match = normalizeReference(currentReference).match(/^RDM\/(\d{4})-(\d{4})$/);
        if (!match || Number(match[1]) !== year) return generateVoyageRef();
        const nextSequence = (Number(match[2]) + 1) % 10000;
        return `RDM/${year}-${String(nextSequence).padStart(4, '0')}`;
    }

    function getCurrentReference() {
        return activeCachedReference || readUrlReference() || readSessionReference() || '';
    }

    function persistReference(reference, notify = false) {
        const normalized = normalizeReference(reference);
        if (!normalized) return '';

        const currentRef = getCurrentReference();
        const isChanged = currentRef !== normalized;

        activeCachedReference = normalized;
        writeSessionReference(normalized);
        writeUrlReference(normalized);
        writeSharedActiveSession(normalized);

        if (notify && isChanged && typeof globalObject.dispatchEvent === 'function' && typeof globalObject.CustomEvent === 'function') {
            globalObject.dispatchEvent(new globalObject.CustomEvent('contract-reference:changed', { detail: { reference: normalized } }));
        }
        return normalized;
    }

    function getActiveContractRef() {
        const fromUrl = readUrlReference();
        if (fromUrl) {
            activeCachedReference = fromUrl;
            writeSessionReference(fromUrl);
            writeUrlReference(fromUrl);
            writeSharedActiveSession(fromUrl);
            return fromUrl;
        }
        const fromSession = readSessionReference();
        if (fromSession) {
            activeCachedReference = fromSession;
            writeUrlReference(fromSession);
            writeSharedActiveSession(fromSession);
            return fromSession;
        }
        if (activeCachedReference) return activeCachedReference;
        const generated = generateVoyageRef();
        activeCachedReference = generated;
        return persistReference(generated, false);
    }

    function setActiveContractRef(reference) {
        const normalized = normalizeReference(reference);
        if (!normalized) return getActiveContractRef();
        const currentRef = getCurrentReference();
        if (currentRef === normalized) {
            activeCachedReference = normalized;
            return normalized;
        }
        return persistReference(normalized, true);
    }

    function clearActiveSession() {
        const previousRef = activeCachedReference || readSessionReference();
        activeCachedReference = '';
        try {
            globalObject.sessionStorage?.removeItem(SESSION_KEY);
        } catch (_error) {}
        clearSharedActiveSession();
        if (previousRef && typeof globalObject.dispatchEvent === 'function' && typeof globalObject.CustomEvent === 'function') {
            globalObject.dispatchEvent(new globalObject.CustomEvent('contract-reference:cleared', { detail: { reference: '' } }));
        }
    }

    function ensureUrlReference() {
        const ref = getActiveContractRef();
        if (ref) {
            writeUrlReference(ref);
        }
        return ref;
    }

    let isInjectionLocked = false;

    function setInjectionLock(locked) {
        isInjectionLocked = Boolean(locked);
    }

    function isLocked() {
        return isInjectionLocked;
    }

    function createNewReference(force = false) {
        if (isInjectionLocked && !force) {
            return getActiveContractRef();
        }
        return persistReference(generateNextVoyageRef(getActiveContractRef()), true);
    }

    const contractReferenceManager = Object.freeze({
        SESSION_KEY,
        SHARED_STORAGE_KEY,
        BROADCAST_CHANNEL_NAME,
        clearActiveReference: clearActiveSession,
        clearActiveSession,
        clearSharedActiveSession,
        createNewReference,
        ensureUrlReference,
        generateReference,
        generateNextVoyageRef,
        generateVoyageRef,
        getActiveContractRef,
        isInjectionLocked: isLocked,
        normalizeReference,
        setActiveContractRef,
        setInjectionLock,
        writeSharedActiveSession,
    });

    globalObject.ContractRefManager = contractReferenceManager;
    globalObject.ContractReference = contractReferenceManager;
    globalObject.getActiveContractRef = getActiveContractRef;
    globalObject.setActiveContractRef = setActiveContractRef;
    globalObject.clearActiveCoreProSession = clearActiveSession;
    globalObject.generateVoyageRef = generateVoyageRef;

    function initializeOnMount() {
        if (isInitializedOnMount) return;
        isInitializedOnMount = true;
        getActiveContractRef();
    }

    try {
        if (globalObject.location || globalObject.document) {
            initializeOnMount();
        }
    } catch (_error) {}

    try {
        if (typeof globalObject.addEventListener === 'function') {
            globalObject.addEventListener('pagehide', () => {
                clearSharedActiveSession();
            });
        }
    } catch (_error) {}
})(window);
