import React, { useEffect, useMemo, useRef, useState } from 'react';

type ReverseCalculatorState = {
  tceTarget: number | '';
  daysSea: number;
  daysPort: number;
  seaFuelConsumption: number;
  portFuelConsumption: number;
  vlsfoPrice: number;
  ifoPrice: number;
  mgoPrice: number;
  bunkerCost: number;
  portCosts: number;
  cargoVolume: number;
  bunkerDailyPortCost: number;
  totalCo2Emissions: number;
  euaPrice: number;
  etsCoverage: number;
  opexDaily: number;
  contractShipments: number;
  ownerMarginPercent: number;
  chartererMarginPercent: number;
  hasScrubber: boolean;
  laycanDiasLibres: number;
  impactoRiesgo: number;
  riesgoDias: number;
  applyBunkerIndexAdjustment: boolean;
  contractBunkerIndexBase: number;
};

type RouteCalculationData = {
  totalDays?: number;
  distance?: number;
  totalCosts?: number;
  estimatedBunker?: number;
  estimatedBunkerCost?: number;
};

type SyncedCostData = Partial<Pick<
  ReverseCalculatorState,
  | 'seaFuelConsumption'
  | 'portFuelConsumption'
  | 'vlsfoPrice'
  | 'ifoPrice'
  | 'mgoPrice'
  | 'bunkerCost'
  | 'portCosts'
  | 'bunkerDailyPortCost'
  | 'opexDaily'
>> & RouteCalculationData;

type CostPlusNumericValue = number | '';

type CostPlusCalculatorState = {
  dailyOpex: CostPlusNumericValue;
  targetMargin: CostPlusNumericValue;
  marginType: 'fixed' | 'percentage';
  daysSea: CostPlusNumericValue;
  daysPort: CostPlusNumericValue;
  bunkerCost: CostPlusNumericValue;
  portCosts: CostPlusNumericValue;
  cargoVolume: CostPlusNumericValue;
};

type CostPlusNumericField = Exclude<keyof CostPlusCalculatorState, 'marginType'>;

type ReverseTceCalculatorProps = {
  cargoVolume?: number;
  daysSea?: number;
  daysPort?: number;
  vesselCategory?: string;
  hasScrubber?: boolean;
  syncedCostData?: SyncedCostData;
  laycanDiasLibres?: number;
  impactoRiesgo?: number;
  riesgoDias?: number;
  laycanDate?: string;
  refreshSignal?: number;
};

type NavigationStrategy = 'eco' | 'full';

type VesselPricingRouterProps = ReverseTceCalculatorProps & {
  vesselDwt?: number;
};

type CostPlusCalculatorProps = Pick<
  ReverseTceCalculatorProps,
  'cargoVolume' | 'daysSea' | 'daysPort' | 'syncedCostData'
> & {
  currentMode?: VesselCalculationMode;
  refreshSignal?: number;
};

type VesselCalculationMode = 'Cost-Plus' | 'TCE Inverso';

type VesselCategory = {
  categoryName: string;
  minDwt: number;
  maxDwt: number;
  type: VesselCalculationMode;
};

type FleetRegistryRecord = {
  imo: string;
  nombre: string;
  name: string;
  tipo: string;
  type: string;
  shipType: string;
  vesselType: string;
  category: string;
  categoryValue: string;
  categoryLabel: string;
  scrapedType: string;
  anio: string;
  gt: string;
  dwt: string;
  dimensiones: string;
  capturedAt?: string;
  updatedAt?: string;
};

type FearnleysCache = {
  weekLabel: string;
  timestamp: number;
  rates: Record<string, number>;
};

type BunkerIndexCache = {
  vlsfo: number;
  ifo380: number;
  mgo: number;
  date: string;
};

const DEFAULT_VALUES: ReverseCalculatorState = {
  tceTarget: '',
  daysSea: 8,
  daysPort: 13.5,
  seaFuelConsumption: 5.5,
  portFuelConsumption: 0.5,
  vlsfoPrice: 610,
  ifoPrice: 0,
  mgoPrice: 830,
  bunkerCost: 104625,
  portCosts: 60000,
  cargoVolume: 30000,
  bunkerDailyPortCost: 2250,
  totalCo2Emissions: 809.7,
  euaPrice: 75.5,
  etsCoverage: 0.5,
  opexDaily: 2800,
  contractShipments: 6,
  ownerMarginPercent: 15,
  chartererMarginPercent: 10,
  hasScrubber: false,
  laycanDiasLibres: 0,
  impactoRiesgo: 0,
  riesgoDias: 0,
  applyBunkerIndexAdjustment: true,
  contractBunkerIndexBase: 0,
};

const COST_PLUS_DEFAULT_VALUES: CostPlusCalculatorState = {
  dailyOpex: 4500,
  targetMargin: 15,
  marginType: 'percentage',
  daysSea: 4,
  daysPort: 6,
  bunkerCost: 25000,
  portCosts: 18000,
  cargoVolume: 8000,
};

const COST_PLUS_INPUTS: Array<{
  key: CostPlusNumericField;
  label: string;
  suffix: string;
}> = [
  { key: 'daysSea', label: 'Días de mar', suffix: 'días' },
  { key: 'daysPort', label: 'Días de puerto', suffix: 'días' },
  { key: 'bunkerCost', label: 'Coste combustible', suffix: 'USD' },
  { key: 'portCosts', label: 'Gastos portuarios', suffix: 'USD' },
  { key: 'cargoVolume', label: 'Toneladas carga', suffix: 'MT' },
];

const INPUTS: Array<{
  key: keyof ReverseCalculatorState;
  label: string;
  suffix: string;
  step?: string;
}> = [
  { key: 'tceTarget', label: 'TCE objetivo', suffix: 'USD/día' },
  { key: 'daysSea', label: 'Días de mar', suffix: 'días', step: '0.1' },
  { key: 'daysPort', label: 'Días de puerto', suffix: 'días', step: '0.1' },
  { key: 'seaFuelConsumption', label: 'Consumo mar', suffix: 't/d', step: 'any' },
  { key: 'portFuelConsumption', label: 'Consumo puerto', suffix: 't/d', step: 'any' },
  { key: 'portCosts', label: 'Costes portuarios', suffix: 'USD' },
  { key: 'cargoVolume', label: 'Volumen de carga', suffix: 'MT' },
  { key: 'bunkerDailyPortCost', label: 'Bunker diario en puerto', suffix: 'USD/día' },
  { key: 'totalCo2Emissions', label: 'Emisiones CO2 ETS', suffix: 'tCO2', step: '0.1' },
  { key: 'euaPrice', label: 'Precio EUA', suffix: 'USD/t', step: '0.01' },
  { key: 'etsCoverage', label: 'Cobertura ETS', suffix: 'factor', step: '0.5' },
  { key: 'opexDaily', label: 'OPEX fijo diario', suffix: 'USD/día' },
  { key: 'contractShipments', label: 'Número de embarques COA', suffix: 'viajes', step: '1' },
  { key: 'ownerMarginPercent', label: 'Margen armador', suffix: '%' },
  { key: 'chartererMarginPercent', label: 'Margen fletador', suffix: '%' },
];

const SYNCED_REVERSE_FIELDS = new Set<keyof ReverseCalculatorState>([
  'cargoVolume',
  'daysSea',
  'daysPort',
  'seaFuelConsumption',
  'portFuelConsumption',
  'vlsfoPrice',
  'ifoPrice',
  'mgoPrice',
  'bunkerCost',
  'portCosts',
  'bunkerDailyPortCost',
  'opexDaily',
]);

const FEARNLEYS_MARKET_DATA_KEY = 'fearnleysMarketData';
const BUNKER_INDEX_DATA_KEY = 'bunkerIndexData';
const DEMURRAGE_TCE_MULTIPLIER = 1.25;
const BUNKER_INDEX_ADJUSTMENT_SHARE = 0.5;
const BUNKER_INDEX_VARIATION_THRESHOLD_PERCENT = 5;
const FLEET_REGISTRY_KEY = 'fleet_registry';
const FLEET_CATEGORY_GROUPS = [
  {
    label: 'Cargo',
    options: [
      ['category:cargo', 'All Cargo'],
      ['type:bulk', 'Bulk Carrier'],
      ['type:general', 'General Cargo'],
      ['type:container', 'Container Ship'],
      ['type:cement', 'Cement Carrier'],
      ['type:mpv', 'Multipurpose / MPP'],
      ['type:heavy_lift', 'Heavy Lift'],
    ],
  },
  {
    label: 'Tankers',
    options: [
      ['category:tanker', 'All Tankers'],
      ['type:crude_tanker', 'Crude Oil Tanker'],
      ['type:lng_tanker', 'LNG Tanker'],
      ['type:chemical_tanker', 'Chemical Tanker'],
      ['type:product_tanker', 'Product Tanker'],
      ['type:lpg_tanker', 'LPG Tanker'],
    ],
  },
  {
    label: 'Passenger',
    options: [
      ['category:passenger', 'All Passenger'],
      ['type:passenger', 'Passenger Ship'],
      ['type:cruise', 'Cruise Ship'],
      ['type:ferry', 'Ferry / RoPax'],
    ],
  },
  {
    label: 'Other',
    options: [
      ['category:other', 'All Other'],
      ['type:offshore', 'Offshore'],
      ['type:tug', 'Tug / Support'],
      ['type:fishing', 'Fishing'],
    ],
  },
] as const;
const NAVIGATION_STRATEGIES: Record<NavigationStrategy, {
  label: string;
  seaConsumptionFactor: number;
  daysSeaFactor: number;
}> = {
  eco: {
    label: 'Eco-Speed',
    seaConsumptionFactor: 0.85,
    daysSeaFactor: 1.12,
  },
  full: {
    label: 'Full-Speed',
    seaConsumptionFactor: 1,
    daysSeaFactor: 0.92,
  },
};
const CURRENT_FEARNLEYS_WEEK_LABEL = 'Week actual - Fearnleys';
const FEARNLEYS_MARKET_RATES: Record<string, number> = {
  'Handysize / Small Tanker': 13000,
  'Supramax / MR': 17125,
  Ultramax: 18625,
  'Panamax / Kamsarmax / LR1': 18500,
  'Baby Cape / Aframax / LR2': 25000,
  'Capesize / Suezmax': 35000,
  'VLOC / VLCC': 45000,
};

