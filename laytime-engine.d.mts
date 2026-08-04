export type LaytimeIncident = {
  id?: string;
  category?: string;
  reason?: string;
  startAt?: string;
  endAt?: string;
  countingFactor?: number;
};

export type LaytimeInput = {
  quantityMt?: number;
  rateMtDay?: number;
  allowedHours?: number | null;
  demurrageRateUsdDay?: number;
  laytimeRule?: "SHINC" | "SHEX";
  weatherPermitting?: boolean;
  onceOnDemurrage?: boolean;
  commencementDelayMinutes?: number;
  portTimeZone?: string | null;
  norAcceptedAt?: string | null;
  laytimeCommencedAt?: string | null;
  operationCompletedAt?: string | null;
  asOfAt?: string | null;
  incidents?: LaytimeIncident[];
};

export function calculateLaytime(input?: LaytimeInput): Record<string, any>;
export function durationLabel(seconds: number): string;
export const DAY_SECONDS: number;
