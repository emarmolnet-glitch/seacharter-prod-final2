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
  if (vessel.holdsCount && Number(vessel.holdsCount) > 0) {
    holdsCount = Math.max(1, Math.min(9, Math.round(Number(vessel.holdsCount))));
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

    const bodyData = {
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
          return await response.json().catch(() => ({ success: true }));
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
  window.resolverGeometriaBodegas = resolverGeometriaBodegas;
  window.calcularEstibaTentativaH18 = calcularEstibaTentativaH18;
  window.generarCargoPlanSvgH18 = generarCargoPlanSvgH18;
  window.sendH18SimulationToDataBridge = sendH18SimulationToDataBridge;
}
