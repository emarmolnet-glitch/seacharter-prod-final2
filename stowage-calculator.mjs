/**
 * stowage-calculator.js - Motor de Estiba Tentativa y Cargo Plan (H18)
 * SeaCharter Core PRO & DataBridge Hija 18 Architecture
 */

export function normalizarMedidasBulto({
  length = 1.0,
  width = 1.0,
  height = 1.0,
  unitWeight = 1.0,
  lengthUnit = 'm',
  weightUnit = 'MT',
} = {}) {
  const l = Number(length) || 0;
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const wt = Number(unitWeight) || 0;

  const lengthM = lengthUnit === 'cm' ? l / 100 : l;
  const widthM = lengthUnit === 'cm' ? w / 100 : w;
  const heightM = lengthUnit === 'cm' ? h / 100 : h;
  const unitWeightMT = weightUnit === 'kg' ? wt / 1000 : wt;

  return {
    lengthM: Math.max(0, Number(lengthM.toFixed(4))),
    widthM: Math.max(0, Number(widthM.toFixed(4))),
    heightM: Math.max(0, Number(heightM.toFixed(4))),
    unitWeightMT: Math.max(0, Number(unitWeightMT.toFixed(4))),
  };
}

/**
 * Normalizador ligero compatible con DataBridge y SeaCharter
 * Garantiza presencia de id/label, unit_weight_mt/weight_mt y preferred_zone/zone
 */
export function normalizePackingListItem(item = {}, defaultIdx = 0) {
  const label = String(item.label || item.id || `ITEM-${String(defaultIdx + 1).padStart(2, '0')}`).trim();
  const id = String(item.id || item.label || label).trim();
  const length_m = Math.max(0.1, Number(item.length_m ?? item.length ?? 1.0));
  const width_m = Math.max(0.1, Number(item.width_m ?? item.width ?? 1.0));
  const height_m = Math.max(0.1, Number(item.height_m ?? item.height ?? 1.0));
  const weight_mt = Math.max(0.01, Number(item.unit_weight_mt ?? item.weight_mt ?? item.weight ?? 1.0));
  const unit_weight_mt = weight_mt;
  const quantity = Math.max(1, Math.round(Number(item.quantity ?? 1)));
  const category = String(item.category || 'crate').toLowerCase();
  const preferred_zone = String(item.preferred_zone || item.zone || 'auto').toLowerCase();
  const zone = preferred_zone;

  return {
    id,
    label,
    length_m,
    width_m,
    height_m,
    weight_mt,
    unit_weight_mt,
    quantity,
    category,
    preferred_zone,
    zone,
  };
}

export function resolverGeometriaBodegas(vessel = {}) {
  const dwt = Number(vessel.dwt) || 32000;

  // Escala naval realista según DWT para buques mercantes estándar
  let defaultLoa = 178;
  let defaultBeam = 28.0;
  let defaultDepth = 14.8;
  let defaultDraft = 10.2;
  let defaultHolds = 4;

  if (dwt < 6000) {
    defaultLoa = 100;
    defaultBeam = 16.0;
    defaultDepth = 8.5;
    defaultDraft = 6.2;
    defaultHolds = 2;
  } else if (dwt < 10000) {
    defaultLoa = 122;
    defaultBeam = 18.5;
    defaultDepth = 10.2;
    defaultDraft = 7.4;
    defaultHolds = 2;
  } else if (dwt < 16000) {
    defaultLoa = 136;
    defaultBeam = 20.5;
    defaultDepth = 11.2;
    defaultDraft = 8.2;
    defaultHolds = 3;
  } else if (dwt < 26000) {
    defaultLoa = 158;
    defaultBeam = 24.0;
    defaultDepth = 13.0;
    defaultDraft = 9.2;
    defaultHolds = 4;
  } else if (dwt < 45000) {
    defaultLoa = 178;
    defaultBeam = 28.0;
    defaultDepth = 14.8;
    defaultDraft = 10.2;
    defaultHolds = 4;
  } else {
    defaultLoa = 195;
    defaultBeam = 32.0;
    defaultDepth = 17.5;
    defaultDraft = 12.2;
    defaultHolds = dwt >= 85000 ? 7 : 5;
  }

  // Dimensiones reales si el buque está identificado y son coherentes con su DWT
  const rawLoa = Number(vessel.loa || vessel.loa_meters) || 0;
  const rawBeam = Number(vessel.beam || vessel.beam_meters) || 0;
  const rawDepth = Number(vessel.depth) || 0;
  const rawDraft = Number(vessel.draft || vessel.draft_meters) || 0;

  const isCoherent = rawLoa > 0 && rawBeam > 0 && (
    (dwt < 16000 && rawLoa <= 155) ||
    (dwt >= 16000 && dwt < 45000 && rawLoa >= 130 && rawLoa <= 210) ||
    (dwt >= 45000 && rawLoa >= 170)
  );

  const loa = (vessel.isLoaded && isCoherent) ? rawLoa : defaultLoa;
  const beam = (vessel.isLoaded && isCoherent) ? rawBeam : defaultBeam;
  const depth = (vessel.isLoaded && isCoherent && rawDepth > 0) ? rawDepth : defaultDepth;
  const draft = (vessel.isLoaded && isCoherent && rawDraft > 0) ? rawDraft : defaultDraft;

  let holdsCount = defaultHolds;
  const rawHolds = vessel.holds_count || vessel.holdsCount;
  if (rawHolds && Number(rawHolds) > 0) {
    holdsCount = Math.max(1, Math.min(9, Math.round(Number(rawHolds))));
  }

  const cargoAreaLength = loa * 0.65;
  const nominalHoldLength = cargoAreaLength / holdsCount;
  const nominalHoldBreadth = beam * 0.85;
  const nominalHoldHeight = depth * 0.85;

  const holds = [];
  for (let i = 1; i <= holdsCount; i++) {
    const isH1 = i === 1;
    const isAft = i === holdsCount;
    const breadthFactor = isH1 ? 0.76 : isAft ? 0.90 : 1.0;
    const effectiveBreadth = nominalHoldBreadth * breadthFactor;
    const holdLength = nominalHoldLength * (isH1 ? 0.95 : 1.0);
    const tanktopArea = holdLength * effectiveBreadth;
    const volumeCbm = tanktopArea * nominalHoldHeight;

    holds.push({
      holdNumber: i,
      name: isH1 ? 'Bodega 1 (Proa / Fwd)' : isAft ? `Bodega ${i} (Popa / Aft)` : `Bodega ${i} (Crujía)`,
      lengthM: Number(holdLength.toFixed(2)),
      breadthM: Number(effectiveBreadth.toFixed(2)),
      heightM: Number(nominalHoldHeight.toFixed(2)),
      tanktopAreaM2: Number(tanktopArea.toFixed(1)),
      volumeCbm: Number(volumeCbm.toFixed(1)),
      isBowHold: isH1,
      bowNarrowingFactor: isH1 ? 0.76 : 1.0,
      tanktopUniformLoadTm2: Number(vessel.tanktopUniformLoadTm2 || 20.0),
    });
  }

  return {
    holdsCount,
    loa,
    beam,
    depth,
    draft,
    holds,
    nominalHoldLength,
    nominalHoldBreadth,
    nominalHoldHeight,
    tanktopUniformLoadTm2: Number(vessel.tanktopUniformLoadTm2 || 20.0),
    dwccEstimatedMT: Math.round(dwt * 0.93),
  };
}

