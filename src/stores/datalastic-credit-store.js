import { createStore } from 'zustand/vanilla';

const CREDIT_CHANNEL_NAME = 'seacharter-datalastic-credit-balance';
let creditChannel = null;

function nonNegativeNumber(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeBudget(budget, currentState) {
    const limit = nonNegativeNumber(budget?.limit, currentState.limit);
    const usedCredits = nonNegativeNumber(budget?.usedCredits, currentState.usedCredits);
    const remainingCredits = nonNegativeNumber(
        budget?.remainingCredits,
        Number.isFinite(limit) && Number.isFinite(usedCredits) ? Math.max(0, limit - usedCredits) : currentState.remainingCredits,
    );
    return {
        period: String(budget?.period || currentState.period || ''),
        limit,
        usedCredits,
        remainingCredits,
    };
}

function creditStateSnapshot(state) {
    return {
        status: state.status,
        period: state.period,
        limit: state.limit,
        usedCredits: state.usedCredits,
        remainingCredits: state.remainingCredits,
        sessionConsumedCredits: state.sessionConsumedCredits,
        cacheStatus: state.cacheStatus,
        lastRequestCost: state.lastRequestCost,
        lastUpdatedAt: state.lastUpdatedAt,
        error: state.error,
    };
}

function publishCreditState(state) {
    creditChannel?.postMessage(creditStateSnapshot(state));
}

export const datalasticCreditStore = createStore((set, get) => ({
    status: 'idle',
    period: '',
    limit: null,
    usedCredits: 0,
    remainingCredits: null,
    sessionConsumedCredits: 0,
    cacheStatus: null,
    lastRequestCost: 0,
    lastUpdatedAt: null,
    error: null,

    applyConsumptionSnapshot(snapshot = {}) {
        set((state) => ({
            ...normalizeBudget(snapshot.budget, state),
            sessionConsumedCredits: nonNegativeNumber(snapshot.consumedCredits, state.sessionConsumedCredits) ?? 0,
            status: snapshot.budget ? 'ready' : 'degraded',
            lastUpdatedAt: new Date().toISOString(),
            error: null,
        }));
        publishCreditState(get());
    },

    recordRadarSuccess(meta = {}) {
        const cacheStatus = String(meta.cacheStatus || '').toUpperCase() || null;
        const requestCost = cacheStatus === 'MISS' ? 1 : 0;
        set((state) => {
            const authoritativeBudget = meta.budget && typeof meta.budget === 'object'
                ? normalizeBudget(meta.budget, state)
                : null;
            return {
                ...(authoritativeBudget || {}),
                sessionConsumedCredits: state.sessionConsumedCredits,
                cacheStatus,
                lastRequestCost: requestCost,
                status: authoritativeBudget ? 'ready' : state.status,
                lastUpdatedAt: new Date().toISOString(),
                error: null,
            };
        });
        publishCreditState(get());
        void get().refresh();
    },

    markUnavailable(error = null) {
        set({ status: 'unavailable', error: error?.message || 'Datalastic credit balance unavailable' });
    },

    async refresh() {
        if (get().status === 'loading') return null;
        set({ status: 'loading', error: null });
        try {
            const response = await fetch('/api/credits/status', {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) throw new Error(payload.error || 'AIS consumption unavailable');
            get().applyConsumptionSnapshot(payload.data || {});
            return payload.data || {};
        } catch (error) {
            get().markUnavailable(error);
            return null;
        }
    },
}));

export function recordDatalasticRadarSuccess(meta) {
    datalasticCreditStore.getState().recordRadarSuccess(meta);
}

if (typeof window !== 'undefined') {
    if ('BroadcastChannel' in window) {
        creditChannel = new BroadcastChannel(CREDIT_CHANNEL_NAME);
        creditChannel.addEventListener('message', (event) => {
            const incoming = event.data && typeof event.data === 'object' ? event.data : null;
            if (!incoming?.lastUpdatedAt) return;
            const currentUpdatedAt = Date.parse(datalasticCreditStore.getState().lastUpdatedAt || '') || 0;
            const incomingUpdatedAt = Date.parse(incoming.lastUpdatedAt) || 0;
            if (incomingUpdatedAt <= currentUpdatedAt) return;
            datalasticCreditStore.setState(creditStateSnapshot(incoming));
        });
    }
    window.DatalasticCreditStore = {
        getState: datalasticCreditStore.getState,
        subscribe: datalasticCreditStore.subscribe,
        refresh: () => datalasticCreditStore.getState().refresh(),
        recordRadarSuccess: recordDatalasticRadarSuccess,
    };
}
