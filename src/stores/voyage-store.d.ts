import type { StoreApi } from "zustand/vanilla";

export type VoyagePort = { name: string; lat: number | null; lng: number | null };
export type VoyageVessel = {
  name: string;
  imo: string;
  mmsi: string;
  dwt: number;
  gt: number;
  flag: string;
  yearBuilt: number;
};
export type DraftVoyage = {
  pol: VoyagePort | null;
  pod: VoyagePort | null;
  laycan: { laydays: string; cancelling: string };
  cargo: { description: string; quantityMt: number };
  ballastDistanceNm: number | null;
  lastreCoordinates: Array<[number, number]>;
  vessel: VoyageVessel | null;
  updatedAt: string | null;
  lastSource: string;
};
export type VoyageStoreState = {
  draft: DraftVoyage;
  updateFromCalculator: (state?: Record<string, unknown>) => void;
  applyTrackingAudit: (payload?: { ballastDistanceNm?: number; lastreCoordinates?: unknown[]; vessel?: Record<string, unknown> }) => void;
  clearDraft: () => void;
  hasOperationalDraft: () => boolean;
};

export function hasOperationalDraft(draft: DraftVoyage): boolean;
export const voyageStore: StoreApi<VoyageStoreState>;
export const useVoyageStore: StoreApi<VoyageStoreState>;