export const VESSEL_CATEGORIES: VesselCategory[] = [
  { categoryName: 'Coaster', minDwt: 1000, maxDwt: 4999, type: 'Cost-Plus' },
  { categoryName: 'Mini-Bulker', minDwt: 5000, maxDwt: 14999, type: 'Cost-Plus' },
  { categoryName: 'Handysize / Small Tanker', minDwt: 15000, maxDwt: 34999, type: 'TCE Inverso' },
  { categoryName: 'Supramax / MR', minDwt: 35000, maxDwt: 59999, type: 'TCE Inverso' },
  { categoryName: 'Ultramax', minDwt: 60000, maxDwt: 64999, type: 'TCE Inverso' },
  { categoryName: 'Panamax / Kamsarmax / LR1', minDwt: 65000, maxDwt: 84999, type: 'TCE Inverso' },
  { categoryName: 'Baby Cape / Aframax / LR2', minDwt: 85000, maxDwt: 119999, type: 'TCE Inverso' },
  { categoryName: 'Capesize / Suezmax', minDwt: 120000, maxDwt: 199999, type: 'TCE Inverso' },
  { categoryName: 'VLOC / VLCC', minDwt: 200000, maxDwt: Number.POSITIVE_INFINITY, type: 'TCE Inverso' },
];

export function getVesselClass(dwt: number): Pick<VesselCategory, 'categoryName' | 'type'> {
  const normalizedDwt = safeNumber(dwt);
  const category = VESSEL_CATEGORIES.find(
    (item) => normalizedDwt >= item.minDwt && normalizedDwt <= item.maxDwt,
  );

  if (category) {
    return { categoryName: category.categoryName, type: category.type };
  }

  return normalizedDwt < 15000
    ? { categoryName: 'Coaster', type: 'Cost-Plus' }
    : { categoryName: 'Handysize / Small Tanker', type: 'TCE Inverso' };
}