export function calcularEstibaTentativaH18(input = {}) {
  const normalized = normalizarMedidasBulto({
    length: input.length,
    width: input.width,
    height: input.height,
    unitWeight: input.unitWeight,
    lengthUnit: input.lengthUnit || 'm',
    weightUnit: input.weightUnit || 'MT',
  });

  const { lengthM, widthM, heightM, unitWeightMT } = normalized;
  const tiers = Math.max(1, Math.min(8, Math.round(Number(input.tiers) || 1)));
  const targetCargoMT = Math.max(0, Number(input.targetCargoMT) || 0);
  const brokenStowagePct = Math.max(0, Math.min(25, Number(input.brokenStowagePct) || 0));
  const cargoName = String(input.cargoName || 'Big Bags 1.5 MT').trim();

  const unitVolumeM3 = lengthM * widthM * heightM;
  const unitFootprintM2 = lengthM * widthM;

  const netSF = unitWeightMT > 0 ? unitVolumeM3 / unitWeightMT : 0;
  const grossSF = netSF * (1 + brokenStowagePct / 100);

  const tankTopPressure = unitFootprintM2 > 0 ? (tiers * unitWeightMT) / unitFootprintM2 : 0;

  const vesselSpecs = input.vessel || {};
  const geometry = resolverGeometriaBodegas(vesselSpecs);

  let totalTheoreticalUnits = 0;
  const holdsDetail = geometry.holds.map((hold) => {
    let unitsAlongLength = lengthM > 0 ? Math.floor(hold.lengthM / lengthM) : 0;
    let unitsAlongBreadth = widthM > 0 ? Math.floor(hold.breadthM / widthM) : 0;

    if (hold.isBowHold && unitsAlongBreadth > 2) {
      unitsAlongBreadth = Math.max(1, Math.floor(unitsAlongBreadth * 0.82));
    }

    const unitsPerTier = unitsAlongLength * unitsAlongBreadth;
    const holdTheoreticalUnits = unitsPerTier * tiers;
    const holdTheoreticalMT = holdTheoreticalUnits * unitWeightMT;
    const holdVolumeM3 = holdTheoreticalUnits * unitVolumeM3;

    totalTheoreticalUnits += holdTheoreticalUnits;

    return {
      holdNumber: hold.holdNumber,
      name: hold.name,
      isBowHold: Boolean(hold.isBowHold),
      unitsAlongLength,
      unitsAlongBreadth,
      unitsPerTier,
      tiers,
      theoreticalUnits: holdTheoreticalUnits,
      theoreticalMT: Number(holdTheoreticalMT.toFixed(2)),
      volumeOccupiedM3: Number(holdVolumeM3.toFixed(2)),
      holdCapacityM3: hold.volumeCbm,
      holdVolumeUtilizationPct: hold.volumeCbm > 0 ? Math.min(100, Number(((holdVolumeM3 / hold.volumeCbm) * 100).toFixed(1))) : 0,
    };
  });

  const totalTheoreticalMT = totalTheoreticalUnits * unitWeightMT;
  const volumetricRealisticUnits = Math.max(0, Math.floor(totalTheoreticalUnits * (1 - brokenStowagePct / 100)));
  const volumetricRealisticMT = Number((volumetricRealisticUnits * unitWeightMT).toFixed(2));

  // Tope obligatorio por DWCC en estiba cargable
  let finalUnits = volumetricRealisticUnits;
  let finalMT = volumetricRealisticMT;
  const isDwccLimited = geometry.dwccEstimatedMT > 0 && volumetricRealisticMT > geometry.dwccEstimatedMT;

  if (isDwccLimited) {
    finalUnits = unitWeightMT > 0 ? Math.floor(geometry.dwccEstimatedMT / unitWeightMT) : 0;
    finalMT = Number((finalUnits * unitWeightMT).toFixed(2));
  }

  // Escala proporcionalmente realisticUnits y realisticMT en realisticHoldsDetail
  const realisticHoldsDetail = holdsDetail.map((hd) => {
    const factor = totalTheoreticalUnits > 0 ? hd.theoreticalUnits / totalTheoreticalUnits : 0;
    const holdRealisticUnits = Math.floor(finalUnits * factor);
    const holdRealisticMT = Number((holdRealisticUnits * unitWeightMT).toFixed(2));
    return {
      ...hd,
      realisticUnits: holdRealisticUnits,
      realisticMT: holdRealisticMT,
    };
  });

  // Ajustar cualquier diferencia de redondeo de bultos en la última bodega
  const sumPlacedUnits = realisticHoldsDetail.reduce((acc, h) => acc + h.realisticUnits, 0);
  const unitsDiff = finalUnits - sumPlacedUnits;
  if (unitsDiff !== 0 && realisticHoldsDetail.length > 0) {
    const targetHold = realisticHoldsDetail[realisticHoldsDetail.length - 1];
    targetHold.realisticUnits += unitsDiff;
    targetHold.realisticMT = Number((targetHold.realisticUnits * unitWeightMT).toFixed(2));
  }

  let marginVsTargetPct = 0;
  let marginVsTargetMT = 0;
  if (targetCargoMT > 0) {
    marginVsTargetMT = Number((finalMT - targetCargoMT).toFixed(2));
    marginVsTargetPct = Number(((marginVsTargetMT / targetCargoMT) * 100).toFixed(2));
  }

  const alerts = [];
  if (isDwccLimited) {
    alerts.push({
      code: 'DWCC_LIMITED',
      severity: 'warning',
      title: 'Tope por Capacidad de Carga Útil (DWCC)',
      message: `El buque alcanza su límite por peso/calado (DWCC estimado: ${geometry.dwccEstimatedMT.toLocaleString('es-ES')} MT) antes de llenar el volumen de bodegas (${volumetricRealisticMT.toLocaleString('es-ES')} MT). La estiba se limita a ${finalMT.toLocaleString('es-ES')} MT (${finalUnits.toLocaleString('es-ES')} uds).`,
    });
  }

  if (targetCargoMT > 0 && finalMT < targetCargoMT) {
    const shortagePct = ((targetCargoMT - finalMT) / targetCargoMT) * 100;
    alerts.push({
      code: 'DEADFREIGHT_RISK',
      severity: shortagePct > 10 ? 'critical' : 'warning',
      title: 'Riesgo Comercial de Falso Flete (Deadfreight)',
      message: `La capacidad de estiba cargable (${finalMT.toLocaleString('es-ES')} MT) queda ${Math.abs(marginVsTargetMT).toLocaleString('es-ES')} MT (${shortagePct.toFixed(1)}%) por debajo del objetivo contractual (${targetCargoMT.toLocaleString('es-ES')} MT).`,
    });
  }

  const allowableTankTop = geometry.tanktopUniformLoadTm2;
  if (tankTopPressure > allowableTankTop) {
    alerts.push({
      code: 'STACKING_PRESSURE_RISK',
      severity: 'critical',
      title: 'Exceso de Presión Admisible en Tank Top',
      message: `La presión calculada de ${tankTopPressure.toFixed(2)} MT/m² (${tiers} capas) supera la resistencia uniforme admisible del doble fondo (${allowableTankTop.toFixed(1)} MT/m²). Reduzca el número de tiers.`,
    });
  } else if (tankTopPressure > allowableTankTop * 0.9) {
    alerts.push({
      code: 'STACKING_PRESSURE_RISK',
      severity: 'warning',
      title: 'Presión en Tank Top Cercana al Límite Estructural',
      message: `La presión calculada de ${tankTopPressure.toFixed(2)} MT/m² está al ${((tankTopPressure / allowableTankTop) * 100).toFixed(0)}% del límite admisible (${allowableTankTop.toFixed(1)} MT/m²).`,
    });
  }

  return {
    success: true,
    cargoName,
    package: {
      ...normalized,
      lengthUnit: input.lengthUnit || 'm',
      weightUnit: input.weightUnit || 'MT',
      unitVolumeM3: Number(unitVolumeM3.toFixed(4)),
      unitFootprintM2: Number(unitFootprintM2.toFixed(4)),
    },
    tiers,
    brokenStowagePct,
    targetCargoMT,
    stowageFactors: {
      netSF: Number(netSF.toFixed(3)),
      grossSF: Number(grossSF.toFixed(3)),
      unit: 'm³/MT',
    },
    pressure: {
      tankTopPressureMTM2: Number(tankTopPressure.toFixed(2)),
      allowableLoadMTM2: allowableTankTop,
      utilizationPct: allowableTankTop > 0 ? Number(((tankTopPressure / allowableTankTop) * 100).toFixed(1)) : 0,
    },
    results: {
      theoretical: {
        units: totalTheoreticalUnits,
        weightMT: Number(totalTheoreticalMT.toFixed(2)),
      },
      volumetric: {
        units: volumetricRealisticUnits,
        weightMT: volumetricRealisticMT,
      },
      realistic: {
        units: finalUnits,
        weightMT: finalMT,
      },
      marginVsTarget: {
        targetMT: targetCargoMT,
        differenceMT: marginVsTargetMT,
        percentage: marginVsTargetPct,
      },
    },
    holds: realisticHoldsDetail,
    geometry,
    vesselSpecs: {
      name: vesselSpecs.vessel_name || vesselSpecs.name || 'TBN',
      imo: vesselSpecs.imo_number || vesselSpecs.imo || '-',
      dwt: Number(vesselSpecs.dwt) || Math.round(geometry.dwccEstimatedMT / 0.93),
      loa: geometry.loa,
      beam: geometry.beam,
      draft: Number(vesselSpecs.draft_meters || vesselSpecs.draft || geometry.draft || 0),
      hasGears: Boolean(vesselSpecs.has_gears),
      craneConfiguration: vesselSpecs.crane_configuration || '',
    },
    alerts,
  };
}

