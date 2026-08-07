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
  declaredEtaFeasible: boolean;
  etaWithinLaycan: boolean;
  transitFeasible: boolean;
  projectedEtaWithinLaycan: boolean;
  projectedArrivalTooEarly: boolean;
  ecoSpeedFeasible: boolean;
  idleFeasible: boolean;
  longDistance: boolean;
  label: string | null;
  arrivalStrategy: "DIRECT" | "ECO_SPEED" | "IDLE" | null;
  effectiveSpeedKnots: number;
  requiredEcoSpeedKnots: number | null;
  idleHours: number | null;
  transitHours: number | null;
  projectedEta: string | null;
  adjustedProjectedEta: string | null;
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
