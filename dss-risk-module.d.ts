import { z } from 'zod';

export interface DSSFormState {
  ballastDays: number;
  jwlaRiskActive: boolean;
  jwcRiskActive?: boolean;
  jwlaPremiumUSD: number;
  jwcPremiumUSD?: number;
  actualCargoIntake: number;
  targetCargoMT?: number;
  cargoQty?: number;
  cargo?: number;
  tons?: number;
  ladenDays?: number;
  seaDays?: number;
  estimatedVoyageDays?: number;
  totalBunkerCost?: number;
  bunkerCost?: number;
  totalPortDisbursements?: number;
  portDisbursements?: number;
  portCosts?: number;
  pol?: string;
  pod?: string;
  vesselName?: string;
  vessel?: string;
  vesselType?: string;
  freightRateUSD?: number;
  freightSell?: number;
  fleteEstimado?: number;
  fleteUnitario?: number;
  baseNetFreight?: number;
  loadRate?: number;
  dischargeRate?: number;
  portDays?: number;
  totalPortDays?: number;
  breakEven?: number;
  breakEvenUnitario?: number;
  laycanDaysLeft?: number;
  commodity?: string;
  cancellingDate?: Date | string | null;
  opex?: number;
  opexDaily?: number;
  opex_fijo_diario?: number;
  targetTCE?: number;
  tceTarget?: number;
  globalMarketTCE?: number;
  totalCommission?: number;
  commissionPct?: number;
  comisionTotal?: number;
  calculationMode?: 'cost_plus' | 'inversa_tce';
  allInRateGross?: number;
  demurrageRate?: number;
  demurrageRecomendado?: number;
}

export interface AllInFreightResult {
  netFreightRate: number;
  totalNetRate: number;
  allInRateGross: number;
  jwcRiskActive: boolean;
  jwcPremiumUSD: number;
  jwcZone: string | null;
  isExportDeficit: boolean;
  autoBallastApplied: boolean;
  effectiveBallastDays: number;
  fallbackPort: string | null;
  distanceNM: number;
  ballastCostUSD: number;
  totalSurchargesUSD: number;
  surchargesPerTon: number;
  totalCommissionPct: number;
  calculationMode: string;
  totalDaysWithBallast: number;
  safeIntake: number;
}

export declare const defaultDSSState: DSSFormState;
export declare function calculateMarketFreightWithRisk(dssState: DSSFormState, globalMarketTCE: number): number;
export declare const dssCommitSchema: z.ZodObject<any>;
export declare function handleCommitConditions(currentState: DSSFormState, executeSafeCommit?: (data: any) => void): boolean;
export declare function isExportDeficitPOD(podInput?: string | Record<string, any> | null): boolean;

export declare const jwcRiskKeywords: string[];
export declare function isJWCRiskZone(portInput?: string | Record<string, any> | null): boolean;
export declare function evaluateJWCRisk(polInput?: string | Record<string, any> | null, podInput?: string | Record<string, any> | null): {
  isRisk: boolean;
  zoneName: string | null;
  polRisk: boolean;
  podRisk: boolean;
};
export declare const FALLBACK_PORT_MATRIX: Record<string, { fallbackPort: string; distanceNM: number }>;
export declare function getFallbackPortAndDistance(podInput?: string | Record<string, any> | null): {
  fallbackPort: string;
  distanceNM: number;
  matchedKey: string;
};
export declare function calculateAutoExportDeficitBallast(
  podInput?: string | Record<string, any> | null,
  manualBallastDays?: number,
  speedOrOptions?: number | Partial<DSSFormState> | { vesselSpeed?: number; speedBallast?: number; speed?: number }
): {
  isDeficitApplied: boolean;
  isDeficitPOD: boolean;
  ballastDays: number;
  autoCalculated: boolean;
  fallbackPort: string | null;
  distanceNM: number;
  vesselSpeed?: number;
};
export declare function calculateAllInFreightGross(
  dssState?: Partial<DSSFormState>,
  options?: {
    mode?: 'cost_plus' | 'inversa_tce';
    pol?: string;
    pod?: string;
    baseNetFreight?: number;
    defaultJwcPremium?: number;
    defaultAutoBallastDays?: number;
    vesselSpeed?: number;
    opex?: number;
    cargoQty?: number;
  }
): AllInFreightResult;
