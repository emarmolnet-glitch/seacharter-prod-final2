import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

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
    setMode: (mode) => set({ mode, error: '' }),
    beginReferenceSearch: () => set({ mode: 'contract', referenceLoading: true, error: '' }),
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
    setVessel: (vessel) => set((state) => ({
        mode: state.contractPayload ? 'contract' : state.mode,
        vessel,
        vesselLoading: false,
        error: '',
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
    }),
})));

if (typeof window !== 'undefined') window.TrackingStore = trackingStore;
