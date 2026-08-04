export type PortData = {
  unLocode?: unknown;
  unlocode?: unknown;
  locode?: unknown;
  code?: unknown;
  officialName?: unknown;
  name?: unknown;
  portName?: unknown;
  aliases?: unknown[];
};

export type MatchReason = "NEAR_POL" | "INBOUND_TO_POL";

export function normalizePortText(value: unknown): string;
export function buildPortDestinationAliases(polData?: PortData): string[];
export function normalizePortDestination(aisDestination: unknown, polData: PortData): boolean;
export function estimateBallastStatus(currentDraft: unknown, designDraft: unknown, threshold?: number): boolean;
export function estimateArrivalDate(input: {
  eta?: unknown;
  distanceNm?: unknown;
  speedKnots?: unknown;
  now?: Date;
}): Date | null;
export function isLaycanCompliant(eta: unknown, laycanStart: unknown, laycanEnd: unknown): boolean;
export function isInboundEtaCoherent(input: {
  eta?: unknown;
  distanceNm?: unknown;
  speedKnots?: unknown;
  laycanEnd?: unknown;
  now?: Date;
}): boolean;
export function classifyCandidateMatch(input: {
  distanceNm?: unknown;
  radiusNm?: unknown;
  destination?: unknown;
  polData: PortData;
  eta?: unknown;
  speedKnots?: unknown;
  laycanEnd?: unknown;
  now?: Date;
}): MatchReason | null;
export function sortCandidates<T extends {
  dwtDifference?: unknown;
  estimatedBallastStatus?: boolean;
  laycanCompliant?: boolean;
  distanceNm?: unknown;
}>(candidates: T[]): T[];
