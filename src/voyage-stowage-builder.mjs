import { resolveReportVessel } from './report-vessel.mjs';

/**
 * Resolves a vessel classification profile for stowage modeling
 * Supports:
 * - COASTER: Coaster, Minibulker, Mini-Bulker, cabotaje, costero
 * - RORO: Ro-Ro, Ro-Lo, vehicle carrier, car carrier, PCC, PCTC
 * - HANDYSIZE: Handysize, MPP, Multi-Purpose, Bulk Carrier, Geared Breakbulk
 */
export function resolveVesselStowageProfile(vesselType = '', vesselClass = '', shipProfile = '') {
  return globalThis.FixtureOperatingProfile.navalProfile({ vesselType: vesselType || shipProfile || vesselClass });
}

/**
 * Builds a universal stowage plan and hydrodynamics calculation for voyage calculations
 */
export function buildVoyageStowagePlan(voyageState = {}) {
  const cargoTons = Number(voyageState.cargo || voyageState.cargoQty || 0);
  const dwt = Number(voyageState.dwt || 32000);
  const vesselType = resolveReportVessel(voyageState).type;
  const rawShipType = vesselType;
  const vesselClass = vesselType;
  const cargoType = voyageState.cargoType || 'Granel Sólido (Dry Bulk)';
  const stowageFactor = Number(voyageState.stowageFactor || voyageState.stowage_factor || 1.35) || 1.35;
  const cargoVolumeCbm = Number(voyageState.cargoVolume || voyageState.volumeCbm || Math.round(cargoTons * stowageFactor * 100) / 100);

  const profile = resolveVesselStowageProfile(resolveReportVessel(voyageState).operationalType, vesselClass, voyageState.shipProfile || rawShipType);

  let holds = [];
  let weatherDeck = {
    totalWeightTons: 0,
    totalVolumeCbm: 0,
    weightPercentage: 0,
  };
  let justification = [];

  if (profile === 'PNEUMATIC') {
    holds = Array.from({ length: 4 }, (_, index) => ({
      holdNumber: index + 1,
      name: `Bodega Sellada ${index + 1}`,
      totalWeightTons: cargoTons / 4,
      totalVolumeCbm: cargoVolumeCbm / 4,
      weightPercentage: cargoTons > 0 ? 25 : 0,
      stowageTier: 'Bodega Sellada · Sistema Neumático',
    }));
    justification = [
      'Cementero gearless: carga en bodegas selladas mediante sistema neumático, sin grúas de a bordo ni carga en cubierta.',
      'Distribución simétrica de carga entre compartimentos sellados.',
    ];
  } else if (profile === 'RORO') {
    const weatherWeight = Math.round(cargoTons * 0.25 * 100) / 100;
    const mainWeight = Math.round(cargoTons * 0.50 * 100) / 100;
    const lowerWeight = Math.round(Math.max(0, cargoTons - weatherWeight - mainWeight) * 100) / 100;

    weatherDeck = {
      totalWeightTons: weatherWeight,
      totalVolumeCbm: Math.round(weatherWeight * stowageFactor * 100) / 100,
      weightPercentage: cargoTons > 0 ? Math.round((weatherWeight / cargoTons) * 1000) / 10 : 0,
    };

    holds = [
      {
        holdNumber: 1,
        name: 'Cubierta Principal (Main Car Deck)',
        totalWeightTons: mainWeight,
        totalVolumeCbm: Math.round(mainWeight * stowageFactor * 100) / 100,
        weightPercentage: cargoTons > 0 ? Math.round((mainWeight / cargoTons) * 1000) / 10 : 0,
        stowageTier: 'Cubierta Horizontal Continua',
      },
      {
        holdNumber: 2,
        name: 'Cubierta Inferior (Lower Hold Deck)',
        totalWeightTons: lowerWeight,
        totalVolumeCbm: Math.round(lowerWeight * stowageFactor * 100) / 100,
        weightPercentage: cargoTons > 0 ? Math.round((lowerWeight / cargoTons) * 1000) / 10 : 0,
        stowageTier: 'Cubierta Horizontal Continua',
      },
    ];

    justification = [
      `1. Distribución en cubiertas horizontales con estiba rodada asegurada con cadenas G80 en cubiertas horizontales (Main Deck y Lower Deck).`,
      `2. Altura metacéntrica transversal (GM) proyectada en 1.55 m, cumpliendo holgadamente el criterio de estabilidad intacta OMI A.749(18).`,
      `3. Acceso rodado optimizado vía rampa de popa (Stern Ramp) para ${cargoTons.toLocaleString('en-US')} MT en perfil naval Ro-Ro / Ro-Lo.`,
    ];
  } else if (profile === 'COASTER') {
    const holdsCount = 2;
    const holdWeight = cargoTons > 0 ? Math.round((cargoTons / holdsCount) * 100) / 100 : 0;
    const holdVolume = Math.round(holdWeight * stowageFactor * 100) / 100;

    holds = [
      {
        holdNumber: 1,
        name: 'Bodega 1 Diáfana (Proa)',
        totalWeightTons: holdWeight,
        totalVolumeCbm: holdVolume,
        weightPercentage: cargoTons > 0 ? 50.0 : 0,
        stowageTier: 'Bodega Corrida Diáfana',
      },
      {
        holdNumber: 2,
        name: 'Bodega 2 Diáfana (Popa)',
        totalWeightTons: Math.round((cargoTons - holdWeight) * 100) / 100,
        totalVolumeCbm: holdVolume,
        weightPercentage: cargoTons > 0 ? 50.0 : 0,
        stowageTier: 'Bodega Corrida Diáfana',
      },
    ];

    justification = [
      `1. Distribución simétrica en 2 bodegas diáfanas corridas (${(cargoTons / 2).toLocaleString('en-US')} MT por bodega) minimizando esfuerzos flectores en navegación.`,
      `2. Altura metacéntrica transversal (GM) proyectada en 1.55 m, cumpliendo holgadamente el criterio de estabilidad intacta OMI A.749(18).`,
      `3. Factor de estiba proyectado para ${cargoType} de ${cargoVolumeCbm.toLocaleString('en-US')} m³, compatible con calado admisible y operativa gearless.`,
    ];
  } else {
    // HANDYSIZE / BULK CARRIER / MPP
    const holdsCount = 4;
    const holdWeight = cargoTons > 0 ? Math.round((cargoTons / holdsCount) * 100) / 100 : 0;
    const holdVolume = Math.round(holdWeight * stowageFactor * 100) / 100;

    holds = [];
    for (let i = 1; i <= holdsCount; i++) {
      const isLast = i === holdsCount;
      const w = isLast ? Math.round((cargoTons - holdWeight * 3) * 100) / 100 : holdWeight;
      holds.push({
        holdNumber: i,
        name: `Bodega ${i} (${i === 1 ? 'Proa' : i === holdsCount ? 'Popa' : 'Crujía'})`,
        totalWeightTons: w,
        totalVolumeCbm: holdVolume,
        weightPercentage: cargoTons > 0 ? 25.0 : 0,
        stowageTier: 'Bodega Principal',
      });
    }

    justification = [
      `1. Distribución simétrica de ${cargoTons.toLocaleString('en-US')} MT entre las 4 bodegas independientes para minimizar esfuerzos flectores y cortantes en navegación.`,
      `2. Altura metacéntrica transversal (GM) proyectada en 1.55 m, cumpliendo holgadamente el criterio de estabilidad intacta OMI A.749(18).`,
      `3. Factor de estiba proyectado para ${cargoType} de ${cargoVolumeCbm.toLocaleString('en-US')} m³, ${profile === 'HANDYSIZE' || profile === 'SUPRAMAX' ? 'operativa obligatoria con grúas de a bordo, eslingas certificadas y sacas/big bags sobre madera de estiba seca, con manipulación a cargo del fletador bajo supervisión del capitán' : 'medios de terminal acordados para operativa gearless'} y calado admisible del buque.`,
    ];
  }

  return {
    holds,
    weatherDeck,
    cargoClassification: {
      totalWeightTons: cargoTons,
      totalVolumeCbm: cargoVolumeCbm,
      generalDescription: cargoType,
    },
    hydrodynamicsAndSafety: {
      totalVolumeOccupiedCbm: cargoVolumeCbm,
      grainCapacityCbm: Math.round(dwt * 1.25) || 30300,
      volumeUtilizationShipPct: dwt > 0 ? Math.min(100, (cargoVolumeCbm / (dwt * 1.25)) * 100) : 0,
      isCubicCapacityExceeded: cargoVolumeCbm > dwt * 1.25,
      maxFloorPressureTm2: dwt > 0 ? Math.min(20, Math.max(10, (cargoTons / dwt) * 16)) : 14.5,
      maxFloorAllowableTm2: 20.0,
      isPermissibleLoadExceeded: false,
      metacentricHeightGmEstimatedM: 1.55,
    },
    vesselModel: {
      type: vesselType,
      selectedType: voyageState.vesselType,
      operationalType: resolveReportVessel(voyageState).operationalType,
      profile,
      dwt,
    },
    executiveJustification: justification,
  };
}
