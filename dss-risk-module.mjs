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

export function isExportDeficitPOD(podInput) {
  if (!podInput) return false;

  // Prioridad DB: Comprueba primero si el puerto contiene el flag explícito isExportDeficit === true o exportDeficit === true
  if (typeof podInput === 'object' && podInput !== null) {
    if (podInput.isExportDeficit === true || podInput.exportDeficit === true) {
      return true;
    }
  }

  // Diccionario Global por Texto: Evalúa aplicando .toUpperCase()
  let podStr = '';
  if (typeof podInput === 'string') {
    podStr = podInput;
  } else if (typeof podInput === 'object' && podInput !== null) {
    podStr = podInput.name || podInput.pod || podInput.destinationPort || podInput.port || podInput.region || podInput.country || '';
  }

  if (!podStr) return false;

  const rawUpper = String(podStr).toUpperCase().trim();
  const normalizedUpper = rawUpper
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!rawUpper && !normalizedUpper) return false;

  if (rawUpper.includes('EXPORTDEFICIT') || rawUpper.includes('EXPORT_DEFICIT') || rawUpper.includes('DEFICIT_EXPORT')) {
    return true;
  }

  const deficitKeywords = [
    // África Occidental e Insular
    "SAO TOME", "BANJUL", "SENEGAL", "NIGERIA", "ANGOLA", "GUINEA", "GABON", "CONGO",
    "COTE D'IVOIRE", "COTE DIVOIRE", "COSTA DE MARFIL", "GHANA", "CAMEROON", "CAMERUN", "MAURITANIA",
    // Norte de África
    "ALGERIA", "ARGELIA", "LIBYA", "TUNISIA",
    // África Oriental
    "KENYA", "TANZANIA", "MOZAMBIQUE", "MADAGASCAR", "DJIBOUTI", "SOMALIA",
    // Caribe, Pacífico e Islas
    "CARIBBEAN", "CARIBE", "BAHAMAS", "BARBADOS", "HAITI", "JAMAICA", "DOMINICAN REPUBLIC",
    "REPUBLICA DOMINICANA", "TRINIDAD", "FIJI", "PAPUA", "SOLOMON", "VANUATU",
    // Regiones y puertos conocidos de déficit
    "WEST AFRICA", "AFRICA OCCIDENTAL", "NORTH AFRICA", "AFRICA DEL NORTE", "EAST AFRICA", "AFRICA ORIENTAL",
    "DAKAR", "ALGIERS", "ARGEL", "ORAN", "BEJAIA", "SKIKDA", "ANNABA", "MOSTAGANEM", "GHAZAOUET", "JENJEN",
    "LAGOS", "APAPA", "TIN CAN", "CALABAR", "PORT HARCOURT", "WARRI", "ONNE",
    "LUANDA", "LOBITO", "NAMIBE", "TEMA", "TAKORADI", "DOUALA", "KRIBI", "LOME", "COTONOU",
    "ABIDJAN", "SAN PEDRO", "CONAKRY", "FREETOWN", "MONROVIA", "NOUAKCHOTT", "NOUADHIBOU",
    "OWENDO", "LIBREVILLE", "POINTE-NOIRE", "POINTE NOIRE", "MALABO", "BATA", "LUBA", "MATADI", "SOYO", "CABINDA",
    "TOGO", "BENIN", "SIERRA LEONE", "LIBERIA", "GAMBIA", "EQUATORIAL GUINEA"
  ];

  // Identificación de códigos ISO de 2 letras con delimitador de palabra
  const isoCodes2Letter = ["ST", "GM", "DZ"];
  for (const iso of isoCodes2Letter) {
    const pattern = new RegExp(`(?:^|\\b|\\s|,|\\()${iso}(?:$|\\b|\\s|,|\\))`, 'i');
    if (pattern.test(rawUpper) || pattern.test(normalizedUpper)) {
      return true;
    }
  }

  return deficitKeywords.some(keyword => rawUpper.includes(keyword) || normalizedUpper.includes(keyword));
}

