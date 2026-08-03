export const LONG_DISTANCE_TRANSIT_LABEL: string;

export function normalizePortIdentity(value: unknown): string;

export function destinationMatchesPol(
  destination: unknown,
  polName: unknown,
  compatiblePorts?: unknown[],
): boolean;

export function parseMaritimeDate(value: unknown, referenceDate?: Date): Date | null;

export type CommercialTransitEvaluation = {
  candidate: boolean;
  destinationConfirmed: boolean;
  etaWithinLaycan: boolean;
  transitFeasible: boolean;
  longDistance: boolean;
  label: string | null;
  effectiveSpeedKnots: number;
  transitHours: number | null;
  projectedEta: string | null;
  effectiveEta: string | null;
  laycanStart: string | null;
  laycanEnd: string | null;
};

export function evaluateCommercialTransitToPol(input: {
  destination?: unknown;
  polName?: unknown;
  compatiblePorts?: unknown[];
  aisEta?: unknown;
  laycanStart?: unknown;
  laycanEnd?: unknown;
  distanceNm?: unknown;
  speedKnots?: unknown;
  serviceSpeedKnots?: unknown;
  now?: Date;
  visualRadiusNm?: number;
}): CommercialTransitEvaluation;
