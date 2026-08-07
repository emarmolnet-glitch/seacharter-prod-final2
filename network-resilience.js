(function (window) {
    'use strict';

    const DEFAULT_COOLDOWN_MS = 60_000;
    const DEFAULT_FAILURE_THRESHOLD = 3;
    const guardedServices = new Map();
    const baseFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

    class CircuitOpenError extends Error {
        constructor(service, retryAfterMs) {
            super(`Circuito temporalmente abierto para ${service}.`);
            this.name = 'CircuitOpenError';
            this.code = 'CIRCUIT_OPEN';
            this.service = service;
            this.retryAfterMs = Math.max(0, Number(retryAfterMs) || 0);
        }
    }

    function normalizeService(service) {
        return String(service || 'default').trim().toLowerCase() || 'default';
    }

    function getServiceState(service) {
        const key = normalizeService(service);
        if (!guardedServices.has(key)) {
            guardedServices.set(key, {
                service: key,
                consecutiveFailures: 0,
                openedAt: 0,
                openUntil: 0,
                lastStatus: 0,
                lastSuccessAt: 0
            });
        }
        return guardedServices.get(key);
    }

    function parseRetryAfterMs(response) {
        const value = response?.headers?.get?.('retry-after');
        if (!value) return 0;
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
        const retryDate = Date.parse(value);
        return Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 0;
    }

    function openCircuit(service, options = {}) {
        const state = getServiceState(service);
        const cooldownMs = Math.max(
            DEFAULT_COOLDOWN_MS,
            Number(options.cooldownMs) || 0,
            Number(options.retryAfterMs) || 0
        );
        const now = Date.now();
        state.openedAt = now;
        state.openUntil = Math.max(state.openUntil, now + cooldownMs);
        state.lastStatus = Number(options.status) || state.lastStatus || 0;
        return state.openUntil;
    }

    function closeCircuit(service) {
        const state = getServiceState(service);
        state.consecutiveFailures = 0;
        state.openedAt = 0;
        state.openUntil = 0;
        state.lastStatus = 0;
        state.lastSuccessAt = Date.now();
    }

    function getCircuitState(service) {
        const state = getServiceState(service);
        const now = Date.now();
        return Object.freeze({
            service: state.service,
            isOpen: state.openUntil > now,
            retryAfterMs: Math.max(0, state.openUntil - now),
            consecutiveFailures: state.consecutiveFailures,
            lastStatus: state.lastStatus,
            lastSuccessAt: state.lastSuccessAt
        });
    }

    async function guardedFetch(service, input, init = {}, options = {}) {
        const state = getServiceState(service);
        const now = Date.now();
        if (state.openUntil > now) {
            throw new CircuitOpenError(state.service, state.openUntil - now);
        }

        const fetchImpl = options.fetchImpl || baseFetch;
        if (typeof fetchImpl !== 'function') throw new Error('Fetch no disponible.');

        try {
            const response = await fetchImpl(input, init);
            state.lastStatus = Number(response?.status) || 0;
            if (response?.status === 429 || response?.status === 503) {
                state.consecutiveFailures += 1;
                openCircuit(state.service, {
                    status: response.status,
                    cooldownMs: options.cooldownMs,
                    retryAfterMs: parseRetryAfterMs(response)
                });
            } else if (response?.ok) {
                closeCircuit(state.service);
            } else {
                state.consecutiveFailures += 1;
            }
            return response;
        } catch (error) {
            if (error?.code === 'CIRCUIT_OPEN' || error?.name === 'AbortError') throw error;
            state.consecutiveFailures += 1;
            const threshold = Math.max(1, Number(options.failureThreshold) || DEFAULT_FAILURE_THRESHOLD);
            if (state.consecutiveFailures >= threshold) {
                openCircuit(state.service, { cooldownMs: options.cooldownMs });
            }
            throw error;
        }
    }

    function getBackoffDelay(service, baseDelayMs, options = {}) {
        const state = getCircuitState(service);
        if (state.isOpen) return state.retryAfterMs;
        const base = Math.max(1_000, Number(baseDelayMs) || 60_000);
        const exponent = Math.max(0, state.consecutiveFailures - 1);
        const maximum = Math.max(base, Number(options.maxDelayMs) || base * 8);
        return Math.min(maximum, base * (2 ** exponent));
    }

    function readJsonCache(storage, key, maxAgeMs = Infinity) {
        if (!storage || !key) return null;
        try {
            const parsed = JSON.parse(storage.getItem(key));
            const cachedAt = Number(parsed?.cachedAt);
            if (!parsed || !Number.isFinite(cachedAt)) return null;
            if (Number.isFinite(maxAgeMs) && Date.now() - cachedAt > maxAgeMs) return null;
            return parsed.value ?? null;
        } catch (_) {
            return null;
        }
    }

    function writeJsonCache(storage, key, value) {
        if (!storage || !key) return false;
        try {
            storage.setItem(key, JSON.stringify({ cachedAt: Date.now(), value }));
            return true;
        } catch (_) {
            return false;
        }
    }

    function resolveServiceForRequest(input) {
        try {
            const requestUrl = typeof input === 'string' ? input : input?.url;
            const url = new URL(requestUrl, window.location?.href || 'https://local.invalid/');
            const path = url.pathname;
            if (/^\/api\/route\/?$/i.test(path)) return 'routing';
            if (/^\/api\/get-bunker-prices\/?$/i.test(path)) return 'bunker-prices';
            if (/^\/(?:api|\.netlify\/functions)\/databridge-/i.test(path)) return 'databridge';
            if (/^\/api\/openships\/live-status\/?$/i.test(path)) return 'openships-radar';
            if (/^\/(?:api|\.netlify\/functions)\/(?:get-vessels|vessels-filter|audit-vessels|matching-local|trigger-ais-sweep)\/?$/i.test(path)) return 'radar';
            return '';
        } catch (_) {
            return '';
        }
    }

    window.CoreNetworkGuard = Object.freeze({
        CircuitOpenError,
        fetch: guardedFetch,
        open: openCircuit,
        close: closeCircuit,
        getState: getCircuitState,
        getBackoffDelay,
        readJsonCache,
        writeJsonCache,
        resolveServiceForRequest,
        minimumCooldownMs: DEFAULT_COOLDOWN_MS
    });

    if (baseFetch && !window.__coreNetworkGuardInstalled) {
        window.fetch = function resilientFetch(input, init) {
            const service = resolveServiceForRequest(input);
            return service
                ? guardedFetch(service, input, init, { fetchImpl: baseFetch, cooldownMs: DEFAULT_COOLDOWN_MS })
                : baseFetch(input, init);
        };
        window.__coreNetworkGuardInstalled = true;
    }
}(window));