export const jwcRiskKeywords = [
  "RED SEA", "MAR ROJO", "BLACK SEA", "MAR NEGRO", "PERSIAN GULF", "GOLFO PERSICO",
  "YEMEN", "UKRAINE", "UCRANIA", "RUSSIA", "RUSIA", "ISRAEL", "LEBANON", "LIBANO",
  "BAB EL-MANDEB", "BAB EL MANDEB", "HORMUZ", "GULF OF ADEN", "GOLFO DE ADEN",
  "SOMALIA", "SUDAN", "SYRIA", "SIRIA", "PORT SAID", "SUEZ", "HODEIDAH", "HUDAYDAH",
  "NOVOROSSIYSK", "ODESA", "ODESSA", "HAIFA", "ASHDOD", "SEVASTOPOL", "CHORNOMORSK",
  "IRAN", "IRAQ", "STRAIT OF HORMUZ", "AZOV", "MAR DE AZOV"
];

export function isJWCRiskZone(portInput) {
  if (!portInput) return false;
  let str = '';
  if (typeof portInput === 'string') {
    str = portInput;
  } else if (typeof portInput === 'object' && portInput !== null) {
    str = portInput.name || portInput.pol || portInput.pod || portInput.port || portInput.country || portInput.region || '';
  }
  if (!str) return false;
  const rawUpper = String(str).toUpperCase().trim();
  const normalizedUpper = rawUpper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return jwcRiskKeywords.some(kw => rawUpper.includes(kw) || normalizedUpper.includes(kw));
}

export function evaluateJWCRisk(polInput, podInput) {
  const polRisk = isJWCRiskZone(polInput);
  const podRisk = isJWCRiskZone(podInput);
  const isRisk = polRisk || podRisk;
  const zoneName = polRisk ? String(polInput) : (podRisk ? String(podInput) : null);
  return { isRisk, zoneName, polRisk, podRisk };
}

export function calculateAutoExportDeficitBallast(podInput, manualBallastDays = 0, defaultAutoDays = 4.0) {
  const isDeficit = isExportDeficitPOD(podInput);
  const manual = Number(manualBallastDays) || 0;
  if (manual > 0) {
    return { isDeficitApplied: false, isDeficitPOD: isDeficit, ballastDays: manual, autoCalculated: false };
  }
  if (isDeficit) {
    return { isDeficitApplied: true, isDeficitPOD: true, ballastDays: defaultAutoDays, autoCalculated: true };
  }
  return { isDeficitApplied: false, isDeficitPOD: false, ballastDays: 0, autoCalculated: false };
}

