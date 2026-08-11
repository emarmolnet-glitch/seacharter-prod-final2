import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

const EMPTY_OPERATIONAL_METRICS = Object.freeze({
    totalDistanceNm: null,
    ballastDistanceNm: null,
    ladenDistanceNm: null,
    aisSpeedKnots: null,
    aisUpdatedAt: null,
});

export const trackingStore = createStore(subscribeWithSelector((set) => ({
    mode: 'free',
    contractPayload: null,
    vessel: null,
    overlayOpen: false,
    referenceValidated: false,
    validatedReference: '',
    referenceLoading: false,
    vesselLoading: false,
    error: '',
    operationalMetrics: { ...EMPTY_OPERATIONAL_METRICS },
    setMode: (mode) => set({ mode, error: '' }),
    beginReferenceSearch: () => set((state) => ({
        mode: 'contract',
        referenceLoading: true,
        error: '',
        operationalMetrics: {
            ...state.operationalMetrics,
            totalDistanceNm: null,
            ballastDistanceNm: null,
            ladenDistanceNm: null,
        },
    })),
    hydrateContract: (contractPayload) => set({
        mode: 'contract',
        contractPayload,
        referenceValidated: true,
        validatedReference: String(contractPayload?.contract?.reference || '').trim(),
        referenceLoading: false,
        error: '',
    }),
    failReferenceSearch: (error) => set((state) => ({
        mode: state.vessel ? state.mode : 'free',
        contractPayload: null,
        referenceLoading: false,
        error: String(error || ''),
    })),
    beginVesselSearch: () => set((state) => ({
        mode: state.contractPayload ? 'contract' : state.mode,
        vesselLoading: true,
        error: '',
    })),
    setVessel: (vessel) => set((state) => {
        const speedKnots = Number(vessel?.speedKnots ?? vessel?.speed ?? vessel?.speedOverGround);
        return {
            mode: state.contractPayload ? 'contract' : state.mode,
            vessel,
            vesselLoading: false,
            error: '',
            operationalMetrics: {
                ...state.operationalMetrics,
                aisSpeedKnots: Number.isFinite(speedKnots) && speedKnots > 0 ? speedKnots : state.operationalMetrics.aisSpeedKnots,
                aisUpdatedAt: vessel?.timestamp || vessel?.positionUpdatedAt || state.operationalMetrics.aisUpdatedAt,
            },
        };
    }),
    setOperationalMetrics: (metrics = {}) => set((state) => ({
        operationalMetrics: {
            ...state.operationalMetrics,
            ...metrics,
        },
    })),
    failVesselSearch: (error) => set({ vessel: null, vesselLoading: false, error: String(error || '') }),
    clearContract: () => set((state) => ({
        mode: state.vessel ? state.mode : 'free',
        contractPayload: null,
        referenceValidated: false,
        validatedReference: '',
        referenceLoading: false,
        error: '',
    })),
    setOverlayOpen: (overlayOpen) => set({ overlayOpen: overlayOpen === true }),
    resetSession: () => set((state) => ({
        mode: 'free',
        contractPayload: null,
        vessel: null,
        overlayOpen: state.overlayOpen,
        referenceLoading: false,
        vesselLoading: false,
        error: '',
        operationalMetrics: { ...EMPTY_OPERATIONAL_METRICS },
    })),
    reset: () => set({
        mode: 'free',
        contractPayload: null,
        vessel: null,
        overlayOpen: false,
        referenceValidated: false,
        validatedReference: '',
        referenceLoading: false,
        vesselLoading: false,
        error: '',
        operationalMetrics: { ...EMPTY_OPERATIONAL_METRICS },
    }),
})));

if (typeof window !== 'undefined') window.TrackingStore = trackingStore;
