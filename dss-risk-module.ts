import { z } from 'zod';

export interface DSSFormState {
  ballastDays: number;         // Por defecto: 0
  jwlaRiskActive: boolean;     // Por defecto: false
  jwlaPremiumUSD: number;      // Por defecto: 0
  actualCargoIntake: number;   // Por defecto: hereda targetCargoMT (evita valores vacíos)
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

export const defaultDSSState: DSSFormState = {
  ballastDays: 0,
  jwlaRiskActive: false,
  jwlaPremiumUSD: 0,
  actualCargoIntake: 50000,
  targetCargoMT: 50000,
  cargoQty: 50000,
  ladenDays: 8,
  seaDays: 8,
  estimatedVoyageDays: 8,
  totalBunkerCost: 0,
  totalPortDisbursements: 0,
  pol: 'Rotterdam',
  pod: 'Houston',
  vesselName: 'Vessel Reference',
  freightRateUSD: 35,
  fleteEstimado: 35,
  fleteUnitario: 35,
};

export function calculateMarketFreightWithRisk(dssState: DSSFormState, globalMarketTCE: number): number {
  // 1. Sanitización de entradas (Prevención de NaN)
  const safeIntake = (dssState && Number(dssState.actualCargoIntake) > 0)
    ? Number(dssState.actualCargoIntake)
    : (Number(dssState?.targetCargoMT || dssState?.cargoQty || dssState?.cargo) || 1);
  const safeBallast = Number(dssState?.ballastDays) || 0;
  const safeJWLA = dssState?.jwlaRiskActive ? (Number(dssState?.jwlaPremiumUSD) || 0) : 0;
  
  // 2. Días totales (Navegación + Lastre estimado de salida)
  const safeLadenDays = Number(dssState?.ladenDays ?? dssState?.seaDays ?? dssState?.estimatedVoyageDays ?? 0) || 0;
  const totalBillableDays = safeLadenDays + safeBallast;

  // 3. Costes fijos operativos y puerto
  const safeBunker = Number(dssState?.totalBunkerCost ?? dssState?.bunkerCost ?? 0) || 0;
  const safePort = Number(dssState?.totalPortDisbursements ?? dssState?.portDisbursements ?? dssState?.portCosts ?? 0) || 0;
  const totalDirectCosts = safeBunker + safePort;

  // 4. Inyección de Prima JWLA sobre el cálculo TCE diario activo
  const safeMarketTCE = Number(globalMarketTCE) || 0;
  const totalVoyageCost = (totalBillableDays * safeMarketTCE) + totalDirectCosts + safeJWLA;

  return totalVoyageCost / safeIntake;
}

export const dssCommitSchema = z.object({
  ballastDays: z.number().min(0).default(0),
  jwlaRiskActive: z.boolean().default(false),
  jwlaPremiumUSD: z.number().min(0).default(0),
  actualCargoIntake: z.number().positive("El tonelaje cargado debe ser mayor a 0"),
  // Aseguramos que ninguna propiedad requerida para el PDF sea undefined
  vesselName: z.string().nonempty(),
  freightRateUSD: z.number().positive(),
});

export function handleCommitConditions(currentState: DSSFormState, executeSafeCommit?: (data: any) => void): boolean {
  const targetIntake = Number(currentState?.actualCargoIntake || currentState?.targetCargoMT || currentState?.cargoQty || currentState?.cargo) || 50000;
  const preparedState = {
    ballastDays: Number(currentState?.ballastDays) || 0,
    jwlaRiskActive: Boolean(currentState?.jwlaRiskActive),
    jwlaPremiumUSD: Number(currentState?.jwlaPremiumUSD) || 0,
    actualCargoIntake: targetIntake,
    vesselName: String(currentState?.vesselName || currentState?.vessel || 'Vessel Reference').trim(),
    freightRateUSD: Number(currentState?.freightRateUSD || currentState?.fleteEstimado || currentState?.fleteUnitario) || 35,
  };

  const result = dssCommitSchema.safeParse(preparedState);
  if (!result.success) {
    console.error("Error de validación pre-PDF:", result.error.format());
    return false;
  }
  if (executeSafeCommit) {
    executeSafeCommit(result.data);
  }
  return true;
}