export const getVesselCategory = getVesselClass;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const wholeCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function safeNumber(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function roundMoney(value: number) {
  return Number(safeNumber(value).toFixed(2));
}

export function calculateCoreFreight(
  values: ReverseCalculatorState | CostPlusCalculatorState,
  options: { bunkerMultiplier?: number } = {},
) {
  if ('marginType' in values) {
    const dailyOpex = safeNumber(values.dailyOpex);
    const targetMargin = safeNumber(values.targetMargin);
    const daysSea = safeNumber(values.daysSea);
    const daysPort = safeNumber(values.daysPort);
    const bunkerCost = safeNumber(values.bunkerCost);
    const portCosts = safeNumber(values.portCosts);
    const cargoVolume = safeNumber(values.cargoVolume);
    const totalDays = daysSea + daysPort;
    const totalOpex = dailyOpex * totalDays;
    const totalCosts = totalOpex + bunkerCost + portCosts;
    const calculatedMargin =
      values.marginType === 'fixed' ? targetMargin : totalCosts * (targetMargin / 100);
    const targetRevenue = totalCosts + calculatedMargin;
    const minFreightRate = cargoVolume > 0 ? roundMoney(totalCosts / cargoVolume) : 0;

    return {
      totalDays,
      totalOpex,
      totalCosts,
      calculatedMargin,
      targetRevenue,
      minFreightRate,
    };
  }

  const daysSea = safeNumber(values.daysSea);
  const daysPort = safeNumber(values.daysPort);
  const tceTarget = safeNumber(values.tceTarget);
  const vlsfoPrice = safeNumber(values.vlsfoPrice);
  const ifoPrice = safeNumber(values.ifoPrice);
  const mgoPrice = safeNumber(values.mgoPrice);
  const seaFuelConsumption = safeNumber(values.seaFuelConsumption);
  const portFuelConsumption = safeNumber(values.portFuelConsumption);
  const activeSeaFuelPrice = values.hasScrubber ? ifoPrice : vlsfoPrice;
  const portCosts = safeNumber(values.portCosts);
  const cargoVolume = safeNumber(values.cargoVolume);
  const totalCo2Emissions = safeNumber(values.totalCo2Emissions);
  const euaPrice = safeNumber(values.euaPrice);
  const etsCoverage = safeNumber(values.etsCoverage);
  const bunkerMultiplier = safeNumber(options.bunkerMultiplier) || 1;
  const totalDays = daysSea + daysPort;
  const etsTotalCost = totalCo2Emissions * euaPrice * etsCoverage;
  const seaFuelCost = daysSea * seaFuelConsumption * activeSeaFuelPrice * bunkerMultiplier;
  const portFuelCost = daysPort * portFuelConsumption * mgoPrice * bunkerMultiplier;
  const bunkerCost = seaFuelCost + portFuelCost;
  const totalCosts = (tceTarget * totalDays) + bunkerCost + portCosts + etsTotalCost;
  const minFreightRate = cargoVolume > 0 ? roundMoney(totalCosts / cargoVolume) : 0;

  return {
    totalDays,
    totalOpex: 0,
    totalCosts,
    calculatedMargin: 0,
    targetRevenue: totalCosts,
    minFreightRate,
    etsTotalCost,
    seaFuelCost,
    portFuelCost,
    bunkerCost,
    activeSeaFuelPrice,
  };
}

function calculateCostPlusResults(values: CostPlusCalculatorState) {
  const dailyOpex = safeNumber(values.dailyOpex);
  const coreFreight = calculateCoreFreight(values);
  const demurrageRate = roundMoney(dailyOpex * 1.25);

  return { ...coreFreight, demurrageRate };
}

function calculateReverseTceResults(values: ReverseCalculatorState) {
  const daysSea = safeNumber(values.daysSea);
  const daysPort = safeNumber(values.daysPort);
  const tceTarget = safeNumber(values.tceTarget);
  const vlsfoPrice = safeNumber(values.vlsfoPrice);
  const ifoPrice = safeNumber(values.ifoPrice);
  const mgoPrice = safeNumber(values.mgoPrice);
  const cargoVolume = safeNumber(values.cargoVolume);
  const opexDaily = safeNumber(values.opexDaily);
  const contractShipments = Math.max(1, Math.round(safeNumber(values.contractShipments)));
  const ownerMarginPercent = safeNumber(values.ownerMarginPercent);
  const chartererMarginPercent = safeNumber(values.chartererMarginPercent);
  const coreFreight = calculateCoreFreight(values);
  const totalDays = coreFreight.totalDays;
  const etsTotalCost = coreFreight.etsTotalCost ?? 0;
  const marketBunkerIndexPrice = getAverageBunkerIndexPrice({
    vlsfo: vlsfoPrice,
    ifo380: ifoPrice,
    mgo: mgoPrice,
  });
  const bunkerIndexBase = safeNumber(values.contractBunkerIndexBase) || marketBunkerIndexPrice;
  const bunkerVariationPct = bunkerIndexBase > 0
    ? ((marketBunkerIndexPrice - bunkerIndexBase) / bunkerIndexBase) * 100
    : 0;
  const shouldApplyBunkerAdjustment = values.applyBunkerIndexAdjustment
    && Math.abs(bunkerVariationPct) >= BUNKER_INDEX_VARIATION_THRESHOLD_PERCENT;
  const sharedBunkerAdjustmentPct = shouldApplyBunkerAdjustment
    ? bunkerVariationPct * BUNKER_INDEX_ADJUSTMENT_SHARE
    : 0;
  const calculateScenario = (label: 'Optimista -10%' | 'Base BunkerIndex' | 'Pesimista +10%', bunkerMultiplier: number) => {
    const scenarioCoreFreight = calculateCoreFreight(values, { bunkerMultiplier });
    const scenarioBunkerCost = scenarioCoreFreight.bunkerCost ?? 0;
    const scenarioVoyageCost = scenarioCoreFreight.totalCosts;
    const scenarioContractCost = scenarioVoyageCost * contractShipments;
    const weightedAverageVoyageCost = scenarioContractCost / contractShipments;
    const breakEvenAverage = cargoVolume > 0 ? weightedAverageVoyageCost / cargoVolume : 0;
    const fairFreight = breakEvenAverage * (1 + ownerMarginPercent / 100);
    const targetPriceBeforeIndexation = fairFreight * (1 + chartererMarginPercent / 100);
    const indexedTargetPrice = targetPriceBeforeIndexation * (1 + sharedBunkerAdjustmentPct / 100);

    return {
      label,
      bunkerMultiplier,
      bunkerIndexPrice: marketBunkerIndexPrice * bunkerMultiplier,
      bunkerCost: scenarioBunkerCost,
      voyageCost: scenarioVoyageCost,
      contractCost: scenarioContractCost,
      weightedAverageVoyageCost,
      totalCost: scenarioContractCost,
      breakEvenAverage: roundMoney(breakEvenAverage),
      fairFreight: roundMoney(fairFreight),
      targetPriceBeforeIndexation: roundMoney(targetPriceBeforeIndexation),
      targetPrice: roundMoney(indexedTargetPrice),
    };
  };
  const scenarios = [
    calculateScenario('Optimista -10%', 0.9),
    calculateScenario('Base BunkerIndex', 1),
    calculateScenario('Pesimista +10%', 1.1),
  ];
  const seaFuelCost = coreFreight.seaFuelCost ?? 0;
  const portFuelCost = coreFreight.portFuelCost ?? 0;
  const bunkerCost = coreFreight.bunkerCost ?? 0;
  const bunkerDailyPortCost = daysPort > 0 ? portFuelCost / daysPort : safeNumber(values.bunkerDailyPortCost);
  const etsCostPerMt = cargoVolume > 0 ? etsTotalCost / cargoVolume : 0;
  const targetRevenue = coreFreight.targetRevenue;
  const minFreightRate = coreFreight.minFreightRate;
  const suggestedOwnerSale = roundMoney(minFreightRate * (1 + ownerMarginPercent / 100));
  const suggestedChartererSale = roundMoney(suggestedOwnerSale * (1 + chartererMarginPercent / 100));
  const isSuggestedSaleBelowTceTarget = suggestedOwnerSale < minFreightRate || suggestedChartererSale < minFreightRate;
  const negotiationSpread = suggestedChartererSale - suggestedOwnerSale;
  const negotiationMarginPct = suggestedOwnerSale > 0 ? (negotiationSpread / suggestedOwnerSale) * 100 : 0;
  const isNegotiationMarginCritical = suggestedOwnerSale > 0 && negotiationMarginPct < 5;
  const demurrage = calculateRiskAdjustedDemurrage({
    tceTarget,
    cargoVolume,
    charterHireDaily: opexDaily,
    historicalRiskImpact: safeNumber(values.impactoRiesgo),
    riskDays: safeNumber(values.riesgoDias),
    laycanFreeDays: safeNumber(values.laycanDiasLibres),
  });
  const demurrageRate = demurrage.demurrageRate;
  const tceTotal = tceTarget * totalDays;
  const netProfitTotal = tceTotal - opexDaily * totalDays;
  const netProfitDaily = totalDays > 0 ? netProfitTotal / totalDays : 0;

  return {
    totalDays,
    tceTarget,
    targetRevenue,
    minFreightRate,
    suggestedOwnerSale,
    suggestedChartererSale,
    isSuggestedSaleBelowTceTarget,
    negotiationMarginPct,
    isNegotiationMarginCritical,
    demurrageRate,
    demurrageBase: demurrage.demurrageBase,
    demurrageRiskAdjustment: demurrage.historicalRiskDailyImpact,
    isDemurrageRiskAdjusted: demurrage.hasRiskAdjustment,
    demurrageRiskOverrunDays: demurrage.riskOverrunDays,
    etsTotalCost,
    etsCostPerMt,
    bunkerCost,
    seaFuelCost,
    portFuelCost,
    activeSeaFuelPrice: coreFreight.activeSeaFuelPrice ?? 0,
    bunkerDailyPortCost,
    tceTotal,
    tceDaily: totalDays > 0 ? tceTotal / totalDays : 0,
    netProfitTotal,
    netProfitDaily,
    opexDaily,
    contractShipments,
    ownerMarginPercent,
    chartererMarginPercent,
    seaFuelStrategyLabel: values.hasScrubber
      ? 'Optimizado con IFO 380 (Scrubber Activo)'
      : 'Combustible estándar: VLSFO',
    marketBunkerIndexPrice,
    bunkerIndexBase,
    bunkerVariationPct,
    sharedBunkerAdjustmentPct,
    shouldApplyBunkerAdjustment,
    scenarios,
  };
}

function getTodayBunkerLabel() {
  return new Date().toLocaleDateString();
}

function getAverageBunkerIndexPrice({ vlsfo, ifo380, mgo }: { vlsfo: number; ifo380: number; mgo: number }) {
  const validPrices = [vlsfo, ifo380, mgo].filter((price) => Number.isFinite(price) && price > 0);
  if (!validPrices.length) return 0;
  return validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length;
}

function calculateRiskAdjustedDemurrage({
  tceTarget,
  cargoVolume,
  charterHireDaily,
  historicalRiskImpact,
  riskDays,
  laycanFreeDays,
}: {
  tceTarget: number;
  cargoVolume: number;
  charterHireDaily: number;
  historicalRiskImpact: number;
  riskDays: number;
  laycanFreeDays: number;
}) {
  const demurrageBase = tceTarget * DEMURRAGE_TCE_MULTIPLIER;
  const normalizedRiskDays = Math.max(0, riskDays);
  const normalizedLaycanFreeDays = Math.max(0, laycanFreeDays);
  const riskOverrunDays = Math.max(0, normalizedRiskDays - normalizedLaycanFreeDays);
  const hasRiskAdjustment = historicalRiskImpact > 0 && riskOverrunDays > 0 && cargoVolume > 0 && normalizedRiskDays > 0;
  const correctionFactor = hasRiskAdjustment
    ? (cargoVolume / normalizedRiskDays) * (riskOverrunDays / Math.max(normalizedLaycanFreeDays, 1))
    : 0;
  const historicalRiskDailyImpact = hasRiskAdjustment ? historicalRiskImpact * correctionFactor : 0;
  const projectedDemurrageRate = demurrageBase + historicalRiskDailyImpact;
  const demurrageCap = Math.max(0, charterHireDaily) * 1.5;
  const demurrageRate = demurrageCap > 0
    ? Math.min(projectedDemurrageRate, demurrageCap)
    : projectedDemurrageRate;

  return {
    demurrageBase,
    demurrageRate,
    historicalRiskDailyImpact,
    hasRiskAdjustment,
    riskOverrunDays,
  };
}

function LockIcon({ open = false }: { open?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <path d="M7 10V7a5 5 0 0 1 9.4-2.4" />
      ) : (
        <path d="M7 10V7a5 5 0 0 1 10 0v3" />
      )}
      <rect width="14" height="10" x="5" y="10" rx="2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 1-15.3 6.4" />
      <path d="M3 12A9 9 0 0 1 18.3 5.6" />
      <path d="M18 2v4h-4" />
      <path d="M6 22v-4h4" />
    </svg>
  );
}

function normalizeFleetImo(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-7) : '';
}

function cleanFleetValue(value: unknown) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || 'N/A';
}