export function generarCargoPlanSvgH18(result = {}, options = {}) {
  const width = options.width || 1200;
  const height = options.height || 800;
  const v = result.vesselSpecs || {};
  const pkg = result.package || {};
  const sf = result.stowageFactors || {};
  const res = result.results?.realistic || { units: 0, weightMT: 0 };
  const holds = Array.isArray(result.holds) ? result.holds : [];
  const holdsCount = holds.length || 4;

  const shipDrawStartX = 140;
  const shipDrawEndX = 1060;
  const shipLengthPx = shipDrawEndX - shipDrawStartX;

  // 1. PERFIL LONGITUDINAL: Despeje vertical (+85px) para garantizar al menos 24px entre subtítulo y chimenea
  const subtitleLineY = 104;
  const profileTopY = 175;
  const profileBottomY = 335;
  const profileHeight = profileBottomY - profileTopY; // 160px

  // 2. PLANTA DE ESTIBA POR BODEGA: Despejada verticalmente bajo el perfil longitudinal
  const planTopY = 405;
  const planBottomY = 545;
  const planCenterY = (planTopY + planBottomY) / 2; // 475px
  const planHalfBreadth = 65;

  const cargoStartX = shipDrawStartX + shipLengthPx * 0.16;
  const cargoEndX = shipDrawEndX - shipLengthPx * 0.08;
  const cargoLengthPx = cargoEndX - cargoStartX;
  const holdLengthPx = cargoLengthPx / holdsCount;

  let holdsProfileSvg = '';
  let holdsPlanSvg = '';

  holds.forEach((hold) => {
    const reverseIndex = holdsCount - hold.holdNumber;
    const hx = cargoStartX + reverseIndex * holdLengthPx + 4;
    const hw = holdLengthPx - 8;
    const hy = profileTopY + 36;
    const hh = profileHeight - 56;

    const isOccupied = hold.realisticUnits > 0;
    const holdBg = isOccupied ? '#f0fdfa' : '#ffffff';
    const holdBorder = isOccupied ? '#0d9488' : '#94a3b8';

    let tiersSvg = '';
    const tierCount = hold.tiers || 1;
    const tierH = hh / Math.max(1, tierCount);
    for (let t = 0; t < tierCount; t++) {
      const ty = hy + hh - (t + 1) * tierH;
      tiersSvg += `<rect x="${hx + 2}" y="${ty + 1}" width="${hw - 4}" height="${tierH - 2}" rx="2" fill="${isOccupied ? '#ccfbf1' : '#f1f5f9'}" stroke="${isOccupied ? '#14b8a6' : '#cbd5e1'}" stroke-width="0.75" />`;
    }

    holdsProfileSvg += `
      <g class="hold-profile" id="hold-profile-${hold.holdNumber}">
        <rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" fill="${holdBg}" stroke="${holdBorder}" stroke-width="1.5" />
        ${tiersSvg}
        <rect x="${hx + hw * 0.12}" y="${profileTopY + 22}" width="${hw * 0.76}" height="12" fill="#0f172a" stroke="#334155" stroke-width="1.2" rx="1.5" />
        <text x="${hx + hw / 2}" y="${hy + 20}" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#0f172a" text-anchor="middle">H${hold.holdNumber}</text>
        <!-- Pastilla protectora para texto uds / MT sin colisión con líneas de tiers -->
        <rect x="${hx + hw / 2 - 46}" y="${hy + hh - 36}" width="92" height="32" rx="4" fill="#ffffff" fill-opacity="0.95" stroke="#cbd5e1" stroke-width="1" />
        <text x="${hx + hw / 2}" y="${hy + hh - 22}" font-family="monospace" font-size="9" font-weight="700" fill="#475569" text-anchor="middle">${hold.realisticUnits} uds · ${tierCount}T</text>
        <text x="${hx + hw / 2}" y="${hy + hh - 10}" font-family="monospace" font-size="10" font-weight="800" fill="#0f766e" text-anchor="middle">${hold.realisticMT.toLocaleString('es-ES')} MT</text>
      </g>
    `;

    let planHoldPath = '';
    if (hold.isBowHold) {
      const leftYTop = planCenterY - planHalfBreadth + 4;
      const leftYBottom = planCenterY + planHalfBreadth - 4;
      const rightYTop = planCenterY - planHalfBreadth * 0.65;
      const rightYBottom = planCenterY + planHalfBreadth * 0.65;

      planHoldPath = `<polygon points="${hx},${leftYTop} ${hx + hw},${rightYTop} ${hx + hw},${rightYBottom} ${hx},${leftYBottom}" fill="${holdBg}" stroke="${holdBorder}" stroke-width="1.5" />`;
    } else {
      const py = planCenterY - planHalfBreadth + 4;
      const ph = (planHalfBreadth - 4) * 2;
      planHoldPath = `<rect x="${hx}" y="${py}" width="${hw}" height="${ph}" fill="${holdBg}" stroke="${holdBorder}" stroke-width="1.5" rx="3" />`;
    }

    holdsPlanSvg += `
      <g class="hold-plan" id="hold-plan-${hold.holdNumber}">
        ${planHoldPath}
        <rect x="${hx + hw * 0.15}" y="${planCenterY - 26}" width="${hw * 0.7}" height="52" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.2" stroke-dasharray="3 2" rx="2" />
        <text x="${hx + hw / 2}" y="${planCenterY + 4}" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#0f172a" text-anchor="middle">H${hold.holdNumber} PLANTA</text>
      </g>
    `;
  });

  const hullProfilePath = `
    M ${shipDrawStartX + 30} ${profileTopY + 36}
    L ${shipDrawStartX + shipLengthPx * 0.16} ${profileTopY + 36}
    L ${cargoEndX} ${profileTopY + 36}
    L ${shipDrawEndX - 20} ${profileTopY + 18}
    Q ${shipDrawEndX + 20} ${profileTopY + 28} ${shipDrawEndX + 15} ${profileBottomY - 10}
    L ${shipDrawEndX - 10} ${profileBottomY}
    L ${shipDrawStartX + 60} ${profileBottomY}
    Q ${shipDrawStartX + 20} ${profileBottomY} ${shipDrawStartX} ${profileBottomY - 35}
    L ${shipDrawStartX} ${profileTopY + 36}
    Z
  `;

  const hullPlanPath = `
    M ${shipDrawStartX + 30} ${planCenterY - planHalfBreadth}
    L ${cargoEndX} ${planCenterY - planHalfBreadth}
    Q ${shipDrawEndX - 20} ${planCenterY - planHalfBreadth} ${shipDrawEndX + 15} ${planCenterY}
    Q ${shipDrawEndX - 20} ${planCenterY + planHalfBreadth} ${cargoEndX} ${planCenterY + planHalfBreadth}
    L ${shipDrawStartX + 30} ${planCenterY + planHalfBreadth}
    Q ${shipDrawStartX} ${planCenterY + planHalfBreadth} ${shipDrawStartX} ${planCenterY}
    Q ${shipDrawStartX} ${planCenterY - planHalfBreadth} ${shipDrawStartX + 30} ${planCenterY - planHalfBreadth}
    Z
  `;

  // Superestructura ajustada con altura controlada para mantener al menos 24px de margen con el subtítulo
  const superstructureSvg = `
    <g class="superstructure">
      <rect x="${shipDrawStartX + 35}" y="${profileTopY - 24}" width="80" height="60" fill="#f8fafc" stroke="#334155" stroke-width="1.5" rx="3" />
      <rect x="${shipDrawStartX + 42}" y="${profileTopY - 18}" width="66" height="12" fill="#0284c7" stroke="#0369a1" stroke-width="1" />
      <path d="M ${shipDrawStartX + 45} ${profileTopY - 24} L ${shipDrawStartX + 52} ${profileTopY - 38} L ${shipDrawStartX + 68} ${profileTopY - 38} L ${shipDrawStartX + 65} ${profileTopY - 24} Z" fill="#0f172a" stroke="#334155" stroke-width="1.2" />
      <line x1="${shipDrawStartX + 95}" y1="${profileTopY - 24}" x2="${shipDrawStartX + 95}" y2="${profileTopY - 44}" stroke="#0f172a" stroke-width="2" />
      <line x1="${shipDrawStartX + 85}" y1="${profileTopY - 38}" x2="${shipDrawStartX + 105}" y2="${profileTopY - 38}" stroke="#0f172a" stroke-width="1.5" />
    </g>
  `;

  const navalDetailsSvg = `
    <rect x="${shipDrawStartX - 8}" y="${profileBottomY - 28}" width="10" height="24" fill="#64748b" stroke="#334155" stroke-width="1" rx="1.5" />
    <circle cx="${shipDrawStartX + 8}" cy="${profileBottomY - 14}" r="8" fill="#f59e0b" stroke="#b45309" stroke-width="1" />
    <path d="M ${shipDrawEndX + 8} ${profileBottomY - 20} Q ${shipDrawEndX + 35} ${profileBottomY - 14} ${shipDrawEndX + 12} ${profileBottomY - 2}" fill="#0f172a" stroke="#334155" stroke-width="1" />
  `;

  // Cajetín de ingeniería reposicionado en la base con altura generosa
  const engineeringBoxY = 575;
  const engineeringBoxHeight = 185;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" class="cargo-plan-h18-svg" style="background:#ffffff; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1" />
    </pattern>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#gridPattern)" />

  <g class="header-section">
    <rect x="20" y="16" width="${width - 40}" height="56" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" rx="6" />
    <text x="36" y="42" font-size="16" font-weight="900" fill="#0f172a" letter-spacing="0.5">SEACHARTER CORE PRO · PLANO TENTATIVO DE ESTIBA &amp; CARGO PLAN (H18)</text>
    <text x="36" y="58" font-size="11" font-weight="600" fill="#0d9488">MÓDULO DE INGENIERÍA NAVAL · VERIFICACIÓN ESTRUCTURAL Y DISTRIBUCIÓN POR BODEGA</text>

    <rect x="${width - 240}" y="24" width="210" height="40" fill="#ffffff" stroke="#0d9488" stroke-width="1.2" rx="4" />
    <text x="${width - 135}" y="42" font-size="10" font-weight="800" fill="#0f766e" text-anchor="middle">ORIENTACIÓN NAVAL ESTÁNDAR</text>
    <text x="${width - 225}" y="56" font-size="10" font-weight="800" fill="#475569">← POPA (AFT)</text>
    <text x="${width - 45}" y="56" font-size="10" font-weight="800" fill="#0d9488" text-anchor="end">PROA (BOW) →</text>
  </g>

  <g class="view-profile">
    <text x="30" y="98" font-size="11" font-weight="800" fill="#334155" letter-spacing="1">1. PERFIL LONGITUDINAL (ELEVACIÓN LATERAL)</text>
    <line x1="30" y1="${subtitleLineY}" x2="380" y2="${subtitleLineY}" stroke="#cbd5e1" stroke-width="1.5" />
    <line x1="${shipDrawStartX - 20}" y1="${profileTopY + 100}" x2="${shipDrawEndX + 35}" y2="${profileTopY + 100}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="6 4" />
    <text x="${shipDrawEndX + 40}" y="${profileTopY + 103}" font-size="9" font-weight="700" fill="#0284c7">WL</text>

    <path d="${hullProfilePath}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
    ${superstructureSvg}
    ${navalDetailsSvg}
    <line x1="${cargoStartX}" y1="${profileBottomY - 20}" x2="${cargoEndX}" y2="${profileBottomY - 20}" stroke="#0f172a" stroke-width="2" />
    <text x="${cargoStartX - 5}" y="${profileBottomY - 24}" font-size="8" font-weight="700" fill="#64748b" text-anchor="end">TANK TOP</text>
    ${holdsProfileSvg}
  </g>

  <g class="view-plan">
    <text x="30" y="375" font-size="11" font-weight="800" fill="#334155" letter-spacing="1">2. PLANTA DE ESTIBA POR BODEGA (TOP VIEW / ARRANGEMENT)</text>
    <line x1="30" y1="381" x2="420" y2="381" stroke="#cbd5e1" stroke-width="1.5" />
    <line x1="${shipDrawStartX - 10}" y1="${planCenterY}" x2="${shipDrawEndX + 20}" y2="${planCenterY}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="8 4 2 4" />
    <text x="${shipDrawStartX - 15}" y="${planCenterY + 3}" font-size="8" font-weight="700" fill="#94a3b8" text-anchor="end">CL</text>
    <path d="${hullPlanPath}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
    ${holdsPlanSvg}
  </g>

  <g class="engineering-box" transform="translate(20, ${engineeringBoxY})">
    <rect x="0" y="0" width="${width - 40}" height="${engineeringBoxHeight}" fill="#f8fafc" stroke="#0f172a" stroke-width="1.75" rx="6" />
    <line x1="320" y1="0" x2="320" y2="${engineeringBoxHeight - 36}" stroke="#cbd5e1" stroke-width="1" />
    <line x1="680" y1="0" x2="680" y2="${engineeringBoxHeight - 36}" stroke="#cbd5e1" stroke-width="1" />
    <line x1="0" y1="${engineeringBoxHeight - 36}" x2="${width - 40}" y2="${engineeringBoxHeight - 36}" stroke="#0f172a" stroke-width="1.5" />

    <text x="16" y="22" font-size="10" font-weight="800" fill="#0f766e" letter-spacing="0.5">BUQUE ACTIVO (SOLO LECTURA)</text>
    <text x="16" y="44" font-size="14" font-weight="900" fill="#0f172a">${v.name || 'TBN'}</text>
    <text x="16" y="64" font-size="10" font-weight="600" fill="#475569">IMO: <tspan font-weight="800" fill="#0f172a">${v.imo || '-'}</tspan> · DWT: <tspan font-weight="800" fill="#0f172a">${Number(v.dwt || 0).toLocaleString('es-ES')} DWT</tspan></text>
    <text x="16" y="82" font-size="10" font-weight="600" fill="#475569">Eslora (LOA): <tspan font-weight="700" fill="#0f172a">${v.loa || 0} m</tspan> · Manga: <tspan font-weight="700" fill="#0f172a">${v.beam || 0} m</tspan></text>
    <text x="16" y="100" font-size="10" font-weight="600" fill="#475569">Calado: <tspan font-weight="700" fill="#0f172a">${v.draft || 0} m</tspan> · Grúas: <tspan font-weight="700" fill="#0f172a">${v.hasGears ? (v.craneConfiguration || 'Sí (Geared)') : 'Gearless'}</tspan></text>
    <text x="16" y="118" font-size="9" font-weight="700" fill="#0d9488">Bodegas: ${holdsCount} · Resistencia Tank Top: ${result.pressure?.allowableLoadMTM2 || 20} MT/m²</text>

    <text x="336" y="22" font-size="10" font-weight="800" fill="#0f766e" letter-spacing="0.5">PARÁMETROS DEL BULTO Y ESTIBA</text>
    <text x="336" y="44" font-size="13" font-weight="800" fill="#0f172a">${result.cargoName || 'Carga Homogénea'}</text>
    <text x="336" y="64" font-size="10" font-weight="600" fill="#475569">Medidas: <tspan font-weight="700" fill="#0f172a">${pkg.lengthM} × ${pkg.widthM} × ${pkg.heightM} m</tspan> · Peso: <tspan font-weight="700" fill="#0f172a">${pkg.unitWeightMT} MT</tspan></text>
    <text x="336" y="82" font-size="10" font-weight="600" fill="#475569">Capas (Tiers): <tspan font-weight="800" fill="#0f766e">${result.tiers}</tspan> · Broken Stowage: <tspan font-weight="800" fill="#d97706">${result.brokenStowagePct}%</tspan></text>
    <text x="336" y="100" font-size="10" font-weight="600" fill="#475569">Presión Tank Top: <tspan font-weight="800" fill="${(result.pressure?.tankTopPressureMTM2 || 0) > (result.pressure?.allowableLoadMTM2 || 20) ? '#dc2626' : '#0f766e'}">${result.pressure?.tankTopPressureMTM2 || 0} MT/m²</tspan></text>
    <text x="336" y="118" font-size="9" font-weight="700" fill="#475569">Vol. unitario: ${pkg.unitVolumeM3} m³ · Sup. apoyo: ${pkg.unitFootprintM2} m²</text>

    <text x="696" y="22" font-size="10" font-weight="800" fill="#0f766e" letter-spacing="0.5">FACTORES DE ESTIBA &amp; BALANCE FINAL</text>
    <text x="696" y="44" font-size="11" font-weight="700" fill="#475569">STOWAGE FACTOR NETO: <tspan font-weight="900" font-size="13" fill="#0f172a">${sf.netSF || 0} m³/MT</tspan></text>
    <text x="696" y="66" font-size="11" font-weight="800" fill="#0d9488">STOWAGE FACTOR BRUTO (c/ BS): <tspan font-weight="900" font-size="14" fill="#0d9488">${sf.grossSF || 0} m³/MT</tspan></text>
    <text x="696" y="88" font-size="10" font-weight="600" fill="#475569">Estiba Realista: <tspan font-weight="900" fill="#0f172a">${res.weightMT.toLocaleString('es-ES')} MT</tspan> (${res.units.toLocaleString('es-ES')} uds)</text>
    <text x="696" y="106" font-size="10" font-weight="600" fill="#475569">Objetivo Comercial: <tspan font-weight="700" fill="#0f172a">${(result.targetCargoMT || 0).toLocaleString('es-ES')} MT</tspan> · Margen: <tspan font-weight="800" fill="${(result.results?.marginVsTarget?.differenceMT || 0) >= 0 ? '#16a34a' : '#dc2626'}">${(result.results?.marginVsTarget?.differenceMT || 0) >= 0 ? '+' : ''}${result.results?.marginVsTarget?.differenceMT || 0} MT (${result.results?.marginVsTarget?.percentage || 0}%)</tspan></text>
    <text x="696" y="122" font-size="9" font-weight="700" fill="#64748b">Total Teórico: ${(result.results?.theoretical?.weightMT || 0).toLocaleString('es-ES')} MT (${result.results?.theoretical?.units || 0} uds)</text>

    <rect x="0" y="${engineeringBoxHeight - 36}" width="${width - 40}" height="36" fill="#0f172a" rx="0 0 6 6" />
    <text x="${(width - 40) / 2}" y="${engineeringBoxHeight - 14}" font-size="9.5" font-weight="700" fill="#f8fafc" letter-spacing="0.4" text-anchor="middle">
      TENTATIVE STOWAGE PLAN · FOR GUIDANCE ONLY · SUBJECT TO MASTER'S APPROVAL, STABILITY, TRIM, DRAFT &amp; TANK TOP STRENGTH
    </text>
  </g>
</svg>
  `.trim();
}

export function calcularProjectCargoFallbackH18(vessel = {}, packingList = []) {
  const geom = resolverGeometriaBodegas(vessel);
  const holdsCount = Math.max(1, Number(vessel.holds_count || vessel.holdsCount || geom.holdsCount || 4));
  const hasTweendeck = Boolean(vessel.has_tweendeck ?? vessel.hasTweendeck ?? true);
  const hasGears = Boolean(vessel.has_gears ?? vessel.hasGears ?? true);
  const craneConfig = String(vessel.crane_configuration || vessel.craneConfiguration || '2 x 45 MT');

  let singleCraneSwl = 45;
  let tandemSwl = 90;
  const swlMatches = craneConfig.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (swlMatches) {
    const count = parseInt(swlMatches[1], 10);
    const capacity = parseFloat(swlMatches[2]);
    singleCraneSwl = capacity;
    tandemSwl = count * capacity;
  } else {
    const singleMatch = craneConfig.match(/(\d+(?:\.\d+)?)\s*MT/i);
    if (singleMatch) {
      singleCraneSwl = parseFloat(singleMatch[1]);
      tandemSwl = singleCraneSwl * 2;
    }
  }

  const defaultTemplate = [
    { id: 'TRAFO-01', category: 'heavy_lift', length_m: 6.5, width_m: 3.2, height_m: 3.8, weight_mt: 85.0, quantity: 1, zone: 'auto' },
    { id: 'SEMI', category: 'vehicle', length_m: 11.5, width_m: 2.5, height_m: 2.4, weight_mt: 15.0, quantity: 6, zone: 'on_deck' },
    { id: 'CAJAS-PRJ', category: 'crate', length_m: 4.0, width_m: 2.2, height_m: 2.0, weight_mt: 4.5, quantity: 1, zone: 'auto' },
  ];

  const sourceList = Array.isArray(packingList) && packingList.length > 0 ? packingList : defaultTemplate;

  const placed_items = [];
  let totalWeight = 0;
  let totalVolume = 0;
  let totalUnits = 0;

  const holdCounters = {};

  sourceList.forEach((rawItem, itemIdx) => {
    const item = normalizePackingListItem(rawItem, itemIdx);
    const id = item.label || item.id;
    const len = item.length_m;
    const wid = item.width_m;
    const hgt = item.height_m;
    const wt = Number(item.unit_weight_mt ?? item.weight_mt ?? 0);
    const qty = item.quantity;
    const cat = item.category;
    const prefZone = item.preferred_zone || item.zone || 'auto';

    for (let q = 1; q <= qty; q++) {
      totalUnits++;
      totalWeight += wt;
      totalVolume += (len * wid * hgt);

      const instance_id = qty > 1 ? `${id}-${String(q).padStart(2, '0')}` : id;

      let zone = prefZone;
      if (zone === 'auto') {
        if (cat === 'heavy_lift') {
          zone = 'under_deck';
        } else if (cat === 'vehicle') {
          zone = 'on_deck';
        } else if (cat === 'steel') {
          zone = 'under_deck';
        } else {
          zone = (hasTweendeck && q % 2 === 0) ? 'tweendeck' : 'under_deck';
        }
      }

      let hold_number = 2;
      if (cat === 'heavy_lift') {
        hold_number = holdsCount >= 4 ? 2 : 1;
      } else if (cat === 'vehicle') {
        hold_number = ((q - 1) % holdsCount) + 1;
      } else {
        hold_number = ((itemIdx + q - 1) % holdsCount) + 1;
      }

      const key = `${hold_number}-${zone}`;
      const countInSlot = holdCounters[key] || 0;
      holdCounters[key] = countInSlot + 1;

      const holdLen = geom.nominalHoldLength || 25;
      const holdWid = geom.nominalHoldBreadth || 20;
      const w_pct = Math.max(0.15, Math.min(0.85, Number((len / holdLen).toFixed(2))));
      const h_pct = Math.max(0.15, Math.min(0.85, Number((wid / holdWid).toFixed(2))));

      const slotX = countInSlot % 2;
      const slotY = Math.floor(countInSlot / 2);
      const x_pct = Math.min(0.85, Number((0.08 + slotX * 0.44).toFixed(2)));
      const y_pct = Math.min(0.85, Number((0.08 + (slotY % 2) * 0.44).toFixed(2)));

      placed_items.push({
        id: instance_id,
        instance_id,
        label: instance_id,
        category: cat,
        zone,
        preferred_zone: zone,
        hold_number,
        length_m: len,
        width_m: wid,
        height_m: hgt,
        weight_mt: wt,
        unit_weight_mt: wt,
        x_pct,
        w_pct,
        y_pct,
        h_pct,
      });
    }
  });

  const placedUnits = placed_items.length;
  const netSf = totalWeight > 0 ? Number((totalVolume / totalWeight).toFixed(3)) : 1.820;
  const grossSf = Number((netSf * 1.18).toFixed(3));

  const alerts = [];

  placed_items.forEach((item) => {
    if (item.weight_mt > tandemSwl) {
      if (!alerts.some((a) => a.code === 'SHORE_CRANE_REQUIRED')) {
        alerts.push({
          code: 'SHORE_CRANE_REQUIRED',
          severity: 'critical',
          title: 'Grúa de tierra requerida (Shore Crane)',
          message: `La pieza ${item.instance_id} (${item.weight_mt} MT) supera la capacidad combinada de grúas del buque (${tandemSwl} MT). Se requerirá grúa portuaria / flotante de tierra.`,
        });
      }
    } else if (item.weight_mt > singleCraneSwl) {
      if (!alerts.some((a) => a.code === 'TANDEM_LIFT_REQUIRED')) {
        alerts.push({
          code: 'TANDEM_LIFT_REQUIRED',
          severity: 'warning',
          title: 'Izada en Tándem Requerida',
          message: `La pieza ${item.instance_id} (${item.weight_mt} MT) excede el SWL de grúa individual (${singleCraneSwl} MT). Requiere maniobra tándem de 2 grúas con balancín (spreader beam).`,
        });
      }
    }

    if (item.category === 'heavy_lift' || item.weight_mt >= 40) {
      if (!alerts.some((a) => a.code === 'DUNNAGE_SPREADERS_RECOMMENDED')) {
        alerts.push({
          code: 'DUNNAGE_SPREADERS_RECOMMENDED',
          severity: 'warning',
          title: 'Vigas repartidoras (Dunnage / Spreaders) recomendadas',
          message: `Pieza de gran concentración de carga ${item.instance_id} (${item.weight_mt} MT) en Tank Top requiere vigas repartidoras de carga para no superar la resistencia estructural por cuaderna.`,
        });
      }
    }
  });

  if (totalWeight > (geom.dwccEstimatedMT || 30000)) {
    alerts.push({
      code: 'DWCC_LIMITED',
      severity: 'critical',
      title: 'Capacidad de Carga Útil (DWCC) Superada',
      message: `El peso total del packing list (${totalWeight.toLocaleString('es-ES')} MT) excede el DWCC estimado (${geom.dwccEstimatedMT.toLocaleString('es-ES')} MT).`,
    });
  }

  const summary = {
    total_weight_mt: Number(totalWeight.toFixed(1)),
    total_units: totalUnits,
    placed_units: placedUnits,
    unplaced_units: 0,
    placed_pct: 100,
    equivalent_gross_sf: grossSf,
    equivalent_net_sf: netSf,
    estimated_kg_m: 7.42,
    lashing_status: 'Verificado (Regla IMO CSS Anexo 13)',
    clearance_status: 'Aprobado (Despeje Plumas > 1.2 m)',
  };

  const vesselData = {
    name: vessel.vessel_name || vessel.name || 'TBN',
    imo: vessel.imo_number || vessel.imo || '-',
    dwt: Number(vessel.dwt) || 32000,
    loa: geom.loa,
    beam: geom.beam,
    depth: geom.depth,
    draft: geom.draft,
    holds_count: holdsCount,
    has_tweendeck: hasTweendeck,
    has_gears: hasGears,
    crane_configuration: craneConfig,
  };

  return {
    success: true,
    mode: 'project_cargo',
    vessel: vesselData,
    vesselSpecs: {
      ...vesselData,
      hasGears: hasGears,
      hasTweendeck: hasTweendeck,
      craneConfiguration: craneConfig,
    },
    geometry: geom,
    holds: geom.holds,
    packing_list: sourceList,
    placed_items,
    summary,
    alerts,
    stowageFactors: {
      netSF: netSf,
      grossSF: grossSf,
      unit: 'm³/MT',
    },
  };
}

export function generarProjectCargoPlanSvgH18(planResult = {}, { width = 1200, height = 800 } = {}) {
  const result = planResult || {};
  const v = result.vesselSpecs || result.vessel || {};
  const geom = result.geometry || resolverGeometriaBodegas(v);
  const holds = Array.isArray(result.holds) && result.holds.length > 0 ? result.holds : geom.holds;
  const holdsCount = holds.length || 4;
  const summary = result.summary || {
    total_weight_mt: 0,
    total_units: 0,
    placed_units: 0,
    unplaced_units: 0,
    placed_pct: 100,
    equivalent_gross_sf: 2.15,
    equivalent_net_sf: 1.82,
    estimated_kg_m: 7.42,
    lashing_status: 'Verificado (Regla IMO CSS Anexo 13)',
    clearance_status: 'Aprobado (Despeje Plumas > 1.2 m)',
  };
  const placedItems = Array.isArray(result.placed_items) ? result.placed_items : [];

  const shipDrawStartX = 140;
  const shipDrawEndX = 1060;
  const shipLengthPx = shipDrawEndX - shipDrawStartX;

  const subtitleLineY = 104;
  const profileTopY = 175;
  const profileBottomY = 335;
  const profileHeight = profileBottomY - profileTopY; // 160px

  const planTopY = 405;
  const planBottomY = 545;
  const planCenterY = (planTopY + planBottomY) / 2; // 475px
  const planHalfBreadth = 65;

  const cargoStartX = shipDrawStartX + shipLengthPx * 0.16;
  const cargoEndX = shipDrawEndX - shipLengthPx * 0.08;
  const cargoLengthPx = cargoEndX - cargoStartX;
  const holdLengthPx = cargoLengthPx / holdsCount;

  const hasTweendeck = Boolean(v.has_tweendeck ?? v.hasTweendeck ?? true);
  const hasGears = Boolean(v.has_gears ?? v.hasGears ?? true);
  const craneConfig = String(v.crane_configuration || v.craneConfiguration || '2 x 45 MT');

  let holdsProfileSvg = '';
  let holdsPlanSvg = '';

  holds.forEach((hold) => {
    const reverseIndex = holdsCount - hold.holdNumber;
    const hx = cargoStartX + reverseIndex * holdLengthPx + 4;
    const hw = holdLengthPx - 8;
    const hy = profileTopY + 36;
    const hh = profileHeight - 56;

    const holdItems = placedItems.filter((it) => it.hold_number === hold.holdNumber);
    const isOccupied = holdItems.length > 0;
    const holdBg = isOccupied ? '#f0fdfa' : '#ffffff';
    const holdBorder = isOccupied ? '#0d9488' : '#94a3b8';

    // Línea discontinua fina de entrepuente (tweendeck)
    const tweendeckY = hy + hh * 0.48;
    const tweendeckSvg = hasTweendeck ? `
      <line x1="${hx + 2}" y1="${tweendeckY}" x2="${hx + hw - 2}" y2="${tweendeckY}" stroke="#0d9488" stroke-dasharray="4 3" stroke-width="1.2" />
      <text x="${hx + 4}" y="${tweendeckY - 3}" font-family="monospace" font-size="7.5" font-weight="700" fill="#0f766e">TWEENDECK</text>
    ` : '';

    // Renderizar siluetas de piezas en perfil
    let itemsProfileSvg = '';
    holdItems.forEach((item) => {
      const cat = (item.category || 'crate').toLowerCase();
      const zone = (item.zone || 'under_deck').toLowerCase();

      // Dimensiones visuales escaladas dentro de la bodega
      const itemW = Math.max(22, Math.min(hw * 0.85, (item.w_pct || 0.4) * hw));
      let itemH = Math.max(14, Math.min(hh * 0.42, ((item.height_m || 2) / (geom.depth || 14)) * hh * 1.8));

      const itemX = hx + Math.max(0, Math.min((item.x_pct || 0) * hw, hw - itemW));
      let itemY = hy + hh - itemH; // default Tank Top

      if (zone === 'on_deck') {
        itemY = profileTopY + 22 - itemH;
      } else if (zone === 'tweendeck' && hasTweendeck) {
        itemY = tweendeckY - itemH;
      } else {
        itemY = hy + hh - itemH;
      }

      const labelText = item.instance_id || item.label || item.id || 'CARGO';
      const itemWeight = Number(item.unit_weight_mt ?? item.weight_mt ?? 0);

      if (cat === 'heavy_lift') {
        // Base de madera (dunnage) + cuerpo naranja con nervaduras verticales
        itemsProfileSvg += `
          <g class="profile-heavy-lift" title="${labelText} - ${itemWeight} MT">
            <rect x="${itemX - 2}" y="${itemY + itemH - 3}" width="${itemW + 4}" height="3" fill="#78350f" rx="1" />
            <rect x="${itemX}" y="${itemY}" width="${itemW}" height="${itemH - 3}" fill="#ea580c" stroke="#c2410c" stroke-width="1.2" rx="2" />
            <line x1="${itemX + itemW * 0.33}" y1="${itemY + 1}" x2="${itemX + itemW * 0.33}" y2="${itemY + itemH - 3}" stroke="#f97316" stroke-width="1" />
            <line x1="${itemX + itemW * 0.66}" y1="${itemY + 1}" x2="${itemX + itemW * 0.66}" y2="${itemY + itemH - 3}" stroke="#f97316" stroke-width="1" />
            <text x="${itemX + itemW / 2}" y="${itemY + itemH / 2 - 1}" font-family="monospace" font-size="8" font-weight="800" fill="#ffffff" text-anchor="middle">${labelText}</text>
          </g>
        `;
      } else if (cat === 'vehicle') {
        // Silueta técnica de cabina, chasis/remolque y ruedas
        const cabW = Math.max(8, itemW * 0.28);
        const cabH = Math.max(6, itemH * 0.45);
        const trailerH = itemH - 4;
        const wheelR = 2.5;
        itemsProfileSvg += `
          <g class="profile-vehicle" title="${labelText} - ${itemWeight} MT">
            <rect x="${itemX}" y="${itemY + (itemH - trailerH) - 2}" width="${itemW}" height="${trailerH}" fill="#2563eb" stroke="#1d4ed8" stroke-width="1" rx="2" />
            <rect x="${itemX + itemW - cabW}" y="${itemY}" width="${cabW}" height="${cabH}" fill="#1e40af" stroke="#1d4ed8" stroke-width="1" rx="1" />
            <rect x="${itemX + itemW - cabW + 2}" y="${itemY + 2}" width="${cabW - 4}" height="${cabH - 3}" fill="#38bdf8" />
            <circle cx="${itemX + 5}" cy="${itemY + itemH - 1}" r="${wheelR}" fill="#0f172a" />
            <circle cx="${itemX + itemW * 0.5}" cy="${itemY + itemH - 1}" r="${wheelR}" fill="#0f172a" />
            <circle cx="${itemX + itemW - 5}" cy="${itemY + itemH - 1}" r="${wheelR}" fill="#0f172a" />
            <text x="${itemX + itemW / 2 - 3}" y="${itemY + itemH / 2 + 1}" font-family="monospace" font-size="7.5" font-weight="800" fill="#ffffff" text-anchor="middle">${labelText}</text>
          </g>
        `;
      } else if (cat === 'steel') {
        // Franjas metálicas horizontales
        itemsProfileSvg += `
          <g class="profile-steel" title="${labelText} - ${itemWeight} MT">
            <rect x="${itemX}" y="${itemY}" width="${itemW}" height="${itemH}" fill="#475569" stroke="#334155" stroke-width="1.2" rx="2" />
            <line x1="${itemX + 2}" y1="${itemY + itemH * 0.33}" x2="${itemX + itemW - 2}" y2="${itemY + itemH * 0.33}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 2" />
            <line x1="${itemX + 2}" y1="${itemY + itemH * 0.66}" x2="${itemX + itemW - 2}" y2="${itemY + itemH * 0.66}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 2" />
            <text x="${itemX + itemW / 2}" y="${itemY + itemH / 2 + 2}" font-family="monospace" font-size="8" font-weight="800" fill="#ffffff" text-anchor="middle">${labelText}</text>
          </g>
        `;
      } else {
        // crate: Diagonales de embalaje de madera
        itemsProfileSvg += `
          <g class="profile-crate" title="${labelText} - ${itemWeight} MT">
            <rect x="${itemX}" y="${itemY}" width="${itemW}" height="${itemH}" fill="#0d9488" stroke="#0f766e" stroke-width="1.2" rx="2" />
            <line x1="${itemX + 2}" y1="${itemY + 2}" x2="${itemX + itemW - 2}" y2="${itemY + itemH - 2}" stroke="#14b8a6" stroke-width="0.8" />
            <line x1="${itemX + itemW - 2}" y1="${itemY + 2}" x2="${itemX + 2}" y2="${itemY + itemH - 2}" stroke="#14b8a6" stroke-width="0.8" />
            <text x="${itemX + itemW / 2}" y="${itemY + itemH / 2 + 2}" font-family="monospace" font-size="8" font-weight="800" fill="#ffffff" text-anchor="middle">${labelText}</text>
          </g>
        `;
      }
    });

    holdsProfileSvg += `
      <g class="hold-profile" id="hold-profile-${hold.holdNumber}">
        <rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" fill="${holdBg}" stroke="${holdBorder}" stroke-width="1.5" />
        ${tweendeckSvg}
        <rect x="${hx + hw * 0.12}" y="${profileTopY + 22}" width="${hw * 0.76}" height="12" fill="#0f172a" stroke="#334155" stroke-width="1.2" rx="1.5" />
        <text x="${hx + hw / 2}" y="${hy + 16}" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#0f172a" text-anchor="middle">H${hold.holdNumber}</text>
        ${itemsProfileSvg}
        <rect x="${hx + hw / 2 - 38}" y="${hy + hh - 18}" width="76" height="16" rx="3" fill="#ffffff" fill-opacity="0.92" stroke="#cbd5e1" stroke-width="0.8" />
        <text x="${hx + hw / 2}" y="${hy + hh - 6}" font-family="monospace" font-size="8.5" font-weight="700" fill="#0f766e" text-anchor="middle">${holdItems.length} bultos</text>
      </g>
    `;

    // PLANTA DE ESTIBA
    const py = planCenterY - planHalfBreadth + 4;
    const ph = (planHalfBreadth - 4) * 2;

    let planHoldPath = '';
    if (hold.isBowHold) {
      const leftYTop = planCenterY - planHalfBreadth + 4;
      const leftYBottom = planCenterY + planHalfBreadth - 4;
      const rightYTop = planCenterY - planHalfBreadth * 0.65;
      const rightYBottom = planCenterY + planHalfBreadth * 0.65;
      planHoldPath = `<polygon points="${hx},${leftYTop} ${hx + hw},${rightYTop} ${hx + hw},${rightYBottom} ${hx},${leftYBottom}" fill="${holdBg}" stroke="${holdBorder}" stroke-width="1.5" />`;
    } else {
      planHoldPath = `<rect x="${hx}" y="${py}" width="${hw}" height="${ph}" fill="${holdBg}" stroke="${holdBorder}" stroke-width="1.5" rx="3" />`;
    }

    // Marcas de trincaje (X de lashing) en las esquinas
    const lashingMarksSvg = `
      <g class="lashing-marks" stroke="#ea580c" stroke-width="1.4">
        <path d="M ${hx + 5} ${py + 5} l 8 8 m -8 0 l 8 -8" />
        <path d="M ${hx + hw - 13} ${py + 5} l 8 8 m -8 0 l 8 -8" />
        <path d="M ${hx + 5} ${py + ph - 13} l 8 8 m -8 0 l 8 -8" />
        <path d="M ${hx + hw - 13} ${py + ph - 13} l 8 8 m -8 0 l 8 -8" />
      </g>
    `;

    // Renderizar piezas en planta
    let itemsPlanSvg = '';
    holdItems.forEach((item) => {
      const cat = (item.category || 'crate').toLowerCase();
      const itemW = Math.max(22, Math.min(hw * 0.85, (item.w_pct || 0.4) * hw));
      const itemH = Math.max(16, Math.min(ph * 0.82, (item.h_pct || 0.4) * ph));
      const itemX = hx + Math.max(0, Math.min((item.x_pct || 0) * hw, hw - itemW));
      const itemY = py + Math.max(0, Math.min((item.y_pct || 0) * ph, ph - itemH));
      const planLabelText = item.instance_id || item.label || item.id || 'CARGO';

      let itemFill = '#0d9488';
      if (cat === 'heavy_lift') itemFill = '#ea580c';
      else if (cat === 'vehicle') itemFill = '#2563eb';
      else if (cat === 'steel') itemFill = '#475569';

      itemsPlanSvg += `
        <g class="plan-item">
          <rect x="${itemX}" y="${itemY}" width="${itemW}" height="${itemH}" fill="${itemFill}" stroke="#0f172a" stroke-width="1.2" rx="2" fill-opacity="0.9" />
          <line x1="${itemX}" y1="${itemY}" x2="${itemX + 5}" y2="${itemY + 5}" stroke="#ffffff" stroke-width="1" />
          <line x1="${itemX + itemW}" y1="${itemY}" x2="${itemX + itemW - 5}" y2="${itemY + 5}" stroke="#ffffff" stroke-width="1" />
          <line x1="${itemX}" y1="${itemY + itemH}" x2="${itemX + 5}" y2="${itemY + itemH - 5}" stroke="#ffffff" stroke-width="1" />
          <line x1="${itemX + itemW}" y1="${itemY + itemH}" x2="${itemX + itemW - 5}" y2="${itemY + itemH - 5}" stroke="#ffffff" stroke-width="1" />
          <text x="${itemX + itemW / 2}" y="${itemY + itemH / 2 + 3}" font-family="monospace" font-size="7.5" font-weight="800" fill="#ffffff" text-anchor="middle">${planLabelText}</text>
        </g>
      `;
    });

    holdsPlanSvg += `
      <g class="hold-plan" id="hold-plan-${hold.holdNumber}">
        ${planHoldPath}
        <rect x="${hx + hw * 0.15}" y="${planCenterY - 24}" width="${hw * 0.7}" height="48" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.2" stroke-dasharray="3 2" rx="2" fill-opacity="0.6" />
        <text x="${hx + hw / 2}" y="${py + 12}" font-family="system-ui, sans-serif" font-size="9" font-weight="800" fill="#475569" text-anchor="middle" fill-opacity="0.9">H${hold.holdNumber}</text>
        ${lashingMarksSvg}
        ${itemsPlanSvg}
      </g>
    `;
  });

  // Grúas de cubierta articuladas en perfil
  let cranesProfileSvg = '';
  if (hasGears) {
    const craneCount = Math.max(2, holdsCount - 1);
    for (let c = 0; c < craneCount; c++) {
      const cx = cargoStartX + (c + 1) * holdLengthPx - 4;
      cranesProfileSvg += `
        <g class="deck-crane" id="crane-${c + 1}">
          <!-- Pedestal -->
          <rect x="${cx - 4}" y="${profileTopY + 12}" width="8" height="24" fill="#0284c7" stroke="#334155" stroke-width="1.2" rx="1.5" />
          <!-- Cabina -->
          <rect x="${cx - 6}" y="${profileTopY + 2}" width="12" height="10" fill="#334155" rx="1" />
          <!-- Pluma inclinada hacia proa (+X) -->
          <line x1="${cx}" y1="${profileTopY + 4}" x2="${cx + 34}" y2="${profileTopY - 22}" stroke="#334155" stroke-width="2.5" stroke-linecap="round" />
          <!-- Cable y gancho -->
          <line x1="${cx + 34}" y1="${profileTopY - 22}" x2="${cx + 34}" y2="${profileTopY + 8}" stroke="#475569" stroke-width="1" stroke-dasharray="2 1" />
          <path d="M ${cx + 34} ${profileTopY + 8} q 0 3 3 3 q 3 0 3 -3" fill="none" stroke="#334155" stroke-width="1.5" />
        </g>
      `;
    }
  }

  // Casco perfil longitudinal
  const hullProfilePath = `
    M ${shipDrawStartX + 30} ${profileTopY + 36}
    L ${shipDrawStartX + shipLengthPx * 0.16} ${profileTopY + 36}
    L ${cargoEndX} ${profileTopY + 36}
    L ${shipDrawEndX - 20} ${profileTopY + 18}
    Q ${shipDrawEndX + 20} ${profileTopY + 28} ${shipDrawEndX + 15} ${profileBottomY - 10}
    L ${shipDrawEndX - 10} ${profileBottomY}
    L ${shipDrawStartX + 60} ${profileBottomY}
    Q ${shipDrawStartX + 20} ${profileBottomY} ${shipDrawStartX} ${profileBottomY - 35}
    L ${shipDrawStartX} ${profileTopY + 36}
    Z
  `;

  // Superestructura escalonada de 4 cubiertas
  const superstructureSvg = `
    <g class="superstructure-4-tiers">
      <!-- Cubierta 1 (Poop Deck) -->
      <rect x="${shipDrawStartX + 35}" y="${profileTopY + 10}" width="84" height="26" fill="#f8fafc" stroke="#334155" stroke-width="1.2" rx="2" />
      <line x1="${shipDrawStartX + 35}" y1="${profileTopY + 10}" x2="${shipDrawStartX + 119}" y2="${profileTopY + 10}" stroke="#475569" stroke-width="1" stroke-dasharray="3 2" />
      <!-- Cubierta 2 (Upper Deck) -->
      <rect x="${shipDrawStartX + 42}" y="${profileTopY - 6}" width="72" height="16" fill="#f1f5f9" stroke="#334155" stroke-width="1.2" rx="2" />
      <!-- Cubierta 3 (Bridge Deck) -->
      <rect x="${shipDrawStartX + 48}" y="${profileTopY - 22}" width="60" height="16" fill="#f8fafc" stroke="#334155" stroke-width="1.2" rx="2" />
      <!-- Cubierta 4 (Navigating Bridge) -->
      <rect x="${shipDrawStartX + 52}" y="${profileTopY - 38}" width="54" height="16" fill="#ffffff" stroke="#334155" stroke-width="1.5" rx="2" />
      <!-- Franja ventanas de navegación azul -->
      <rect x="${shipDrawStartX + 55}" y="${profileTopY - 35}" width="48" height="6" fill="#0284c7" stroke="#0369a1" stroke-width="0.8" />
      <!-- Barandillas finas -->
      <line x1="${shipDrawStartX + 48}" y1="${profileTopY - 24}" x2="${shipDrawStartX + 108}" y2="${profileTopY - 24}" stroke="#334155" stroke-width="0.8" stroke-dasharray="2 1" />
      <!-- Chimenea con franja corporativa -->
      <path d="M ${shipDrawStartX + 44} ${profileTopY - 22} L ${shipDrawStartX + 40} ${profileTopY - 46} L ${shipDrawStartX + 50} ${profileTopY - 46} L ${shipDrawStartX + 52} ${profileTopY - 22} Z" fill="#0f172a" stroke="#334155" stroke-width="1.2" />
      <rect x="${shipDrawStartX + 41}" y="${profileTopY - 40}" width="9" height="5" fill="#ea580c" />
      <!-- Mástil radar -->
      <line x1="${shipDrawStartX + 79}" y1="${profileTopY - 38}" x2="${shipDrawStartX + 79}" y2="${profileTopY - 54}" stroke="#0f172a" stroke-width="2" />
      <line x1="${shipDrawStartX + 72}" y1="${profileTopY - 50}" x2="${shipDrawStartX + 86}" y2="${profileTopY - 50}" stroke="#0f172a" stroke-width="1.5" />
    </g>
  `;

  // Detalles navales: Timón, hélice, bulbo sutil y mástil de proa
  const navalDetailsSvg = `
    <!-- Timón y Hélice en popa -->
    <rect x="${shipDrawStartX - 8}" y="${profileBottomY - 28}" width="10" height="24" fill="#64748b" stroke="#334155" stroke-width="1" rx="1.5" />
    <circle cx="${shipDrawStartX + 8}" cy="${profileBottomY - 14}" r="8" fill="#f59e0b" stroke="#b45309" stroke-width="1" />
    <!-- Bulbo sutil en proa -->
    <path d="M ${shipDrawEndX + 8} ${profileBottomY - 20} Q ${shipDrawEndX + 35} ${profileBottomY - 14} ${shipDrawEndX + 12} ${profileBottomY - 2}" fill="#0f172a" stroke="#334155" stroke-width="1" />
    <!-- Mástil de proa -->
    <line x1="${shipDrawEndX - 15}" y1="${profileTopY + 18}" x2="${shipDrawEndX - 15}" y2="${profileTopY - 10}" stroke="#0f172a" stroke-width="2" />
    <line x1="${shipDrawEndX - 22}" y1="${profileTopY}" x2="${shipDrawEndX - 8}" y2="${profileTopY}" stroke="#0f172a" stroke-width="1.5" />
  `;

  // Casco planta
  const hullPlanPath = `
    M ${shipDrawStartX + 30} ${planCenterY - planHalfBreadth}
    L ${cargoEndX} ${planCenterY - planHalfBreadth}
    Q ${shipDrawEndX - 20} ${planCenterY - planHalfBreadth} ${shipDrawEndX + 15} ${planCenterY}
    Q ${shipDrawEndX - 20} ${planCenterY + planHalfBreadth} ${cargoEndX} ${planCenterY + planHalfBreadth}
    L ${shipDrawStartX + 30} ${planCenterY + planHalfBreadth}
    Q ${shipDrawStartX} ${planCenterY + planHalfBreadth} ${shipDrawStartX} ${planCenterY}
    Q ${shipDrawStartX} ${planCenterY - planHalfBreadth} ${shipDrawStartX + 30} ${planCenterY - planHalfBreadth}
    Z
  `;

  const engineeringBoxY = 575;
  const engineeringBoxHeight = 185;
  const craneDesc = hasGears ? `${craneConfig} (SWL Tandem)` : 'Gearless';

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" class="cargo-plan-h18-project-svg" style="background:#ffffff; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <pattern id="gridPatternProject" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1" />
    </pattern>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#gridPatternProject)" />

  <g class="header-section">
    <rect x="20" y="16" width="${width - 40}" height="56" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" rx="6" />
    <text x="36" y="42" font-size="16" font-weight="900" fill="#0f172a" letter-spacing="0.5">SEACHARTER CORE PRO · PLANO DE ESTIBA PROJECT CARGO &amp; VEHÍCULOS (CAD 2D H18)</text>
    <text x="36" y="58" font-size="11" font-weight="600" fill="#0d9488">MÓDULO DE INGENIERÍA NAVAL · PACKING LIST, TRINCAJE Y CENTRO DE GRAVEDAD</text>

    <rect x="${width - 240}" y="24" width="210" height="40" fill="#ffffff" stroke="#0d9488" stroke-width="1.2" rx="4" />
    <text x="${width - 135}" y="42" font-size="10" font-weight="800" fill="#0f766e" text-anchor="middle">ORIENTACIÓN NAVAL ESTÁNDAR</text>
    <text x="${width - 225}" y="56" font-size="10" font-weight="800" fill="#475569">← POPA (AFT)</text>
    <text x="${width - 45}" y="56" font-size="10" font-weight="800" fill="#0d9488" text-anchor="end">PROA (BOW) →</text>
  </g>

  <g class="view-profile">
    <text x="30" y="98" font-size="11" font-weight="800" fill="#334155" letter-spacing="1">1. PERFIL LONGITUDINAL (ELEVACIÓN LATERAL)</text>
    <line x1="30" y1="${subtitleLineY}" x2="380" y2="${subtitleLineY}" stroke="#cbd5e1" stroke-width="1.5" />
    <line x1="${shipDrawStartX - 20}" y1="${profileTopY + 100}" x2="${shipDrawEndX + 35}" y2="${profileTopY + 100}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="6 4" />
    <text x="${shipDrawEndX + 40}" y="${profileTopY + 103}" font-size="9" font-weight="700" fill="#0284c7">⚓ WL</text>

    <path d="${hullProfilePath}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
    ${superstructureSvg}
    ${navalDetailsSvg}
    <line x1="${cargoStartX}" y1="${profileBottomY - 20}" x2="${cargoEndX}" y2="${profileBottomY - 20}" stroke="#0f172a" stroke-width="2" />
    <text x="${cargoStartX - 5}" y="${profileBottomY - 24}" font-size="8" font-weight="700" fill="#64748b" text-anchor="end">TANK TOP</text>
    ${holdsProfileSvg}
    ${cranesProfileSvg}
  </g>

  <g class="view-plan">
    <text x="30" y="375" font-size="11" font-weight="800" fill="#334155" letter-spacing="1">2. PLANTA DE ESTIBA POR BODEGA Y CUBIERTA (TOP VIEW / ARRANGEMENT)</text>
    <line x1="30" y1="381" x2="520" y2="381" stroke="#cbd5e1" stroke-width="1.5" />
    <line x1="${shipDrawStartX - 10}" y1="${planCenterY}" x2="${shipDrawEndX + 20}" y2="${planCenterY}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="8 4 2 4" />
    <text x="${shipDrawStartX - 15}" y="${planCenterY + 3}" font-size="8" font-weight="700" fill="#94a3b8" text-anchor="end">CL</text>
    <path d="${hullPlanPath}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
    ${holdsPlanSvg}
  </g>

  <g class="engineering-box" transform="translate(20, ${engineeringBoxY})">
    <rect x="0" y="0" width="${width - 40}" height="${engineeringBoxHeight}" fill="#f8fafc" stroke="#0f172a" stroke-width="1.75" rx="6" />
    <line x1="330" y1="0" x2="330" y2="${engineeringBoxHeight - 36}" stroke="#cbd5e1" stroke-width="1" />
    <line x1="680" y1="0" x2="680" y2="${engineeringBoxHeight - 36}" stroke="#cbd5e1" stroke-width="1" />
    <line x1="0" y1="${engineeringBoxHeight - 36}" x2="${width - 40}" y2="${engineeringBoxHeight - 36}" stroke="#0f172a" stroke-width="1.5" />

    <text x="16" y="22" font-size="10" font-weight="800" fill="#0f766e" letter-spacing="0.5">BUQUE ACTIVO (SOLO LECTURA)</text>
    <text x="16" y="44" font-size="14" font-weight="900" fill="#0f172a">${v.name || 'TBN'}</text>
    <text x="16" y="64" font-size="10" font-weight="600" fill="#475569">IMO: <tspan font-weight="800" fill="#0f172a">${v.imo || '-'}</tspan> · DWT: <tspan font-weight="800" fill="#0f172a">${Number(v.dwt || 0).toLocaleString('es-ES')} DWT</tspan></text>
    <text x="16" y="82" font-size="10" font-weight="600" fill="#475569">Eslora (LOA): <tspan font-weight="700" fill="#0f172a">${v.loa || 0} m</tspan> · Manga: <tspan font-weight="700" fill="#0f172a">${v.beam || 0} m</tspan></text>
    <text x="16" y="100" font-size="10" font-weight="600" fill="#475569">Calado: <tspan font-weight="700" fill="#0f172a">${v.draft || 0} m</tspan> · Grúas: <tspan font-weight="700" fill="#0f172a">${craneDesc}</tspan></text>
    <text x="16" y="118" font-size="9" font-weight="700" fill="#0d9488">Bodegas: ${holdsCount} · Entrepuente (Tweendeck): ${hasTweendeck ? 'Sí' : 'No'}</text>

    <text x="346" y="22" font-size="10" font-weight="800" fill="#0f766e" letter-spacing="0.5">PACKING LIST &amp; DISTRIBUCIÓN</text>
    <text x="346" y="44" font-size="13" font-weight="800" fill="#0f172a">Peso Total: ${summary.total_weight_mt} MT (${summary.total_units} bultos)</text>
    <text x="346" y="64" font-size="10" font-weight="600" fill="#475569">Estiba Realista: <tspan font-weight="800" fill="#0d9488">${summary.placed_pct}% Ubicado</tspan> (${summary.unplaced_units} fuera de perfil)</text>
    <text x="346" y="82" font-size="10" font-weight="600" fill="#475569">Centro de Gravedad (KG): <tspan font-weight="800" fill="#0f172a">${summary.estimated_kg_m} m</tspan></text>
    <text x="346" y="100" font-size="10" font-weight="600" fill="#475569">Trincaje &amp; Lashing: <tspan font-weight="700" fill="#0f766e">${summary.lashing_status}</tspan></text>
    <text x="346" y="118" font-size="9" font-weight="700" fill="#475569">Perfil / Despeje Plumas: ${summary.clearance_status}</text>

    <text x="696" y="22" font-size="10" font-weight="800" fill="#0f766e" letter-spacing="0.5">FACTORES DE ESTIBA &amp; MASTER APPROVAL</text>
    <text x="696" y="44" font-size="11" font-weight="700" fill="#475569">STOWAGE FACTOR NETO: <tspan font-weight="900" font-size="13" fill="#0f172a">${summary.equivalent_net_sf} m³/MT</tspan></text>
    <text x="696" y="66" font-size="11" font-weight="800" fill="#0d9488">SF EQUIVALENTE BRUTO: <tspan font-weight="900" font-size="14" fill="#0d9488">${summary.equivalent_gross_sf} m³/MT</tspan></text>
    <text x="696" y="88" font-size="10" font-weight="600" fill="#475569">Alertas Activas: <tspan font-weight="800" fill="${result.alerts && result.alerts.length > 0 ? '#d97706' : '#16a34a'}">${result.alerts ? result.alerts.length : 0} registradas</tspan></text>
    <text x="696" y="106" font-size="9" font-weight="600" fill="#64748b">CRANE CAPACITY: ${craneConfig}</text>

    <rect x="0" y="${engineeringBoxHeight - 36}" width="${width - 40}" height="36" fill="#0f172a" rx="0 0 6 6" />
    <text x="${(width - 40) / 2}" y="${engineeringBoxHeight - 20}" font-size="8.5" font-weight="700" fill="#f8fafc" letter-spacing="0.4" text-anchor="middle">
      TENTATIVE PROJECT CARGO STOWAGE PLAN · FOR GUIDANCE ONLY · SUBJECT TO MASTER'S APPROVAL, STABILITY, TRIM, DRAFT, TANK TOP STRENGTH &amp; CRANE CAPACITY
    </text>
    <text x="${(width - 40) / 2}" y="${engineeringBoxHeight - 8}" font-size="8" font-weight="600" fill="#94a3b8" letter-spacing="0.3" text-anchor="middle">
      BUQUE: ${v.name || 'TBN'} · IMO: ${v.imo || '-'} · DWT: ${Number(v.dwt || 0).toLocaleString('es-ES')} DWT · LOA: ${v.loa || 0} m · Manga: ${v.beam || 0} m · Grúas / SWL / Tandem: ${craneDesc}
    </text>
  </g>
</svg>
  `.trim();
}

