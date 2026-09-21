/**
 * defaultProviderTariffs.js
 * Motor de cálculo financiero y modelos para el Gestor Universal de Tarifas en SeaCharter Core PRO.
 *
 * ESPECIFICACIONES CRÍTICAS:
 * 1. Eliminación Absoluta de Entidades Hardcodeadas:
 *    - La lista DEFAULT_PROVIDER_TARIFFS se exporta como un arreglo vacío ([]),
 *      garantizando que el selector inicie completamente limpio y solo registre entidades
 *      subidas o añadidas explícitamente por el usuario.
 * 2. Motor Financiero Exacto:
 *    - Precio Base en DZD * Rabais = Precio Neto en DZD
 *    - Conversión a USD según Tipo de Cambio (default: 134.50 DZD/USD)
 *    - Estructura Aditiva Estricta: (Neto USD + Envase + Logística + SGS + Tasas Bejaia)
 * 3. Selector de Opción FSPE (Con FSPE / Sin FSPE):
 *    - Con FSPE (Subvencionado): Utiliza el coste logístico reducido de fábrica (subvención estatal).
 *    - Sin FSPE (Mercado): Reemplaza dicho coste por la tarifa real de mercado calculada por Land Charter.
 * 4. Selector de Modalidad Comercial (FOB vs. EXW) con Antiduplicidad.
 * 5. Absorción Automática del Tonelaje del Proyecto (ej. 10.000 MT).
 */

export const OFFICIAL_EXCHANGE_RATE_DZD_USD = 134.50;

// Lista de entidades completamente vacía al iniciar (sin Tavcim, Lalangue ni entidades precargadas)
export const DEFAULT_PROVIDER_TARIFFS = [];

/**
 * Motor de cálculo financiero exacto:
 * @param {Object} item - Ítem de material con campos de precio y logística
 * @param {Object} overrides - Opciones y sobrescrituras:
 *   - commercialModality: 'FOB' | 'EXW'
 *   - useFspe: boolean (true = Con FSPE / subvencionado, false = Sin FSPE / mercado)
 *   - marketInlandCostPerMt: number (tarifa de mercado Land Charter o de fila Excel, default: 0)
 *   - exchangeRateDzdUsd: number (default: 134.50)
 *   - quantityMT / projectWeightTons: number (default: 10000)
 */
