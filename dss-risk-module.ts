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

export function isExportDeficitPOD(podInput?: string | Record<string, any> | null): boolean {
  if (!podInput) return false;

  if (typeof podInput === 'object') {
    if (podInput.isExportDeficit === true || Boolean(podInput.isExportDeficit)) {
      return true;
    }
  }

  let podStr = '';
  if (typeof podInput === 'string') {
    podStr = podInput;
  } else if (typeof podInput === 'object') {
    podStr = podInput.name || podInput.pod || podInput.destinationPort || podInput.port || podInput.region || podInput.country || '';
  }

  if (!podStr) return false;

  const normalized = String(podStr)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (!normalized) return false;

  if (normalized.includes('exportdeficit') || normalized.includes('export_deficit') || normalized.includes('deficit_export')) {
    return true;
  }

  const deficitKeywords = [
    'senegal',
    'algeria',
    'argelia',
    'nigeria',
    'ghana',
    'angola',
    'cameroon',
    'camerun',
    'ivory coast',
    'cote d\'ivoire',
    'cote divoire',
    'costa de marfil',
    'togo',
    'benin',
    'guinea',
    'sierra leone',
    'sierra leona',
    'liberia',
    'mauritania',
    'gambia',
    'gabon',
    'congo',
    'equatorial guinea',
    'guinea ecuatorial',
    'west africa',
    'africa occidental',
    'north africa',
    'africa del norte',
    'dakar',
    'algiers',
    'argel',
    'oran',
    'bejaia',
    'skikda',
    'annaba',
    'mostaganem',
    'ghazaouet',
    'jenjen',
    'lagos',
    'apapa',
    'tin can',
    'calabar',
    'port harcourt',
    'warri',
    'onne',
    'luanda',
    'lobito',
    'namibe',
    'tema',
    'takoradi',
    'douala',
    'kribi',
    'lome',
    'cotonou',
    'abidjan',
    'san pedro',
    'conakry',
    'freetown',
    'monrovia',
    'nouakchott',
    'nouadhibou',
    'banjul',
    'owendo',
    'libreville',
    'pointe-noire',
    'pointe noire',
    'malabo',
    'bata',
    'luba',
    'matadi',
    'soyo',
    'cabinda'
  ];

  return deficitKeywords.some(keyword => normalized.includes(keyword));
}