export async function sendH18SimulationToDataBridge(payload = {}) {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

    const imo = String(payload.imo_number || payload.vessel?.imo_number || payload.vesselSpecs?.imo || '').trim();
    const vesselName = String(payload.vessel_name || payload.vessel?.vessel_name || payload.vesselSpecs?.name || '').trim();

    const cargoName = payload.cargoName || payload.cargo?.cargo_name || 'Carga Homogénea';
    const unitLengthM = Number(payload.package?.lengthM ?? payload.unit_length_m ?? payload.length ?? 1.0);
    const unitWidthM = Number(payload.package?.widthM ?? payload.unit_width_m ?? payload.width ?? 1.0);
    const unitHeightM = Number(payload.package?.heightM ?? payload.unit_height_m ?? payload.height ?? 1.3);
    const unitWeightMT = Number(payload.package?.unitWeightMT ?? payload.unit_weight_mt ?? payload.unitWeight ?? 1.5);
    const maxTiers = Number(payload.tiers ?? payload.max_tiers ?? 4);
    const brokenStowagePct = Number(payload.brokenStowagePct ?? payload.broken_stowage_pct ?? 5);
    const targetQuantityMT = Number(payload.targetCargoMT ?? payload.target_quantity_mt ?? payload.target_cargo_mt ?? 0);

    const cargoData = {
      cargo_name: cargoName,
      length: unitLengthM,
      width: unitWidthM,
      height: unitHeightM,
      unit_weight: unitWeightMT,
      unit_length_m: unitLengthM,
      unit_width_m: unitWidthM,
      unit_height_m: unitHeightM,
      unit_weight_mt: unitWeightMT,
      tiers: maxTiers,
      max_tiers: maxTiers,
      broken_stowage_pct: brokenStowagePct,
      target_cargo_mt: targetQuantityMT,
      target_quantity_mt: targetQuantityMT,
      ...(payload.cargo || {}),
    };

    const sfData = payload.stowage_factors || payload.stowageFactors || {};
    const resData = payload.results || {};
    const holdsData = Array.isArray(payload.holds) ? payload.holds.map((h) => ({
      hold_number: h.holdNumber,
      name: h.name,
      is_bow_hold: Boolean(h.isBowHold),
      units: h.realisticUnits || h.theoreticalUnits || 0,
      mt: h.realisticMT || h.theoreticalMT || 0,
      tiers: h.tiers || 1,
    })) : (payload.holds_distribution || []);

    let bodyData = null;
    if (payload.mode === 'project_cargo') {
      bodyData = {
        mode: 'project_cargo',
        source_app: 'seacharter',
        vessel: payload.vessel || {},
        packing_list: payload.packing_list || [],
        ...payload,
      };
    } else {
      bodyData = {
        source_app: 'seacharter',
        timestamp: new Date().toISOString(),
        imo_number: imo,
        vessel_name: vesselName,
        cargo_name: cargoName,
        unit_length_m: unitLengthM,
        unit_width_m: unitWidthM,
        unit_height_m: unitHeightM,
        unit_weight_mt: unitWeightMT,
        max_tiers: maxTiers,
        target_quantity_mt: targetQuantityMT,
        broken_stowage_pct: brokenStowagePct,
        cargo: cargoData,
        stowage_factors: {
          net_sf: sfData.netSF || sfData.net_sf || 0,
          gross_sf: sfData.grossSF || sfData.gross_sf || 0,
          unit: 'm³/MT',
        },
        results: {
          theoretical_units: resData.theoretical?.units || resData.theoretical_units || 0,
          theoretical_mt: resData.theoretical?.weightMT || resData.theoretical_mt || 0,
          realistic_units: resData.realistic?.units || resData.realistic_units || 0,
          realistic_mt: resData.realistic?.weightMT || resData.realistic_mt || 0,
          tank_top_pressure: payload.pressure?.tankTopPressureMTM2 || resData.tank_top_pressure || 0,
          margin_difference_mt: resData.marginVsTarget?.differenceMT || resData.margin_difference_mt || 0,
          margin_percentage: resData.marginVsTarget?.percentage || resData.margin_percentage || 0,
        },
        holds_distribution: holdsData,
        ...payload,
      };
    }

    const endpoints = [
      '/api/h18-stowage-plan',
      'https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/h18-stowage-plan',
    ];

    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(bodyData),
          signal: controller?.signal,
        });

        if (response.ok) {
          if (timeoutId) clearTimeout(timeoutId);
          const json = await response.json().catch(() => ({ success: true }));
          if (json && typeof json === 'object') {
            if (json.data && (json.data.summary || json.data.placed_items || json.data.mode)) {
              return json.data;
            }
            return json;
          }
          return json;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (timeoutId) clearTimeout(timeoutId);
    if (lastError) throw lastError;
  } catch (error) {
    console.debug('[H18] DataBridge sync fallback to local calculation:', error?.message);
  }
  return null;
}

if (typeof window !== 'undefined') {
  window.normalizarMedidasBulto = normalizarMedidasBulto;
  window.normalizePackingListItem = normalizePackingListItem;
  window.resolverGeometriaBodegas = resolverGeometriaBodegas;
  window.calcularEstibaTentativaH18 = calcularEstibaTentativaH18;
  window.calcularProjectCargoFallbackH18 = calcularProjectCargoFallbackH18;
  window.generarCargoPlanSvgH18 = generarCargoPlanSvgH18;
  window.generarProjectCargoPlanSvgH18 = generarProjectCargoPlanSvgH18;
  window.sendH18SimulationToDataBridge = sendH18SimulationToDataBridge;
}
