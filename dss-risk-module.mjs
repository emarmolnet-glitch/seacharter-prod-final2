// Lightweight standalone Zod-compatible schema builder for environment resilience
function createZod() {
  const numberValidator = () => {
    let minVal = undefined;
    let isPositive = false;
    let defaultVal = undefined;
    return {
      min(m) { minVal = m; return this; },
      positive(msg) { isPositive = true; return this; },
      default(d) { defaultVal = d; return this; },
      parseVal(val, key) {
        if (val === undefined || val === null) {
          if (defaultVal !== undefined) return { success: true, value: defaultVal };
          return { success: false, error: `${key} is required` };
        }
        const num = Number(val);
        if (Number.isNaN(num) || !Number.isFinite(num)) {
          return { success: false, error: `${key} must be a valid finite number` };
        }
        if (minVal !== undefined && num < minVal) {
          return { success: false, error: `${key} must be at least ${minVal}` };
        }
        if (isPositive && num <= 0) {
          return { success: false, error: `${key} must be greater than 0` };
        }
        return { success: true, value: num };
      }
    };
  };

  const booleanValidator = () => {
    let defaultVal = undefined;
    return {
      default(d) { defaultVal = d; return this; },
      parseVal(val) {
        if (val === undefined || val === null) {
          if (defaultVal !== undefined) return { success: true, value: defaultVal };
        }
        return { success: true, value: Boolean(val) };
      }
    };
  };

  const stringValidator = () => {
    let isNonEmpty = false;
    return {
      nonempty() { isNonEmpty = true; return this; },
      parseVal(val, key) {
        if (typeof val !== 'string' || (isNonEmpty && val.trim().length === 0)) {
          return { success: false, error: `${key} must be a non-empty string` };
        }
        return { success: true, value: val };
      }
    };
  };

  return {
    object: (shape) => ({
      safeParse: (data) => {
        const errors = [];
        const resultData = {};
        for (const [key, schema] of Object.entries(shape)) {
          const val = data ? data[key] : undefined;
          const parsed = schema.parseVal(val, key);
          if (!parsed.success) {
            errors.push({ path: [key], message: parsed.error });
          } else {
            resultData[key] = parsed.value;
          }
        }
        if (errors.length > 0) {
          return {
            success: false,
            error: {
              format: () => errors,
              issues: errors
            }
          };
        }
        return { success: true, data: resultData };
      }
    }),
    number: numberValidator,
    boolean: booleanValidator,
    string: stringValidator
  };
}

export const z = createZod();

export const defaultDSSState = {
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

export function calculateMarketFreightWithRisk(dssState, globalMarketTCE) {
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

export function handleCommitConditions(currentState, executeSafeCommit) {
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
