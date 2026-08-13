export type LiveAisBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export type NormalizedLiveAisVessel = {
  mmsi: string | null;
  imo: string | null;
  vessel_name: string;
  lat: number | null;
  lon: number | null;
  speed_sog: number | null;
  dwt: number | null;
  nav_status: unknown;
  vessel_type: string | null;
};

export function normalizeLiveAisVessel(value: unknown): NormalizedLiveAisVessel;
export function isVesselInsideBounds(vessel: NormalizedLiveAisVessel, bounds: LiveAisBounds): boolean;
export function mapAisMacroCategoryToTypes(value: string): number[];
export function isAisMacroCompatibleVessel(vessel: NormalizedLiveAisVessel, macroCategory: string): boolean;
export function fetchOpenShipsBoundingBox(options: Record<string, unknown>): Promise<NormalizedLiveAisVessel[]>;
export function fetchAisStreamBoundingBox(options: Record<string, unknown>): Promise<NormalizedLiveAisVessel[]>;
export function fetchLiveAisBoundingBox(options: Record<string, unknown>): Promise<{ provider: string; vessels: NormalizedLiveAisVessel[] }>;