export function calculateTariffBreakdown(item = {}, overrides = {}) {
  const exchangeRateDzdUsd = Number(overrides.exchangeRateDzdUsd ?? item.exchangeRateDzdUsd ?? OFFICIAL_EXCHANGE_RATE_DZD_USD) || OFFICIAL_EXCHANGE_RATE_DZD_USD;
  const commercialModality = String(overrides.commercialModality || 'FOB').toUpperCase(); // 'FOB' | 'EXW'
  const useFspe = overrides.useFspe !== undefined ? Boolean(overrides.useFspe) : (item.useFspe !== undefined ? Boolean(item.useFspe) : true);

  let basePriceDzd = 0;
  let rabaisMultiplier = 1.0;
  let netPriceDzd = 0;
  let netMaterialCost = 0;
  let baseMaterialCost = 0;
  let rabais = 0;

  // Comprobar si se está utilizando cálculo en DZD o si viene especificado
  if (overrides.basePriceDzd !== undefined || overrides.rabaisMultiplier !== undefined || (item.basePriceDzd && overrides.baseMaterialCost === undefined)) {
    basePriceDzd = Number(overrides.basePriceDzd ?? item.basePriceDzd ?? 0);
    const rawMultiplier = overrides.rabaisMultiplier !== undefined
      ? Number(overrides.rabaisMultiplier)
      : (item.rabaisMultiplier !== undefined
          ? Number(item.rabaisMultiplier)
          : (overrides.rabais !== undefined ? Number(overrides.rabais) : 1.0));
    
    if (rawMultiplier > 0 && rawMultiplier <= 1) {
      rabaisMultiplier = rawMultiplier;
    } else if (rawMultiplier > 1 && rawMultiplier <= 100) {
      rabaisMultiplier = Math.round((100 - rawMultiplier) / 100 * 10000) / 10000;
    } else {
      rabaisMultiplier = 1.0;
    }

    netPriceDzd = Math.round(basePriceDzd * rabaisMultiplier * 100) / 100;
    netMaterialCost = Math.round((netPriceDzd / exchangeRateDzdUsd) * 100) / 100;
    baseMaterialCost = Math.round((basePriceDzd / exchangeRateDzdUsd) * 100) / 100;
    rabais = Math.round((baseMaterialCost - netMaterialCost) * 100) / 100;
  } else {
    // Modo directo en USD
    baseMaterialCost = Number(overrides.baseMaterialCost ?? item.baseMaterialCost ?? 0);
    const rawRabais = Number(overrides.rabais ?? item.rabais ?? 0);
    
    if (rawRabais > 0 && rawRabais <= 1) {
      rabaisMultiplier = rawRabais;
      netMaterialCost = Math.round(baseMaterialCost * rabaisMultiplier * 100) / 100;
      rabais = Math.round((baseMaterialCost - netMaterialCost) * 100) / 100;
    } else {
      rabais = rawRabais;
      netMaterialCost = Math.max(0, Math.round((baseMaterialCost - rabais) * 100) / 100);
      rabaisMultiplier = baseMaterialCost > 0 ? Math.round((netMaterialCost / baseMaterialCost) * 10000) / 10000 : 1.0;
    }

    basePriceDzd = Math.round(baseMaterialCost * exchangeRateDzdUsd * 100) / 100;
    netPriceDzd = Math.round(netMaterialCost * exchangeRateDzdUsd * 100) / 100;
  }

  // Costes complementarios
  const packagingCost = Number(overrides.packagingCost ?? item.packagingCost ?? 0);
  
  // 3. SELECTOR DE OPCIÓN FSPE (Con FSPE / Sin FSPE)
  // Con FSPE: se usa el coste subvencionado de fábrica ('Coût Logistique FSPE')
  // Sin FSPE: se lee estrictamente la columna de mercado ('Coût Logística Marché (Sans FSPE)') de la fila o se integra con Land Charter
  // Prohibición absoluta de 12.50 fijo o inventado
  const factoryInlandTransport = Number(overrides.inlandTransport !== undefined ? overrides.inlandTransport : (item.inlandTransport !== undefined ? item.inlandTransport : 0));
  const marketInlandCostPerMt = Number(
    overrides.marketInlandCostPerMt !== undefined && overrides.marketInlandCostPerMt !== null
      ? overrides.marketInlandCostPerMt
      : (item.marketInlandCostPerMt !== undefined && item.marketInlandCostPerMt !== null && Number(item.marketInlandCostPerMt) > 0
          ? item.marketInlandCostPerMt
          : (overrides.landCharterRateUsdMt || 0))
  );

  const inlandTransport = useFspe
    ? factoryInlandTransport
    : marketInlandCostPerMt;

  const bejaiaPortDues = Number(overrides.bejaiaPortDues !== undefined ? overrides.bejaiaPortDues : (item.bejaiaPortDues !== undefined ? item.bejaiaPortDues : 0));
  const sgsInspection = Number(overrides.sgsInspection !== undefined ? overrides.sgsInspection : (item.sgsInspection !== undefined ? item.sgsInspection : 0));
  const otherCosts = Number(overrides.otherCosts !== undefined ? overrides.otherCosts : (item.otherCosts !== undefined ? item.otherCosts : 0));

  // En FOB: Suma aditiva lineal (Neto USD + Envase + Logística [FSPE o Mercado] + Tasas + SGS + Otros)
  // En EXW: Solo coste neto en planta + Envase
  const effectiveInlandTransport = commercialModality === 'FOB' ? inlandTransport : 0;
  const effectiveBejaiaPortDues = commercialModality === 'FOB' ? bejaiaPortDues : 0;
  const effectiveSgsInspection = commercialModality === 'FOB' ? sgsInspection : 0;
  const effectiveOtherCosts = commercialModality === 'FOB' ? otherCosts : 0;

  const totalUnitCost = Math.round((netMaterialCost + packagingCost + effectiveInlandTransport + effectiveBejaiaPortDues + effectiveSgsInspection + effectiveOtherCosts) * 100) / 100;
  const totalFobCost = Math.round((netMaterialCost + packagingCost + inlandTransport + bejaiaPortDues + sgsInspection + otherCosts) * 100) / 100;

  let commercialMargin = Number(overrides.commercialMargin !== undefined ? overrides.commercialMargin : (item.commercialMargin !== undefined ? item.commercialMargin : 0));
  let suggestedSalePrice = Number(overrides.suggestedFobSalePrice !== undefined ? overrides.suggestedFobSalePrice : (item.suggestedFobSalePrice !== undefined ? item.suggestedFobSalePrice : 0));

  if (commercialModality === 'EXW') {
    if (overrides.suggestedFobSalePrice === undefined && suggestedSalePrice === 0) {
      suggestedSalePrice = Math.round((totalUnitCost + commercialMargin) * 100) / 100;
    }
  } else {
    // FOB
    if (overrides.suggestedFobSalePrice !== undefined && overrides.commercialMargin === undefined) {
      commercialMargin = Math.round((suggestedSalePrice - totalUnitCost) * 100) / 100;
    } else if (overrides.commercialMargin !== undefined && overrides.suggestedFobSalePrice === undefined) {
      suggestedSalePrice = Math.round((totalUnitCost + commercialMargin) * 100) / 100;
    } else if (suggestedSalePrice === 0) {
      suggestedSalePrice = Math.round((totalUnitCost + commercialMargin) * 100) / 100;
    }
  }

  // Tonelaje adsorbido automáticamente del proyecto activo (o valor manual)
  const quantityMT = Math.max(1, Number(overrides.quantityMT ?? overrides.projectWeightTons ?? item.defaultQuantityMT ?? 10000));
  
  // Totales de la partida
  const totalCostSum = Math.round(totalUnitCost * quantityMT * 100) / 100;
  const totalSaleSum = Math.round(suggestedSalePrice * quantityMT * 100) / 100;
  const totalProfitSum = Math.round((totalSaleSum - totalCostSum) * 100) / 100;
  const marginPercentage = totalUnitCost > 0 ? Math.round(((suggestedSalePrice - totalUnitCost) / totalUnitCost) * 1000) / 10 : 0;

  return {
    commercialModality,
    useFspe,
    factoryInlandTransport,
    marketInlandCostPerMt,
    basePriceDzd,
    rabaisMultiplier,
    netPriceDzd,
    exchangeRateDzdUsd,
    baseMaterialCost,
    rabais,
    netMaterialCost,
    packagingCost,
    inlandTransport,
    bejaiaPortDues,
    sgsInspection,
    otherCosts,
    totalUnitCost,
    totalFobCost,
    commercialMargin,
    suggestedFobSalePrice: suggestedSalePrice,
    suggestedSalePrice,
    quantityMT,
    totalFobCostSum: totalCostSum,
    totalFobSaleSum: totalSaleSum,
    totalCostSum,
    totalSaleSum,
    totalProfitSum,
    marginPercentage
  };
}
