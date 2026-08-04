(function initializeContractReference(globalObject) {
    'use strict';

    const SESSION_KEY = 'active_contract_ref';
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

    function persistReference(reference, notify = false) {
        const normalized = normalizeReference(reference);
        if (!normalized) return '';
        writeSessionReference(normalized);
        writeUrlReference(normalized);
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

    function ensureUrlReference() {
        return persistReference(getActiveContractRef());
    }

    function createNewReference() {
        return persistReference(generateVoyageRef(), true);
    }

    const contractReferenceManager = Object.freeze({
        SESSION_KEY,
        createNewReference,
        ensureUrlReference,
        generateReference,
        generateVoyageRef,
        getActiveContractRef,
        normalizeReference,
        setActiveContractRef,
    });

    globalObject.ContractRefManager = contractReferenceManager;
    globalObject.ContractReference = contractReferenceManager;
    globalObject.getActiveContractRef = getActiveContractRef;
    globalObject.setActiveContractRef = setActiveContractRef;
    globalObject.generateVoyageRef = generateVoyageRef;
})(window);
