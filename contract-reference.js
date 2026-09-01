(function initializeContractReference(globalObject) {
    'use strict';

    const SESSION_KEY = 'active_contract_ref';
    const SHARED_STORAGE_KEY = 'active_core_pro_session';
    const BROADCAST_CHANNEL_NAME = 'core_bridge_sync';
    const URL_KEYS = ['ref', 'contract_ref'];

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
        try {
            globalObject.sessionStorage?.setItem(SESSION_KEY, reference);
        } catch (_error) {}
    }

    function writeSharedActiveSession(reference) {
        if (!reference) return;
        const payload = { reference, timestamp: Date.now() };
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
        const url = new URL(globalObject.location.href);
        url.searchParams.set('ref', reference);
        url.searchParams.delete('contract_ref');
        globalObject.history.replaceState(globalObject.history.state, '', `${url.pathname}${url.search}${url.hash}`);
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

    function persistReference(reference, notify = false) {
        const normalized = normalizeReference(reference);
        if (!normalized) return '';
        writeSessionReference(normalized);
        writeUrlReference(normalized);
        writeSharedActiveSession(normalized);
        if (notify && typeof globalObject.dispatchEvent === 'function' && typeof globalObject.CustomEvent === 'function') {
            globalObject.dispatchEvent(new globalObject.CustomEvent('contract-reference:changed', { detail: { reference: normalized } }));
        }
        return normalized;
    }

    function getActiveContractRef() {
        return persistReference(readUrlReference() || readSessionReference() || generateVoyageRef());
    }

    function setActiveContractRef(reference) {
        const normalized = normalizeReference(reference);
        return normalized ? persistReference(normalized, true) : getActiveContractRef();
    }

    function clearActiveSession() {
        try {
            globalObject.sessionStorage?.removeItem(SESSION_KEY);
        } catch (_error) {}
        clearSharedActiveSession();
        if (typeof globalObject.dispatchEvent === 'function' && typeof globalObject.CustomEvent === 'function') {
            globalObject.dispatchEvent(new globalObject.CustomEvent('contract-reference:cleared', { detail: { reference: '' } }));
        }
    }

    function ensureUrlReference() {
        return persistReference(getActiveContractRef());
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

    try {
        if (globalObject.location || globalObject.document) {
            getActiveContractRef();
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
