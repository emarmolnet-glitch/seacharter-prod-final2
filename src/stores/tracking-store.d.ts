import type { StoreApi } from "zustand/vanilla";

export type TrackingStoreState = {
  mode: "free" | "audit" | "contract";
  contractPayload: Record<string, unknown> | null;
  vessel: Record<string, unknown> | null;
  overlayOpen: boolean;
  referenceValidated: boolean;
  validatedReference: string;
  referenceLoading: boolean;
  vesselLoading: boolean;
  error: string;
  setMode: (mode: "free" | "audit" | "contract") => void;
  beginReferenceSearch: () => void;
  hydrateContract: (contractPayload: Record<string, unknown>) => void;
  failReferenceSearch: (error: unknown) => void;
  beginVesselSearch: () => void;
  setVessel: (vessel: Record<string, unknown>) => void;
  failVesselSearch: (error: unknown) => void;
  clearContract: () => void;
  setOverlayOpen: (overlayOpen: boolean) => void;
  resetSession: () => void;
  reset: () => void;
};

export const trackingStore: StoreApi<TrackingStoreState>;
