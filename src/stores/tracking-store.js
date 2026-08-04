import { createStore } from 'zustand/vanilla';

export const trackingStore = createStore((set) => ({
    mode: 'idle',
    contractPayload: null,
    vessel: null,
    referenceLoading: false,
    vesselLoading: false,
    error: '',
    beginReferenceSearch: () => set({ mode: 'premium', referenceLoading: true, error: '' }),
    hydrateContract: (contractPayload) => set({
        mode: 'premium',
        contractPayload,
        referenceLoading: false,
        error: '',
    }),
    failReferenceSearch: (error) => set((state) => ({
        mode: state.vessel ? 'basic' : 'idle',
        contractPayload: null,
        referenceLoading: false,
        error: String(error || ''),
    })),
    beginVesselSearch: () => set((state) => ({
        mode: state.contractPayload ? 'premium' : 'basic',
        vesselLoading: true,
        error: '',
    })),
    setVessel: (vessel) => set((state) => ({
        mode: state.contractPayload ? 'premium' : 'basic',
        vessel,
        vesselLoading: false,
        error: '',
    })),
    failVesselSearch: (error) => set({ vessel: null, vesselLoading: false, error: String(error || '') }),
    clearContract: () => set((state) => ({
        mode: state.vessel ? 'basic' : 'idle',
        contractPayload: null,
        referenceLoading: false,
        error: '',
    })),
    reset: () => set({
        mode: 'idle',
        contractPayload: null,
        vessel: null,
        referenceLoading: false,
        vesselLoading: false,
        error: '',
    }),
}));
