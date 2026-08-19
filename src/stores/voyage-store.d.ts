import type { StoreApi } from "zustand/vanilla";

export type VoyagePort = {
  name: string;
  lat: number | null;
  lng: number | null;
  indexNo?: number | null;
  regionNo?: number | null;
  officialLabel?: string;
  countryCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  source?: "WPI";
};
export type VoyageVessel = {
  name: string;
  imo: string;
  mmsi: string;
  dwt: number;
  gt: number;
  flag: string;
  yearBuilt: number;
  latitude: number | null;
  longitude: number | null;
  speedKnots: number | null;
  positionUpdatedAt: string | null;
};
export type MaritimePortWeather = {
  role: "POL" | "POD";
  portName: string;
  temperatureC: number;
  windKnots: number;
  operationalStatus: string;
  condition: string;
};
export type MaritimeWeatherSnapshot = {
  source: string;
  mode: "short-term" | "seasonal";
  targetDate: string;
  laydays: string;
  cancelling: string;
  daysUntilLaycan: number | null;
  ports: { pol: MaritimePortWeather | null; pod: MaritimePortWeather | null };
};
export type DraftVoyage = {
  pol: VoyagePort | null;
  pod: VoyagePort | null;
  laycan: { laydays: string; cancelling: string };
  cargo: { description: string; quantityMt: number };
  loadingRate: number;
  dischargeRate: number;
  dwt: number;
  methodPOL: string;
  methodPOD: string;
  ratePOL: number;
  ratePOD: number;
  ballastDistanceNm: number | null;
  ballastDistanceSource: string;
  lastreCoordinates: Array<[number, number]>;
  weather: MaritimeWeatherSnapshot | null;
  vessel: VoyageVessel | null;
  updatedAt: string | null;
  lastSource: string;
};
export type VoyageStoreState = {
  draft: DraftVoyage;
  applyNlpScenario: (scenario?: Record<string, unknown>) => void;
  updateFromCalculator: (state?: Record<string, unknown>) => void;
  setBallastDistance: (payload?: { ballastDistanceNm?: number; source?: string }) => void;
  applyTrackingAudit: (payload?: { ballastDistanceNm?: number; lastreCoordinates?: unknown[]; vessel?: Record<string, unknown> }) => void;
  applyMatchingCandidate: (payload?: { ballastDistanceNm?: number; lastreCoordinates?: unknown[]; vessel?: Record<string, unknown> }) => void;
  applyTrackingRoute: (payload?: { distanceNm?: number; routeGeometry?: unknown; ballastDistanceNm?: number; lastreCoordinates?: unknown[] }) => void;
  setWeatherSnapshot: (weather?: MaritimeWeatherSnapshot | null) => void;
  clearDraft: () => void;
  hasOperationalDraft: () => boolean;
};

export function hasOperationalDraft(draft: DraftVoyage): boolean;
export const voyageStore: StoreApi<VoyageStoreState>;
export const useVoyageStore: StoreApi<VoyageStoreState>;