export function calculateAllInFreightGross(dssState = {}, options = {}) {
  const safeIntake = (Number(dssState.actualCargoIntake) > 0)
    ? Number(dssState.actualCargoIntake)
    : (Number(dssState.targetCargoMT || dssState.cargoQty || dssState.cargo || dssState.tons) || 50000);

  const pol = dssState.pol || options.pol || '';
  const pod = dssState.pod || options.pod || '';

  // 1. Evaluacion Automatica de Riesgo JWC y Prima
  const jwcEval = evaluateJWCRisk(pol, pod);
  const isJwcActive = Boolean(dssState.jwlaRiskActive || dssState.jwcRiskActive || jwcEval.isRisk);
  const defaultJwcPrem = options.defaultJwcPremium ?? 15000;
  const jwcPremiumUSD = isJwcActive
    ? (Number(dssState.jwlaPremiumUSD || dssState.jwcPremiumUSD) || defaultJwcPrem)
    : 0;

  // 2. Evaluacion y Autocalculo de Lastre por Deficit de Exportacion (Transparente e Interno)
  const manualBallast = Number(dssState.ballastDays) || 0;
  const deficitEval = calculateAutoExportDeficitBallast(pod, manualBallast, options.defaultAutoBallastDays || 4.0);
  const effectiveBallastDays = deficitEval.ballastDays;

  // 3. Dias de navegacion y puerto (solo lectura de las calculadoras base)
  const ladenDays = Number(dssState.ladenDays ?? dssState.seaDays ?? dssState.estimatedVoyageDays ?? 8) || 0;
  const portDays = Number(dssState.portDays ?? dssState.totalPortDays ?? 10) || 0;
  const baseVoyageDays = ladenDays + portDays;
  const totalDaysWithBallast = baseVoyageDays + effectiveBallastDays;

  // 4. Tarifa Base Diaria del Buque (OPEX o TCE Objetivo)
  const calculationMode = options.mode || dssState.calculationMode || (dssState.targetTCE || dssState.tceTarget ? 'inversa_tce' : 'cost_plus');
  let dailyRate = 0;
  if (calculationMode === 'inversa_tce') {
    dailyRate = Number(dssState.targetTCE || dssState.tceTarget || dssState.globalMarketTCE || 18000);
  } else {
    dailyRate = Number(dssState.opex || dssState.opexDaily || dssState.opex_fijo_diario || 6000);
  }

  // 5. Costes de Lastre y Recargos Totales ($)
  const ballastCostUSD = dailyRate * effectiveBallastDays;
  const totalSurchargesUSD = jwcPremiumUSD + ballastCostUSD;
  const surchargesPerTon = safeIntake > 0 ? (totalSurchargesUSD / safeIntake) : 0;

  // 6. Flete Neto Base (Vinculado dinámicamente al estado de la calculadora activa)
  const rawBaseFreight = Number(
    dssState.baseNetFreight ??
    dssState.fleteUnitario ??
    dssState.fleteEstimado ??
    dssState.freightSell ??
    dssState.freightRateUSD ??
    options.baseNetFreight
  ) || 0;

  let baseNetFreight = rawBaseFreight;
  if (baseNetFreight <= 0) {
    const bunkerCost = Number(dssState.totalBunkerCost ?? dssState.bunkerCost ?? 0) || 0;
    const portCost = Number(dssState.totalPortDisbursements ?? dssState.portDisbursements ?? dssState.portCosts ?? 0) || 0;
    const baseDirectVoyageCost = (dailyRate * baseVoyageDays) + bunkerCost + portCost;
    baseNetFreight = safeIntake > 0 ? (baseDirectVoyageCost / safeIntake) : 0;
  }

  // 7. Formula Estricta: Total Net Rate = Flete Neto Base + (Recargos Totales / Toneladas)
  const totalNetRate = baseNetFreight + surchargesPerTon;

  // 8. Gross-Up para absorcion de comisiones: Flete ALL-IN Gross = Total Net Rate / (1 - (Comisiones / 100))
  const totalCommissionPct = Number(dssState.totalCommission ?? dssState.commissionPct ?? dssState.comisionTotal ?? 5.0);
  const commissionDecimal = totalCommissionPct / 100;
  const grossFactor = (commissionDecimal < 1 && commissionDecimal >= 0) ? (1 - commissionDecimal) : 0.95;
  const allInRateGross = totalNetRate / grossFactor;

  return {
    netFreightRate: Number(baseNetFreight.toFixed(2)),
    totalNetRate: Number(totalNetRate.toFixed(2)),
    allInRateGross: Number(allInRateGross.toFixed(2)),
    jwcRiskActive: isJwcActive,
    jwcPremiumUSD,
    jwcZone: jwcEval.zoneName,
    isExportDeficit: deficitEval.isDeficitPOD,
    autoBallastApplied: deficitEval.autoCalculated,
    effectiveBallastDays,
    ballastCostUSD,
    totalSurchargesUSD,
    surchargesPerTon: Number(surchargesPerTon.toFixed(2)),
    totalCommissionPct,
    calculationMode,
    totalDaysWithBallast,
    safeIntake
  };
}


