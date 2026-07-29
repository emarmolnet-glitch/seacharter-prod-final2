import { z } from 'zod';

export interface DSSFormState {
  ballastDays: number;
  jwlaRiskActive: boolean;
  jwlaPremiumUSD: number;
  actualCargoIntake: number;
  targetCargoMT?: number;
  cargoQty?: number;
  cargo?: number;
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
  freightRateUSD?: number;
  fleteEstimado?: number;
  fleteUnitario?: number;
  loadRate?: number;
  dischargeRate?: number;
  portDays?: number;
  breakEven?: number;
  breakEvenUnitario?: number;
  laycanDaysLeft?: number;
  commodity?: string;
  cancellingDate?: Date | string | null;
}

export declare const defaultDSSState: DSSFormState;
export declare function calculateMarketFreightWithRisk(dssState: DSSFormState, globalMarketTCE: number): number;
export declare const dssCommitSchema: z.ZodObject<any>;
export declare function handleCommitConditions(currentState: DSSFormState, executeSafeCommit?: (data: any) => void): boolean;