function getFleetRegistryStore(): Record<string, FleetRegistryRecord> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(FLEET_REGISTRY_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function FleetIntelligenceLibraryPanel() {
  const defaultCategory = FLEET_CATEGORY_GROUPS[0].options[0];
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory[0]);
  const [listingUrl, setListingUrl] = useState('');
  const [status, setStatus] = useState('Biblioteca local lista para consulta AIS.');
  const [registryCount, setRegistryCount] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRegistryCount(Object.keys(getFleetRegistryStore()).length);
    const storedFilter = window.localStorage.getItem('fleet_intel_vessel_filter');
    if (storedFilter) setSelectedCategory(storedFilter);
  }, []);

  const selectedLabel = useMemo(() => {
    for (const group of FLEET_CATEGORY_GROUPS) {
      const match = group.options.find(([value]) => value === selectedCategory);
      if (match) return match[1];
    }
    return defaultCategory[1];
  }, [selectedCategory]);

  const handleCategoryChange = (nextValue: string) => {
    setSelectedCategory(nextValue);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('fleet_intel_vessel_filter', nextValue);
      window.dispatchEvent(new CustomEvent('fleet-intel-filter-changed', { detail: { value: nextValue } }));
    }
  };

  const captureFleetRegistry = async () => {
    const url = listingUrl.trim();
    if (!url) {
      setStatus('Introduce una URL de VesselFinder para capturar la biblioteca.');
      return;
    }

    setIsCapturing(true);
    setProgress({ current: 0, total: 1 });
    setStatus(`Buscando buques para ${selectedLabel}...`);

    try {
      const response = await fetch('/api/scrape-vessel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo leer VesselFinder.');

      const records = Array.isArray(payload.records) ? payload.records : [];
      const store = getFleetRegistryStore();
      let newCount = 0;
      let updatedCount = 0;

      records.forEach((record: Partial<FleetRegistryRecord>, index: number) => {
        setProgress({ current: index + 1, total: records.length || 1 });
        const imo = normalizeFleetImo(record.imo);
        if (!imo) return;
        const nombre = cleanFleetValue(record.nombre || record.name);
        const nextRecord: FleetRegistryRecord = {
          imo,
          nombre,
          name: nombre,
          tipo: cleanFleetValue(selectedLabel),
          type: cleanFleetValue(selectedLabel),
          shipType: cleanFleetValue(selectedLabel),
          vesselType: cleanFleetValue(selectedLabel),
          category: selectedCategory,
          categoryValue: selectedCategory,
          categoryLabel: cleanFleetValue(selectedLabel),
          scrapedType: cleanFleetValue(record.tipo || record.type || record.shipType || record.vesselType),
          anio: cleanFleetValue(record.anio),
          gt: cleanFleetValue(record.gt),
          dwt: cleanFleetValue(record.dwt),
          dimensiones: cleanFleetValue(record.dimensiones),
        };
        const existing = store[imo];
        if (existing) {
          updatedCount += 1;
          store[imo] = { ...existing, ...nextRecord, updatedAt: new Date().toISOString() };
        } else {
          newCount += 1;
          store[imo] = { ...nextRecord, capturedAt: new Date().toISOString() };
        }
      });

      window.localStorage.setItem(FLEET_REGISTRY_KEY, JSON.stringify(store));
      setRegistryCount(Object.keys(store).length);
      setStatus(`Base de datos actualizada con ${records.length} buques. Nuevos: ${newCount}. Actualizados: ${updatedCount}.`);
    } catch (error) {
      setStatus(`Error de captura: ${error instanceof Error ? error.message : 'servicio no disponible'}`);
    } finally {
      setIsCapturing(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const progressPercent = progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Centro de Inteligencia de Flota</p>
          <h2 className="mt-1 text-base font-black text-slate-950">Biblioteca AIS local</h2>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800">
          {registryCount} buques
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(12rem,0.45fr)_minmax(16rem,1fr)_auto]">
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Categoría</span>
          <select value={selectedCategory} onChange={(event) => handleCategoryChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15">
            {FLEET_CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">URL VesselFinder</span>
          <input type="url" value={listingUrl} onChange={(event) => setListingUrl(event.target.value)} placeholder="Pegar URL de VesselFinder..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15" />
        </label>
        <button type="button" onClick={captureFleetRegistry} disabled={isCapturing} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-500 bg-amber-400 px-4 text-xs font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-65">
          <RefreshIcon />
          {isCapturing ? 'Buscando...' : 'Capturar'}
        </button>
      </div>
      {isCapturing && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-amber-800">Capturando... {progress.current}/{progress.total}</p>
        </div>
      )}
      <p className="mt-2 text-xs font-semibold text-slate-500">{status}</p>
    </section>
  );
}

export function ReverseTceCalculator({
  cargoVolume,
  daysSea,
  daysPort,
  vesselCategory = 'Handysize / Small Tanker',
  hasScrubber = false,
  syncedCostData,
  laycanDiasLibres = 0,
  impactoRiesgo = 0,
  riesgoDias = 0,
  laycanDate = '',
  refreshSignal = 0,
}: ReverseTceCalculatorProps) {
  const [isPurchaseDetailsOpen, setIsPurchaseDetailsOpen] = useState(false);
  const [values, setValues] = useState<ReverseCalculatorState>(DEFAULT_VALUES);
  const [vlsfoPrice, setVlsfoPrice] = useState(DEFAULT_VALUES.vlsfoPrice);
  const [ifoPrice, setIfoPrice] = useState(DEFAULT_VALUES.ifoPrice);
  const [mgoPrice, setMgoPrice] = useState(DEFAULT_VALUES.mgoPrice);
  const [isFetchingFearnleys, setIsFetchingFearnleys] = useState(false);
  const [isFetchingBunker, setIsFetchingBunker] = useState(false);
  const [indexWeekLabel, setIndexWeekLabel] = useState('');
  const [bunkerDateLabel, setBunkerDateLabel] = useState('');
  const [bunkerFetchError, setBunkerFetchError] = useState('');
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [navigationStrategy, setNavigationStrategy] = useState<NavigationStrategy>('eco');
  const [applyBunkerIndexAdjustment, setApplyBunkerIndexAdjustment] = useState(true);
  const [contractBunkerIndexBase, setContractBunkerIndexBase] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');
  const [renderRefreshTick, setRenderRefreshTick] = useState(0);
  const etaBaseRadar = laycanDate || '';

  const getSyncedValues = (current: ReverseCalculatorState) => {
    const strategy = NAVIGATION_STRATEGIES[navigationStrategy];
    return {
      ...current,
      cargoVolume: Number.isFinite(Number(cargoVolume)) ? Number(cargoVolume) : current.cargoVolume,
      daysSea: Number((
        (Number.isFinite(Number(daysSea)) ? Number(daysSea) : current.daysSea) * strategy.daysSeaFactor
      ).toFixed(2)),
      daysPort: Number.isFinite(Number(daysPort)) ? Number(daysPort) : current.daysPort,
      hasScrubber,
      laycanDiasLibres,
      impactoRiesgo,
      riesgoDias,
      applyBunkerIndexAdjustment,
      contractBunkerIndexBase,
      ...syncedCostData,
      seaFuelConsumption: Number((
        (Number.isFinite(Number(syncedCostData?.seaFuelConsumption))
          ? Number(syncedCostData?.seaFuelConsumption)
          : current.seaFuelConsumption) * strategy.seaConsumptionFactor
      ).toFixed(2)),
    };
  };

  const syncFromSectionData = () => {
    setValues((current) => getSyncedValues(current));

    if (Number.isFinite(Number(syncedCostData?.vlsfoPrice))) {
      setVlsfoPrice(Number(syncedCostData?.vlsfoPrice));
    }
    if (Number.isFinite(Number(syncedCostData?.ifoPrice))) {
      setIfoPrice(Number(syncedCostData?.ifoPrice));
    }
    if (Number.isFinite(Number(syncedCostData?.mgoPrice))) {
      setMgoPrice(Number(syncedCostData?.mgoPrice));
    }
  };

  const forceRefresh = () => {
    setValues((current) => {
      const nextValues = isSyncEnabled ? getSyncedValues(current) : { ...current };
      calculateCoreFreight(nextValues);
      return nextValues;
    });
    setRenderRefreshTick((current) => current + 1);

    if (Number.isFinite(Number(syncedCostData?.vlsfoPrice))) {
      setVlsfoPrice(Number(syncedCostData?.vlsfoPrice));
    }
    if (Number.isFinite(Number(syncedCostData?.ifoPrice))) {
      setIfoPrice(Number(syncedCostData?.ifoPrice));
    }
    if (Number.isFinite(Number(syncedCostData?.mgoPrice))) {
      setMgoPrice(Number(syncedCostData?.mgoPrice));
    }
  };

  useEffect(() => {
    if (refreshSignal > 0) {
      forceRefresh();
    }
  }, [refreshSignal]);

  useEffect(() => {
    if (isSyncEnabled) {
      syncFromSectionData();
    }
  }, [cargoVolume, daysSea, daysPort, syncedCostData, isSyncEnabled, navigationStrategy]);

  useEffect(() => {
    setValues((current) => ({
      ...current,
      vlsfoPrice,
      ifoPrice,
      mgoPrice,
      hasScrubber,
      laycanDiasLibres,
      impactoRiesgo,
      riesgoDias,
      applyBunkerIndexAdjustment,
      contractBunkerIndexBase,
    }));
  }, [
    vlsfoPrice,
    ifoPrice,
    mgoPrice,
    hasScrubber,
    laycanDiasLibres,
    impactoRiesgo,
    riesgoDias,
    applyBunkerIndexAdjustment,
    contractBunkerIndexBase,
  ]);

  const applyMarketRateFromCache = (category: string) => {
    try {
      const cached = window.localStorage.getItem(FEARNLEYS_MARKET_DATA_KEY);
      if (!cached) return false;

      const parsed = JSON.parse(cached) as Partial<FearnleysCache>;
      const marketRate = parsed.rates?.[category];

      if (Number.isFinite(marketRate) && parsed.weekLabel) {
        setValues((current) => ({
          ...current,
          tceTarget: Number(marketRate),
        }));
        setIndexWeekLabel(parsed.weekLabel);
        return true;
      }
    } catch {
      window.localStorage.removeItem(FEARNLEYS_MARKET_DATA_KEY);
    }
    return false;
  };

  useEffect(() => {
    if (!isManualOverride) {
      applyMarketRateFromCache(vesselCategory);
    }
  }, [vesselCategory, isManualOverride]);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(BUNKER_INDEX_DATA_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached) as Partial<BunkerIndexCache>;
      if (parsed.date !== getTodayBunkerLabel()) return;
      const vlsfo = Number(parsed.vlsfo);
      const ifo380 = Number(parsed.ifo380);
      const mgo = Number(parsed.mgo);
      if (!Number.isFinite(vlsfo) || !Number.isFinite(ifo380) || !Number.isFinite(mgo)) return;
      setVlsfoPrice(vlsfo);
      setIfoPrice(ifo380);
      setMgoPrice(mgo);
      setValues((current) => ({
        ...current,
        vlsfoPrice: vlsfo,
        ifoPrice: ifo380,
        mgoPrice: mgo,
      }));
      setBunkerDateLabel(parsed.date);
      setContractBunkerIndexBase((current) => current || getAverageBunkerIndexPrice({ vlsfo, ifo380, mgo }));
    } catch {
      window.localStorage.removeItem(BUNKER_INDEX_DATA_KEY);
    }
  }, []);

  const results = useMemo(() => calculateReverseTceResults(values), [values, renderRefreshTick]);

  const updateValue = (key: keyof ReverseCalculatorState, nextValue: string) => {
    if (isSyncEnabled && SYNCED_REVERSE_FIELDS.has(key)) {
      return;
    }

    if (key === 'tceTarget') {
      setIsManualOverride(true);
    }

    const parsedValue = key === 'tceTarget' && nextValue === '' ? '' : Number(nextValue);

    setValues((current) => ({
      ...current,
      [key]: parsedValue,
    }));
  };

  const updateBunkerPrice = (key: 'vlsfoPrice' | 'ifoPrice' | 'mgoPrice', nextValue: string) => {
    if (isSyncEnabled) {
      return;
    }

    const parsedValue = Number(nextValue);
    const normalizedValue = Number.isFinite(parsedValue) ? parsedValue : 0;

    if (key === 'vlsfoPrice') {
      setVlsfoPrice(normalizedValue);
      setValues((current) => ({ ...current, vlsfoPrice: normalizedValue }));
      return;
    }

    if (key === 'ifoPrice') {
      setIfoPrice(normalizedValue);
      setValues((current) => ({ ...current, ifoPrice: normalizedValue }));
      return;
    }

    setMgoPrice(normalizedValue);
    setValues((current) => ({ ...current, mgoPrice: normalizedValue }));
  };

  const handleFetchFearnleys = async () => {
    if (isFetchingFearnleys) {
      return;
    }

    setIsFetchingFearnleys(true);
    await new Promise((resolve) => {
      window.setTimeout(resolve, 1500);
    });

    const nextCache: FearnleysCache = {
      weekLabel: CURRENT_FEARNLEYS_WEEK_LABEL,
      timestamp: Date.now(),
      rates: FEARNLEYS_MARKET_RATES,
    };

    const marketRate = nextCache.rates[vesselCategory];
    window.localStorage.setItem(FEARNLEYS_MARKET_DATA_KEY, JSON.stringify(nextCache));
    setIsManualOverride(false);
    if (Number.isFinite(marketRate)) {
      setValues((current) => ({
        ...current,
        tceTarget: marketRate,
      }));
    }
    setIndexWeekLabel(nextCache.weekLabel);
    setIsFetchingFearnleys(false);
  };

  const handleFetchBunker = async () => {
    if (isFetchingBunker) {
      return;
    }

    setIsFetchingBunker(true);
    setBunkerFetchError('');

    try {
      const response = await fetch('/api/get-bunker-prices');
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo obtener la cotización Bunkerindex.');
      }

      const nextCache: BunkerIndexCache = {
        vlsfo: Number(payload.vlsfo),
        ifo380: Number(payload.ifo380),
        mgo: Number(payload.mgo),
        date: getTodayBunkerLabel(),
      };

      if (!Number.isFinite(nextCache.vlsfo) || !Number.isFinite(nextCache.ifo380) || !Number.isFinite(nextCache.mgo)) {
        throw new Error('La respuesta de Bunkerindex no contiene precios válidos.');
      }

      setVlsfoPrice(nextCache.vlsfo);
      setIfoPrice(nextCache.ifo380);
      setMgoPrice(nextCache.mgo);
      setValues((current) => ({
        ...current,
        vlsfoPrice: nextCache.vlsfo,
        ifoPrice: nextCache.ifo380,
        mgoPrice: nextCache.mgo,
      }));
      setBunkerDateLabel(nextCache.date);
      setContractBunkerIndexBase((current) => current || getAverageBunkerIndexPrice(nextCache));
      window.localStorage.setItem(BUNKER_INDEX_DATA_KEY, JSON.stringify(nextCache));
    } catch (error) {
      setBunkerFetchError(error instanceof Error ? error.message : 'Error inesperado al consultar Bunkerindex.');
    } finally {
      setIsFetchingBunker(false);
    }
  };

  const handleRestoreMarketIndex = () => {
    setIsManualOverride(false);
    applyMarketRateFromCache(vesselCategory);
  };

  const handleToggleSync = () => {
    setIsSyncEnabled((current) => {
      if (!current) {
        syncFromSectionData();
      }
      return !current;
    });
  };

  const handleFinalizeVoyage = async () => {
    setSaveStatus('Guardando snapshot COA...');
    try {
      const snapshotPayload = {
        savedAt: new Date().toISOString(),
        voyage: {
          etaBaseRadar,
          etaFinalCalculada: etaBaseRadar,
        },
        bunkerIndex: {
          date: bunkerDateLabel || getTodayBunkerLabel(),
          vlsfo: vlsfoPrice,
          ifo380: ifoPrice,
          mgo: mgoPrice,
          average: results.marketBunkerIndexPrice,
          contractBaseAverage: results.bunkerIndexBase,
        },
        coa: {
          applyBunkerIndexAdjustment,
          variationThresholdPercent: BUNKER_INDEX_VARIATION_THRESHOLD_PERCENT,
          sharedAdjustmentFactor: BUNKER_INDEX_ADJUSTMENT_SHARE,
          contractShipments: results.contractShipments,
          ownerMarginPercent: results.ownerMarginPercent,
          chartererMarginPercent: results.chartererMarginPercent,
          bunkerVariationPct: results.bunkerVariationPct,
          sharedBunkerAdjustmentPct: results.sharedBunkerAdjustmentPct,
          scenarios: results.scenarios,
          targetPrice: results.suggestedChartererSale,
        },
      };
      const response = await fetch('/api/coa-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshotPayload),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        const archiveResponse = await fetch('/api/voyage-archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshotPayload),
        });
        const archivePayload = await archiveResponse.json().catch(() => ({}));
        if (!archiveResponse.ok || archivePayload?.success === false) {
          throw new Error(payload?.error || archivePayload?.error || 'No se pudo guardar el snapshot COA.');
        }
      }
      setSaveStatus('Viaje guardado correctamente');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'No se pudo guardar el viaje.');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black uppercase tracking-wide text-slate-900">
                      Calculadora Inversa de TCE
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Define el rendimiento objetivo y calcula el flete mínimo de negociación.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleSync}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] font-black uppercase tracking-wide shadow-sm transition ${
                      isSyncEnabled
                        ? 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-white'
                        : 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-white'
                    }`}
                    title={isSyncEnabled
                      ? 'Desbloquear costes para ajuste manual'
                      : 'Releer datos de la Sección 3 y bloquear de nuevo'}
                    aria-pressed={!isSyncEnabled}
                  >
                    <LockIcon open={!isSyncEnabled} />
                    {isSyncEnabled ? 'Auto sincronizado' : 'Ajuste manual'}
                  </button>
                  <button
                    type="button"
                    onClick={forceRefresh}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-900"
                    title="Reinicializar valores, recalcular flete central y repintar resultados"
                  >
                    <RefreshIcon />
                    Actualizar Cálculos
                  </button>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {isSyncEnabled
                    ? 'Costes y consumos se leen desde la Sección 3.'
                    : 'Los costes de la calculadora están desbloqueados para override manual.'}
                </p>
              </div>

              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-4 rounded-lg border border-blue-100 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-600">
                      Estrategia de Navegación
                    </h3>
                    {!isSyncEnabled ? (
                      <span className="text-[10px] font-black uppercase tracking-wide text-orange-700">
                        Manual: sin inyección automática
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                    {(['eco', 'full'] as const).map((strategyKey) => (
                      <button
                        key={strategyKey}
                        type="button"
                        onClick={() => setNavigationStrategy(strategyKey)}
                        aria-pressed={navigationStrategy === strategyKey}
                        className={`rounded-md px-3 py-2 text-xs font-black transition ${
                          navigationStrategy === strategyKey
                            ? 'bg-white text-blue-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {NAVIGATION_STRATEGIES[strategyKey].label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {navigationStrategy === 'eco'
                      ? 'Reduce consumo diario de mar y aumenta días de navegación.'
                      : 'Aplica consumo estándar y reduce días de navegación.'}
                  </p>
                </div>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-600">
                      BUNKER / COMBUSTIBLE
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleFetchBunker}
                    disabled={isFetchingBunker}
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isFetchingBunker ? 'Consultando...' : '✨ Consultar Bunkerindex IA'}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['vlsfoPrice', 'PRECIO VLSFO (MAR)', 'USD/t', vlsfoPrice],
                    ['ifoPrice', 'PRECIO IFO 380 (SCRUBBER)', 'USD/t', ifoPrice],
                    ['mgoPrice', 'PRECIO MGO (PUERTO)', 'USD/t', mgoPrice],
                  ].map(([key, label, suffix, priceValue]) => (
                    <div key={key}>
                      <label htmlFor={`reverse-${key}`} className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                        {label}
                      </label>
                      <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15">
                        <input
                          id={`reverse-${key}`}
                          type="number"
                          step="any"
                          value={priceValue}
                          disabled={isSyncEnabled}
                          onChange={(event) => updateBunkerPrice(key as 'vlsfoPrice' | 'ifoPrice' | 'mgoPrice', event.target.value)}
                          className={`min-w-0 flex-1 border-0 px-3 py-2.5 text-sm font-bold outline-none ${
                            isSyncEnabled
                              ? 'cursor-not-allowed bg-slate-50 text-slate-500'
                              : 'text-slate-900'
                          }`}
                        />
                        <span className="flex min-w-[5.75rem] items-center justify-center gap-1 border-l border-slate-200 bg-white px-2 text-[11px] font-bold uppercase text-slate-500">
                          {isSyncEnabled ? <LockIcon /> : null}
                          <span>{suffix}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className={`mt-2 text-xs italic ${bunkerFetchError ? 'text-red-500' : 'text-gray-500'}`}>
                  {bunkerFetchError || (bunkerDateLabel
                    ? `Datos registrados: ${bunkerDateLabel}`
                    : 'Esperando cotización del día...')}
                </p>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span>
                    <span className="block text-[11px] font-black uppercase tracking-wide text-slate-700">
                      Aplicar Ajuste BunkerIndex
                    </span>
                    <span className="block text-xs font-semibold text-slate-500">
                      Recalcula el Target Price si el promedio bunker varía {BUNKER_INDEX_VARIATION_THRESHOLD_PERCENT}% o más, compartiendo el 50% del riesgo.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={applyBunkerIndexAdjustment}
                    onChange={(event) => setApplyBunkerIndexAdjustment(event.target.checked)}
                    className="h-5 w-5 accent-teal-700"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {INPUTS.map((input) => {
                  const isTceTarget = input.key === 'tceTarget';
                  const isAutofilled = isSyncEnabled && SYNCED_REVERSE_FIELDS.has(input.key);

                  return (
                    <div key={input.key} className="block">
                      <label
                        htmlFor={`reverse-${input.key}`}
                        className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500"
                      >
                        {input.label}
                      </label>
                      <div className={isTceTarget ? 'space-y-2' : undefined}>
                        <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15">
                          <input
                            id={`reverse-${input.key}`}
                            type="number"
                            step="any"
                            value={values[input.key]}
                            onChange={(event) => updateValue(input.key, event.target.value)}
                            disabled={isAutofilled}
                            title={isAutofilled ? 'Sincronizado desde la Sección 3' : undefined}
                            className={`min-w-0 flex-1 border-0 px-3 py-2.5 text-sm font-bold outline-none ${
                              isAutofilled
                                ? 'cursor-not-allowed bg-slate-50 text-slate-500 ring-1 ring-inset ring-dashed ring-slate-300'
                                : 'text-slate-900'
                            }`}
                          />
                          <span className="flex min-w-[5.75rem] items-center justify-center gap-1 border-l border-slate-200 bg-slate-50 px-2 text-[11px] font-bold uppercase text-slate-500">
                            {isAutofilled ? <LockIcon /> : null}
                            <span>{input.suffix}</span>
                          </span>
                        </div>

                        {isTceTarget ? (
                          <div className="space-y-1.5">
                            {isManualOverride ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className="rounded-full border border-orange-200 bg-orange-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-orange-800">
                                  ⚠️ Índice Manual
                                </span>
                                <button
                                  type="button"
                                  onClick={handleRestoreMarketIndex}
                                  className="text-[11px] font-black uppercase tracking-wide text-indigo-700 underline-offset-2 hover:text-indigo-900 hover:underline"
                                >
                                  Restaurar Índice de Mercado
                                </button>
                              </div>
                            ) : null}
                            <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={handleFetchFearnleys}
                              disabled={isFetchingFearnleys}
                              className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition-all duration-200 hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isFetchingFearnleys
                                ? 'Consultando reporte...'
                                : '✨ Consultar Fearnleys IA'}
                            </button>
                            </div>
                            <p className="text-right text-xs italic text-gray-500">
                              {indexWeekLabel
                                ? `Datos: ${indexWeekLabel}`
                                : 'Esperando datos del índice...'}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-xl border border-teal-200 bg-teal-50 p-4 shadow-sm sm:p-5">
              <div className="mb-5 border-b border-teal-200 pb-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-700">
                  Resultados de Negociación
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Punto mínimo comercial</h3>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase text-slate-500">Flete mínimo</p>
                  <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                    {currencyFormatter.format(results.minFreightRate)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">USD / MT</p>
                  <p className="mt-2 text-xs font-bold text-orange-700">
                    Target protegido con escenario Pesimista +10% BunkerIndex.
                  </p>
                  <p className={`mt-2 text-xs font-bold ${hasScrubber ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {results.seaFuelStrategyLabel}
                  </p>
                  {results.etsTotalCost > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-gray-500">
                      Incluye recargo ETS: +{currencyFormatter.format(results.etsCostPerMt)} /MT
                    </p>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-gray-500">Sin exposición ETS</p>
                  )}
                </div>

                <div className={`rounded-lg border p-4 shadow-sm ${
                  results.isSuggestedSaleBelowTceTarget
                    ? 'border-red-300 bg-red-50'
                    : 'border-slate-200 bg-white'
                }`}>
                  <p className="text-xs font-bold uppercase text-slate-500">Motor de ventas sincronizado</p>
                  {results.isSuggestedSaleBelowTceTarget ? (
                    <p className="mt-2 rounded-md bg-red-100 px-2 py-1 text-xs font-black text-red-700">
                      Alerta: Venta por debajo del TCE Objetivo
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase text-slate-500">
                        Venta Sugerida Fletador (Target Price)
                      </p>
                      <input
                        type="number"
                        readOnly
                        value={results.suggestedChartererSale}
                        aria-label="Venta Sugerida Fletador"
                        className={`mt-1 w-full rounded-md border bg-white px-3 py-2 text-2xl font-black outline-none ${
                          results.isSuggestedSaleBelowTceTarget
                            ? 'border-red-200 text-red-700'
                            : 'border-emerald-200 text-emerald-700'
                        }`}
                      />
                      <p className="mt-1 text-xs font-bold text-slate-500">USD / MT</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Basado en Benchmark Mercado como TCE objetivo de la calculadora inversa.
                      </p>
                      {results.shouldApplyBunkerAdjustment ? (
                        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-black text-amber-800">
                          Ajuste BunkerIndex aplicado: {results.sharedBunkerAdjustmentPct.toFixed(2)}%
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPurchaseDetailsOpen((current) => !current)}
                      className="inline-flex items-center justify-between rounded-md border border-blue-200 bg-white px-3 py-2 text-left text-[11px] font-black uppercase text-blue-900 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-expanded={isPurchaseDetailsOpen}
                    >
                      <span>Ver detalles de compra</span>
                      <span aria-hidden="true">{isPurchaseDetailsOpen ? '▲' : '▼'}</span>
                    </button>
                    {isPurchaseDetailsOpen ? (
                      <div className={`rounded-lg border p-3 ${
                        results.isNegotiationMarginCritical
                          ? 'border-orange-300 bg-orange-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}>
                        {results.isNegotiationMarginCritical ? (
                          <p className="mb-3 rounded-md border border-orange-300 bg-orange-100 px-3 py-2 text-xs font-black uppercase text-orange-800">
                            Margen de negociación crítico
                          </p>
                        ) : null}
                        <div className="grid gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase text-slate-500">Benchmark Mercado / TCE objetivo</p>
                              <p className="text-xs font-bold text-slate-500">Base diaria usada por la Calculadora Inversa</p>
                            </div>
                            <p className="font-black text-slate-950">{wholeCurrencyFormatter.format(results.tceTarget)} /día</p>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[11px] font-black uppercase text-slate-500">Flete Mínimo Calculadora Inversa</p>
                            <p className="font-black text-slate-950">{currencyFormatter.format(results.minFreightRate)} /MT</p>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase text-blue-900">Flete Sugerido Armador (Compra)</p>
                              <p className="text-xs font-bold text-slate-500">Flete mínimo derivado del Benchmark × (1 + {results.ownerMarginPercent}%)</p>
                            </div>
                            <p className="font-black text-blue-900">{currencyFormatter.format(results.suggestedOwnerSale)} /MT</p>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase text-emerald-700">Venta Sugerida Fletador</p>
                              <p className="text-xs font-bold text-slate-500">Compra armador × (1 + {results.chartererMarginPercent}%)</p>
                            </div>
                            <p className="font-black text-emerald-700">{currencyFormatter.format(results.suggestedChartererSale)} /MT</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Escenarios BunkerIndex COA</p>
                      <p className="text-xs font-semibold text-slate-500">
                        Promedio actual: {currencyFormatter.format(results.marketBunkerIndexPrice)} /t
                      </p>
                    </div>
                    <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-black uppercase text-orange-800">
                      Seguridad: Pesimista
                    </span>
                  </div>
                  <div className="space-y-2">
                    {results.scenarios.map((scenario) => (
                      <div
                        key={scenario.label}
                        className={`rounded-md border px-3 py-2 text-xs ${
                          scenario.label.includes('Pesimista')
                            ? 'border-orange-300 bg-orange-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-black uppercase text-slate-700">{scenario.label}</span>
                          <span className="font-black text-slate-950">{currencyFormatter.format(scenario.targetPrice)} /MT</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 font-semibold text-slate-500">
                          <span>Break-even ponderado {currencyFormatter.format(scenario.breakEvenAverage)} /MT</span>
                          <span>{results.contractShipments} embarques · Bunker/viaje {wholeCurrencyFormatter.format(scenario.bunkerCost)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor="eta-base-radar-react" className="text-xs font-bold uppercase text-slate-500">
                      ETA BASE RADAR
                    </label>
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-black uppercase text-slate-600">
                      <LockIcon />
                      Derivado
                    </span>
                  </div>
                  <input
                    id="eta-base-radar-react"
                    type="date"
                    value={etaBaseRadar}
                    readOnly
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={handleFinalizeVoyage}
                    className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-black uppercase text-white shadow-sm transition hover:bg-slate-700"
                  >
                    Finalizar Viaje
                  </button>
                  {saveStatus ? (
                    <p className={`mt-2 text-xs font-bold ${saveStatus.includes('correctamente') ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {saveStatus}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase text-slate-500">Demurrage recomendado</p>
                    {results.isDemurrageRiskAdjusted ? (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-700"
                        title={`Ajustado por riesgo histórico: +${wholeCurrencyFormatter.format(results.demurrageRiskAdjustment)}/día (${results.demurrageRiskOverrunDays.toFixed(2)} d sobre laycan libre).`}
                        aria-label="Demurrage ajustado por riesgo histórico"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                    {wholeCurrencyFormatter.format(results.demurrageRate)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">USD / Día</p>
                  {results.isDemurrageRiskAdjusted ? (
                    <p className="mt-2 text-xs font-bold text-orange-700">
                      Base {wholeCurrencyFormatter.format(results.demurrageBase)} + riesgo {wholeCurrencyFormatter.format(results.demurrageRiskAdjustment)}/día
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase text-slate-500">Beneficio Armador</p>
                    <span
                      className="cursor-help text-xs font-black text-slate-400"
                      title={`El Beneficio Neto es el TCE Obtenido menos el OPEX fijo de ${wholeCurrencyFormatter.format(results.opexDaily)}/día.`}
                    >
                      i
                    </span>
                  </div>
                  <p className={`text-4xl font-bold tracking-tight ${results.netProfitDaily >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {wholeCurrencyFormatter.format(results.netProfitDaily)}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Beneficio Neto Diario: {wholeCurrencyFormatter.format(results.netProfitDaily)} / día
                  </p>
                  <p className="mt-3 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500">
                    TCE de Mercado: {wholeCurrencyFormatter.format(results.tceDaily)} / día (Total: {wholeCurrencyFormatter.format(results.tceTotal)})
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-3 rounded-lg border border-teal-200 bg-teal-100/60 p-3 text-xs">
                  <div>
                    <dt className="font-bold uppercase text-teal-800">Días totales</dt>
                    <dd className="mt-1 font-black text-slate-950">{results.totalDays.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold uppercase text-teal-800">Revenue target</dt>
                    <dd className="mt-1 font-black text-slate-950">
                      {wholeCurrencyFormatter.format(results.targetRevenue)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold uppercase text-teal-800">Embarques COA</dt>
                    <dd className="mt-1 font-black text-slate-950">{results.contractShipments}</dd>
                  </div>
                </dl>

                <div className="rounded-lg border border-teal-200 bg-white p-3 text-xs text-slate-600">
                  <p className="font-black uppercase text-teal-800">Desglose bunker</p>
                  <div className="mt-2 space-y-1 font-semibold">
                    <p>Coste Combustible Mar: {wholeCurrencyFormatter.format(results.seaFuelCost)}</p>
                    <p>Precio mar aplicado: {currencyFormatter.format(results.activeSeaFuelPrice)} /t</p>
                    <p>Coste Combustible Puerto: {wholeCurrencyFormatter.format(results.portFuelCost)}</p>
                    <p>Total bunker: {wholeCurrencyFormatter.format(results.bunkerCost)}</p>
                  </div>
                </div>
              </div>
            </aside>
    </div>
  );
}

export function CostPlusCalculator({
  cargoVolume,
  daysSea,
  daysPort,
  syncedCostData,
  currentMode = 'Cost-Plus',
  refreshSignal = 0,
}: CostPlusCalculatorProps) {
  const [values, setValues] = useState<CostPlusCalculatorState>(COST_PLUS_DEFAULT_VALUES);
  const [renderRefreshTick, setRenderRefreshTick] = useState(0);

  const results = useMemo(() => calculateCostPlusResults(values), [values, renderRefreshTick]);

  const routeSyncData = useMemo(() => {
    const routeDaysSea = safeNumber(daysSea);
    const routeDaysPort = safeNumber(daysPort);
    const routeTotalDays = safeNumber(syncedCostData?.totalDays);
    const routeDistance = safeNumber(syncedCostData?.distance);
    const routeCargoVolume = safeNumber(cargoVolume);
    const routeBunkerCost = safeNumber(syncedCostData?.bunkerCost)
      || safeNumber(syncedCostData?.estimatedBunkerCost);
    const routeTotalCosts = safeNumber(syncedCostData?.totalCosts);
    const routeDailyOpex = safeNumber(syncedCostData?.opexDaily);
    const syncedPortCosts = safeNumber(syncedCostData?.portCosts);
    const syncedTotalDays = routeDaysSea + routeDaysPort > 0 ? routeDaysSea + routeDaysPort : routeTotalDays;
    const routePortCosts = syncedPortCosts > 0
      ? syncedPortCosts
      : Math.max(0, routeTotalCosts - routeBunkerCost - (routeDailyOpex * syncedTotalDays));
    const hasRouteTiming = routeDaysSea > 0 || routeDaysPort > 0 || routeTotalDays > 0;

    if (!hasRouteTiming && routeDistance <= 0 && routeCargoVolume <= 0 && routeBunkerCost <= 0 && routePortCosts <= 0 && routeTotalCosts <= 0) {
      return null;
    }

    const nextValues: Partial<CostPlusCalculatorState> = {};

    if (routeDaysSea > 0) nextValues.daysSea = routeDaysSea;
    if (routeDaysPort > 0) nextValues.daysPort = routeDaysPort;
    if (routeDaysSea <= 0 && routeDaysPort <= 0 && routeTotalDays > 0) {
      nextValues.daysSea = routeTotalDays;
      nextValues.daysPort = 0;
    }
    if (routeCargoVolume > 0) nextValues.cargoVolume = routeCargoVolume;
    if (routeBunkerCost > 0) nextValues.bunkerCost = routeBunkerCost;
    if (routePortCosts > 0) nextValues.portCosts = routePortCosts;
    if (routeDailyOpex > 0) nextValues.dailyOpex = routeDailyOpex;

    return nextValues;
  }, [currentMode, cargoVolume, daysSea, daysPort, syncedCostData]);

  useEffect(() => {
    if (!routeSyncData) {
      return;
    }

    setValues((current) => ({
      ...current,
      ...routeSyncData,
    }));
  }, [routeSyncData]);

  const updateNumber = (key: CostPlusNumericField, nextValue: string) => {
    setValues((current) => ({
      ...current,
      [key]: nextValue === '' ? '' : Number(nextValue),
    }));
  };

  const handleSyncWithRoute = () => {
    if (!routeSyncData) {
      return;
    }

    setValues((current) => ({
      ...current,
      ...routeSyncData,
    }));
  };

  const forceRefresh = () => {
    setValues((current) => {
      const nextValues = {
        ...current,
        ...(routeSyncData || {}),
      };
      calculateCoreFreight(nextValues);
      return nextValues;
    });
    setRenderRefreshTick((current) => current + 1);
  };

  useEffect(() => {
    if (refreshSignal > 0) {
      forceRefresh();
    }
  }, [refreshSignal]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black uppercase tracking-wide text-slate-900">
              Cost-Plus Coaster
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Calcula el flete mínimo desde OPEX, costes directos y margen comercial.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncWithRoute}
              disabled={!routeSyncData}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-amber-800 shadow-sm transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              Sincronizar con Ruta
            </button>
            <button
              type="button"
              onClick={forceRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900"
              title="Reinicializar valores, recalcular flete central y repintar resultados"
            >
              <RefreshIcon />
              Actualizar Cálculos
            </button>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800">
              Modo Coaster: Cálculo Cost-Plus (OPEX)
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cost-plus-daily-opex" className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
              OPEX diario
            </label>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/15">
              <input id="cost-plus-daily-opex" type="number" step="any" value={values.dailyOpex} onChange={(event) => updateNumber('dailyOpex', event.target.value)} className="min-w-0 flex-1 border-0 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none" />
              <span className="flex min-w-[5.75rem] items-center justify-center border-l border-slate-200 bg-slate-50 px-2 text-[11px] font-bold uppercase text-slate-500">USD/día</span>
            </div>
          </div>

          <div>
            <label htmlFor="cost-plus-target-margin" className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
              Margen objetivo
            </label>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/15">
              <input id="cost-plus-target-margin" type="number" step="any" value={values.targetMargin} onChange={(event) => updateNumber('targetMargin', event.target.value)} className="min-w-0 flex-1 border-0 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none" />
              <div className="flex border-l border-slate-200 bg-slate-100 p-1">
                {(['fixed', 'percentage'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={values.marginType === type}
                    onClick={() => setValues((current) => ({ ...current, marginType: type }))}
                    className={`h-8 w-9 rounded-md text-sm font-black transition ${
                      values.marginType === type ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {type === 'fixed' ? '$' : '%'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {COST_PLUS_INPUTS.map(({ key, label, suffix }) => (
            <div key={key}>
              <label htmlFor={`cost-plus-${key}`} className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                {label}
              </label>
              <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/15">
                <input id={`cost-plus-${key}`} type="number" step="any" value={values[key]} onChange={(event) => updateNumber(key, event.target.value)} className="min-w-0 flex-1 border-0 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none" />
                <span className="flex min-w-[5.75rem] items-center justify-center border-l border-slate-200 bg-slate-50 px-2 text-[11px] font-bold uppercase text-slate-500">{suffix}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
        <div className="mb-5 border-b border-amber-200 pb-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
            Resultado Cost-Plus
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Flete mínimo operativo</h3>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500">Flete mínimo</p>
          <p className="mt-1 text-4xl font-black tracking-tight text-slate-950">
            {currencyFormatter.format(results.minFreightRate)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">USD / MT</p>
          <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm font-semibold text-gray-500">
            <p>Coste Total Riesgo: {wholeCurrencyFormatter.format(results.totalCosts)}</p>
            <p>Beneficio Neto Proyectado: {wholeCurrencyFormatter.format(results.calculatedMargin)}</p>
            <p>Demurrage ($/d): {wholeCurrencyFormatter.format(results.demurrageRate)}</p>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-amber-200 bg-amber-100/60 p-3 text-xs">
          <div>
            <dt className="font-bold uppercase text-amber-800">Días totales</dt>
            <dd className="mt-1 font-black text-slate-950">{results.totalDays.toFixed(1)}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase text-amber-800">OPEX total</dt>
            <dd className="mt-1 font-black text-slate-950">{wholeCurrencyFormatter.format(results.totalOpex)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

export function VesselPricingRouter({
  vesselDwt = 12000,
  cargoVolume,
  daysSea,
  daysPort,
  syncedCostData,
}: VesselPricingRouterProps) {
  const [localDwt, setLocalDwt] = useState(vesselDwt);
  const [hasScrubber, setHasScrubber] = useState(false);
  const [calculationRefreshSignal, setCalculationRefreshSignal] = useState(0);
  const previousModeRef = useRef<VesselCalculationMode | null>(null);

  useEffect(() => {
    setLocalDwt(vesselDwt);
  }, [vesselDwt]);

  const activeDwt = safeNumber(localDwt);
  const vesselClass = getVesselClass(activeDwt);
  const currentMode = vesselClass.type;
  const isReverseTceMode = currentMode === 'TCE Inverso';

  const forceRefresh = () => {
    setCalculationRefreshSignal((current) => current + 1);
  };

  useEffect(() => {
    if (previousModeRef.current === null) {
      previousModeRef.current = currentMode;
      return;
    }

    if (previousModeRef.current !== currentMode) {
      previousModeRef.current = currentMode;
      forceRefresh();
    }
  }, [currentMode]);

  const activeTiming = useMemo(() => {
    const sourceDaysSea = safeNumber(daysSea);
    const sourceDaysPort = safeNumber(daysPort);
    const syncedTotalDays = safeNumber(syncedCostData?.totalDays);

    if (sourceDaysSea > 0 || sourceDaysPort > 0) {
      return {
        daysSea: sourceDaysSea,
        daysPort: sourceDaysPort,
      };
    }

    if (syncedTotalDays > 0) {
      return {
        daysSea: syncedTotalDays,
        daysPort: 0,
      };
    }

    return {
      daysSea: undefined,
      daysPort: undefined,
    };
  }, [currentMode, daysSea, daysPort, syncedCostData]);

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            Router de pricing por DWT
          </p>
          <h1 className="mt-1 text-xl font-black text-slate-950">SeaCharter Core PRO</h1>
        </div>
        <label className="block min-w-[13rem]">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
            DWT buque
          </span>
          <input
            type="number"
            step="any"
            value={localDwt}
            onChange={(event) => setLocalDwt(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm font-black text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          />
        </label>
        <label className="flex min-w-[16rem] cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-600">
            ¿Equipado con Scrubber? (Permite IFO 380)
          </span>
          <input
            type="checkbox"
            checked={hasScrubber}
            onChange={(event) => setHasScrubber(event.target.checked)}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>
        <button
          type="button"
          onClick={forceRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-teal-800 shadow-sm transition hover:border-teal-500 hover:bg-teal-50"
          title="Reinicializar valores actuales, recalcular y repintar los paneles"
        >
          <RefreshIcon />
          Actualizar Cálculos
        </button>
      </div>

      <div className="mb-4 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-950 shadow-sm">
        ✅ Clase detectada: {vesselClass.categoryName} | Modo: {vesselClass.type}
      </div>

      {isReverseTceMode ? (
        <ReverseTceCalculator cargoVolume={cargoVolume} daysSea={activeTiming.daysSea} daysPort={activeTiming.daysPort} vesselCategory={vesselClass.categoryName} hasScrubber={hasScrubber} syncedCostData={syncedCostData} refreshSignal={calculationRefreshSignal} />
      ) : (
        <CostPlusCalculator cargoVolume={cargoVolume} daysSea={activeTiming.daysSea} daysPort={activeTiming.daysPort} syncedCostData={syncedCostData} currentMode={currentMode} refreshSignal={calculationRefreshSignal} />
      )}
    </section>
  );
}

export default function TceCalculatorWorkspace({
  cargoVolume,
  daysSea,
  daysPort,
}: ReverseTceCalculatorProps) {
  const [isReverseMode, setIsReverseMode] = useState(false);
  const [calculationRefreshSignal, setCalculationRefreshSignal] = useState(0);

  const forceRefresh = () => {
    setCalculationRefreshSignal((current) => current + 1);
  };

  const selectMode = (nextIsReverseMode: boolean) => {
    setIsReverseMode(nextIsReverseMode);
    forceRefresh();
  };

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
      <FleetIntelligenceLibraryPanel />

      <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
        <div
          className="grid w-full max-w-xl grid-cols-2 rounded-xl bg-slate-200/80 p-1"
          role="tablist"
          aria-label="Modo de cálculo TCE"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isReverseMode}
            onClick={() => selectMode(false)}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition-all duration-200 ${
              !isReverseMode
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Cálculo Estándar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isReverseMode}
            onClick={() => selectMode(true)}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition-all duration-200 ${
              isReverseMode
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Cálculo Inverso
          </button>
        </div>
        <button
          type="button"
          onClick={forceRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-teal-800 shadow-sm transition hover:border-teal-500 hover:bg-teal-50"
          title="Reinicializar valores actuales, recalcular y repintar los paneles"
        >
          <RefreshIcon />
          Actualizar Cálculos
        </button>
      </div>

      <div className="transition-opacity duration-200">
        {!isReverseMode ? (
          <div className="flex min-h-[22rem] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white/70 p-6 text-center">
            <p className="max-w-2xl font-mono text-sm text-slate-500">
              /* Aquí se montará el componente actual de SeaCharter de cálculo de viaje estándar */
            </p>
          </div>
        ) : (
          <ReverseTceCalculator cargoVolume={cargoVolume} daysSea={daysSea} daysPort={daysPort} refreshSignal={calculationRefreshSignal} />
        )}
      </div>
    </section>
  );
}
