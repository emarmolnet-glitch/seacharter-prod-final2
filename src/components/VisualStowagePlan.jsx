import React from 'react';

/**
 * Normaliza y resuelve el perfil naval a partir del tipo de buque indicado.
 * Perfiles soportados:
 * - 'COASTER': Coaster, Mini-Bulker, cabotaje, costero, con 1 o 2 bodegas diáfanas largas y sin grúas pesadas.
 * - 'RORO': Ro-Ro, Ro-Lo, Pure Car Carrier, con cubiertas horizontales continuas y rampa en popa.
 * - 'HANDYSIZE': Handysize, MPP, Multi-Purpose, Bulk Carrier, Geared Breakbulk con 4 bodegas independientes y grúas de a bordo.
 */
export function resolveVesselProfile(vesselType = '', title = '') {
  const text = `${vesselType} ${title}`.toLowerCase();
  if (text.includes('ro-ro') || text.includes('roro') || text.includes('ro-lo') || text.includes('rolo') || text.includes('vehicle') || text.includes('car carrier')) {
    return 'RORO';
  }
  if (text.includes('coaster') || text.includes('mini-bulker') || text.includes('minibulker') || text.includes('mini bulker') || text.includes('cabotage') || text.includes('cabotaje') || text.includes('costero')) {
    return 'COASTER';
  }
  return 'HANDYSIZE';
}

/**
 * Adapta el razonamiento técnico de ingeniería naval al perfil Ro-Ro,
 * sustituyendo terminología estática de buques convencionales/MPP (cunas de madera, Tanktop)
 * por terminología técnica dinámica de buques Ro-Ro / Pure Car Carrier.
 */
export function adaptRoRoJustification(text = '', profile = 'HANDYSIZE') {
  if (profile !== 'RORO' || typeof text !== 'string') return text;
  return text
    .replace(/posicionada en el Doble Fondo Reforzado \(Tanktop[^)]*\)\s*sobre cunas estructurales de madera y trincaje pesado G80/gi,
      'posicionada en cubiertas horizontales con estiba rodada asegurada con cadenas G80 en cubiertas horizontales')
    .replace(/sobre cunas (?:estructurales de madera|de madera estructurales|de madera)/gi,
      'con estiba rodada asegurada con cadenas G80 en cubiertas horizontales')
    .replace(/cunas (?:estructurales de madera|de madera estructurales|de madera)/gi,
      'estiba rodada asegurada con cadenas G80 en cubiertas horizontales')
    .replace(/en el Doble Fondo Reforzado \(Tanktop[^)]*\)/gi,
      'en cubiertas horizontales continuas (Main Deck / Lower Hold Deck)')
    .replace(/Tanktop \(fondo de bodega\)/gi,
      'cubiertas horizontales continuas')
    .replace(/en fondo de bodega \(Tanktop\)/gi,
      'en cubiertas horizontales continuas')
    .replace(/\bTanktop\b/gi,
      'Cubiertas Horizontales')
    .replace(/en bodegas y compartimentos/gi,
      'en cubiertas horizontales y niveles de carga rodada');
}

/**
 * VisualStowagePlan
 *
 * Representación visual gráfica (2D) del buque mercante y sus bodegas de carga
 * en corte esquemático longitudinal (perfil lateral), optimizada para Modo Claro
 * e Impresión ejecutiva de alta legibilidad en PDF.
 *
 * Adapta dinámicamente la arquitectura naval (SVG y cuadrícula estructurada) según
 * el tipo de buque seleccionado automáticamente en la Calculadora / Data Bridge.
 *
 * @param {Object} props
 * @param {Object} props.stowagePlan - Modelo matricial de estiba (holds, weatherDeck, hydrodynamicsAndSafety, vesselModel)
 * @param {string} [props.vesselType] - Tipo o descripción del buque
 * @param {string} [props.projectRef] - Referencia del proyecto / expediente
 */
export function VisualStowagePlan({
  stowagePlan = null,
  vesselType = 'Handysize MPP 32.000 DWT',
  projectRef = '',
}) {
  const profile = resolveVesselProfile(vesselType, stowagePlan?.vesselModel?.type || '');

  const rawHolds = Array.isArray(stowagePlan?.holds) ? stowagePlan.holds : [];
  const deck = stowagePlan?.weatherDeck || {};
  const hydro = stowagePlan?.hydrodynamicsAndSafety || {};
  const classification = stowagePlan?.cargoClassification || {};

  // Buque estándar base: 4 bodegas intermedias
  const defaultHolds = [
    { holdNumber: 1, name: 'Bodega 1 (Proa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
    { holdNumber: 2, name: 'Bodega 2 (Crujía Proa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
    { holdNumber: 3, name: 'Bodega 3 (Crujía Popa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
    { holdNumber: 4, name: 'Bodega 4 (Popa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
  ];

  const sourceHolds = rawHolds.length > 0 ? rawHolds : defaultHolds;

  // Totales globales brutos
  const rawTotalWeight = Number(
    classification.totalWeightTons ||
    sourceHolds.reduce((acc, h) => acc + (Number(h.totalWeightTons) || 0), 0) +
    (Number(deck.totalWeightTons) || 0)
  );

  // =========================================================================
  // ADAPTACIÓN DE DATOS Y ESTIBA POR PERFIL NAVAL:
  // - COASTER / MINI-BULKER: Solo 2 bodegas diáfanas largas. Bloquea inyección en bodegas 3 y 4
  //   reasignando proporcionalmente la carga total a las bodegas 1 y 2.
  // - RORO / ROLO: Cubiertas horizontales (Weather Deck, Main Deck, Lower Deck).
  // - HANDYSIZE / MPP / BULK CARRIER: 4 bodegas independientes estándar con grúas.
  // =========================================================================
  let displayHolds = [];
  let roroDecks = [];

  if (profile === 'COASTER') {
    // Si la entrada trae más de 2 bodegas con carga, consolidar la carga de 3 y 4 en las bodegas 1 y 2
    const h1Weight = Number(sourceHolds[0]?.totalWeightTons || 0) + Number(sourceHolds[2]?.totalWeightTons || 0);
    const h2Weight = Number(sourceHolds[1]?.totalWeightTons || 0) + Number(sourceHolds[3]?.totalWeightTons || 0);
    const totalHoldsWeight = h1Weight + h2Weight;

    displayHolds = [
      {
        holdNumber: 1,
        name: 'Bodega 1 Diáfana (Proa)',
        totalWeightTons: h1Weight,
        weightPercentage: totalHoldsWeight > 0 ? (h1Weight / totalHoldsWeight) * 100 : 0,
        totalVolumeCbm: Number(sourceHolds[0]?.totalVolumeCbm || 0) + Number(sourceHolds[2]?.totalVolumeCbm || 0),
        stowageTier: sourceHolds[0]?.stowageTier || 'Bodega Corrida Diáfana',
      },
      {
        holdNumber: 2,
        name: 'Bodega 2 Diáfana (Popa)',
        totalWeightTons: h2Weight,
        weightPercentage: totalHoldsWeight > 0 ? (h2Weight / totalHoldsWeight) * 100 : 0,
        totalVolumeCbm: Number(sourceHolds[1]?.totalVolumeCbm || 0) + Number(sourceHolds[3]?.totalVolumeCbm || 0),
        stowageTier: sourceHolds[1]?.stowageTier || 'Bodega Corrida Diáfana',
      },
    ];
  } else if (profile === 'RORO') {
    displayHolds = sourceHolds;
    const totalW = rawTotalWeight > 0 ? rawTotalWeight : 1;
    // Distribución en 3 cubiertas horizontales continuas
    const weatherWeight = Number(deck.totalWeightTons || (rawTotalWeight * 0.25));
    const mainWeight = rawTotalWeight > 0 ? Math.max(0, rawTotalWeight * 0.50) : 0;
    const lowerWeight = Math.max(0, rawTotalWeight - weatherWeight - mainWeight);

    roroDecks = [
      { id: 'weather', name: 'Cubierta Superior (Weather Deck)', weightMT: weatherWeight, weightPct: (weatherWeight / totalW) * 100, role: 'Unidades Rodadas / High & Heavy', clearance: '4.80 m' },
      { id: 'main', name: 'Cubierta Principal (Main Car Deck)', weightMT: mainWeight, weightPct: (mainWeight / totalW) * 100, role: 'Carga Rodada Comercial / Tráilers', clearance: '5.20 m' },
      { id: 'lower', name: 'Cubierta Inferior (Lower Hold Deck)', weightMT: lowerWeight, weightPct: (lowerWeight / totalW) * 100, role: 'Vehículos Ligeros / Plataformas Mafi', clearance: '3.10 m' },
    ];
  } else {
    displayHolds = sourceHolds;
  }

  const totalWeightTons = Number(classification.totalWeightTons || rawTotalWeight);
  const deckWeightTons = Number(deck.totalWeightTons || 0);
  const deckWeightPct = Number(deck.weightPercentage || 0);
  const isDeckLoaded = deckWeightTons > 0;

  // Validación técnica e hidrodinámica
  const volOccupied = Number(hydro.totalVolumeOccupiedCbm || classification.totalVolumeCbm || 0);
  const volCapacity = Number(hydro.grainCapacityCbm || 30300);
  const volUtilizationPct = Number(hydro.volumeUtilizationShipPct || (volCapacity > 0 ? (volOccupied / volCapacity) * 100 : 0));
  const isVolExceeded = Boolean(hydro.isCubicCapacityExceeded);

  const maxPressure = Number(hydro.maxFloorPressureTm2 || 0);
  const maxAllowablePressure = Number(hydro.maxFloorAllowableTm2 || 20.0);
  const isPressureExceeded = Boolean(hydro.isPermissibleLoadExceeded);

  const gm = Number(hydro.metacentricHeightGmEstimatedM || 1.55);

  const profileBadgeLabel = profile === 'COASTER'
    ? 'COASTER / MINI-BULKER (1-2 BODEGAS DIÁFANAS · GEARLESS)'
    : profile === 'RORO'
    ? 'RO-RO / RO-LO CARRIER (CUBIERTAS CORRIDAS & RAMPA POPA)'
    : 'HANDYSIZE / BULK CARRIER (4 BODEGAS INDEPENDIENTES & GRÚAS)';

  return (
    <div
      className="visual-stowage-plan-wrapper bg-white text-slate-800 border-2 border-slate-300 rounded-xl p-4 sm:p-6 shadow-md mb-4 print:bg-white print:text-slate-800 print:border-slate-300 print:shadow-none break-inside-avoid"
      style={{
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      {/* Barra superior de telemetría y título del plano (Modo Claro) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.4)]" />
          <span className="text-xs font-black uppercase tracking-wider text-slate-900">
            UNIVERSAL STOWAGE ENGINE · SEACHARTER PRO
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold">
            CORTE ESQUEMÁTICO 2D
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold uppercase">
            {profileBadgeLabel}
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-600 flex items-center gap-3">
          <span><strong className="text-slate-800 uppercase text-[10px]">Carga Total:</strong> {totalWeightTons.toFixed(2)} MT</span>
          <span><strong className="text-slate-800 uppercase text-[10px]">Buque Activo:</strong> {vesselType}</span>
        </div>
      </div>

      {/* Indicadores direccionales Proa / Popa en gris oscuro sobre fondo claro */}
      <div className="flex justify-between items-center text-[10px] font-mono font-bold tracking-widest text-gray-700 uppercase mb-2 px-2">
        <div className="flex items-center gap-1.5 text-gray-700">
          <span className="text-blue-700">◀</span>
          <span>[PROA / BOW - FORWARD]</span>
        </div>
        <div className="text-[9px] text-gray-500 font-sans tracking-normal hidden sm:block">
          PERFIL LONGITUDINAL DE ESTIBA &amp; SEGREGACIÓN DE BODEGAS (VISTA CLARA)
        </div>
        <div className="flex items-center gap-1.5 text-gray-700">
          <span>[POPA / STERN - AFT]</span>
          <span className="text-blue-700">▶</span>
        </div>
      </div>

      {/* Silueta Lateral Esquemática 2D en Modo Claro (Gráfico Vectorial SVG) */}
      <div className="relative w-full overflow-hidden rounded-lg bg-gray-100 border border-gray-400 p-2 sm:p-3 my-2 shadow-inner">
        <svg
          viewBox="0 0 1000 320"
          className="w-full h-auto select-none"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Silueta lateral esquemática del buque y sus bodegas en modo claro"
        >
          <defs>
            {/* Gradientes y estilos en modo claro para impresión nítida */}
            <linearGradient id="vesselHullGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f3f4f6" />
              <stop offset="70%" stopColor="#e5e7eb" />
              <stop offset="100%" stopColor="#d1d5db" />
            </linearGradient>

            <linearGradient id="waterlineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#0369a1" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.6" />
            </linearGradient>

            <linearGradient id="loadedHoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            <linearGradient id="emptyHoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>

            <linearGradient id="deckActiveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            <linearGradient id="superstructureGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>

            <pattern id="cargoHatchPattern" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M-2,2 l4,-4 M0,10 l10,-10 M8,12 l4,-4" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.2" />
            </pattern>
          </defs>

          {/* Línea de flotación / Nivel del mar */}
          <line x1="30" y1="282" x2="970" y2="282" stroke="url(#waterlineGrad)" strokeWidth="2.5" strokeDasharray="6 4" />
          <text x="500" y="298" fill="#0369a1" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
            ≈ ≈ ≈ WATERLINE / CALADO DE DISEÑO ≈ ≈ ≈
          </text>

          {/* ======================================================== */}
          {/* SILUETA DEL BUQUE: Casco, Proa y Popa (Gris Tenue / Borde Medio) */}
          {/* ======================================================== */}
          <path
            d="
              M 80,120
              L 160,120
              L 810,120
              L 840,120
              L 910,120
              L 930,135
              L 930,190
              L 900,240
              L 860,265
              L 810,275
              L 150,275
              L 95,250
              L 55,200
              L 40,150
              Z
            "
            fill="url(#vesselHullGrad)"
            stroke="#9ca3af"
            strokeWidth="2"
          />

          {/* Bulbo de proa esquemático */}
          <path
            d="M 55,200 Q 25,230 45,250 Q 75,255 95,250 Z"
            fill="#e5e7eb"
            stroke="#9ca3af"
            strokeWidth="1.5"
          />

          {/* Castillo de Proa (Forecastle) */}
          <path
            d="M 40,150 L 70,95 L 140,95 L 160,120 Z"
            fill="url(#superstructureGrad)"
            stroke="#9ca3af"
            strokeWidth="1.5"
          />
          <line x1="70" y1="95" x2="140" y2="95" stroke="#64748b" strokeWidth="1.5" />
          <line x1="105" y1="95" x2="105" y2="60" stroke="#475569" strokeWidth="2" />
          <line x1="95" y1="70" x2="115" y2="70" stroke="#475569" strokeWidth="1.5" />
          <circle cx="105" cy="58" r="2.5" fill="#0284c7" />
          <text x="105" y="112" fill="#374151" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
            CASTILLO PROA
          </text>

          {/* Castillo de Popa / Superestructura y Puente de Mando */}
          <g id="superstructure-aft">
            <rect x="805" y="65" width="105" height="55" rx="3" fill="url(#superstructureGrad)" stroke="#9ca3af" strokeWidth="1.5" />
            <line x1="815" y1="80" x2="895" y2="80" stroke="#0284c7" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.9" />
            <line x1="815" y1="95" x2="895" y2="95" stroke="#0284c7" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.9" />

            <rect x="825" y="32" width="75" height="33" rx="2" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
            <rect x="830" y="38" width="65" height="12" rx="1.5" fill="#bae6fd" stroke="#0284c7" strokeWidth="1" />

            <path d="M 875,32 L 880,12 L 895,12 L 892,32 Z" fill="#dc2626" stroke="#b91c1c" strokeWidth="1.5" />
            <line x1="878" y1="18" x2="894" y2="18" stroke="#ffffff" strokeWidth="2" />

            <line x1="860" y1="32" x2="860" y2="10" stroke="#475569" strokeWidth="2" />
            <line x1="850" y1="16" x2="870" y2="16" stroke="#475569" strokeWidth="1.5" />
            <circle cx="860" cy="9" r="2.5" fill="#d97706" />

            <text x="857" y="112" fill="#374151" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              PUENTE / POPA
            </text>
          </g>

          {/* ======================================================== */}
          {/* GRÚAS: SOLO en perfil MPP / Handysize / Bulk Carrier      */}
          {/* En perfil COASTER se eliminan (gearless o grúas ligeras) */}
          {/* En perfil RORO se omiten (operativa rodada con rampa)    */}
          {/* ======================================================== */}
          {profile === 'HANDYSIZE' && (
            <g id="deck-cranes" stroke="#64748b" opacity="0.95">
              <rect x="305" y="90" width="16" height="30" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="313" cy="90" r="5" fill="#475569" />
              <line x1="313" y1="90" x2="265" y2="45" stroke="#334155" strokeWidth="3" />
              <line x1="265" y1="45" x2="265" y2="115" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
              <rect x="261" y="115" width="8" height="5" fill="#d97706" />

              <rect x="635" y="90" width="16" height="30" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
              <circle cx="643" cy="90" r="5" fill="#475569" />
              <line x1="643" y1="90" x2="595" y2="45" stroke="#334155" strokeWidth="3" />
              <line x1="595" y1="45" x2="595" y2="115" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
              <rect x="591" y="115" width="8" height="5" fill="#d97706" />
            </g>
          )}

          {/* RAMPA DE POPA (STERN RAMP) en perfil RORO / ROLO */}
          {profile === 'RORO' && (
            <g id="stern-ramp">
              {/* Rampa abatible angular exterior en Popa */}
              <polygon points="910,230 965,275 965,282 905,255" fill="#0284c7" stroke="#0369a1" strokeWidth="2" />
              {/* Cintas de tracción / cables de soporte */}
              <line x1="880" y1="125" x2="960" y2="275" stroke="#475569" strokeWidth="2" strokeDasharray="3 2" />
              <rect x="910" y="248" width="55" height="14" rx="2" fill="#1e3a8a" />
              <text x="937" y="258" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                RAMPA POPA
              </text>
            </g>
          )}

          {/* ======================================================== */}
          {/* CUBIERTA SUPERIOR / WEATHER DECK                         */}
          {/* ======================================================== */}
          <g id="weather-deck-slot">
            <rect
              x="165"
              y="114"
              width="635"
              height="14"
              rx="2"
              fill={isDeckLoaded ? 'url(#deckActiveGrad)' : '#ffffff'}
              stroke={isDeckLoaded ? '#1d4ed8' : '#cbd5e1'}
              strokeWidth="1.2"
            />
            <text
              x="482"
              y="124"
              fill={isDeckLoaded ? '#ffffff' : '#374151'}
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
              letterSpacing="0.8"
            >
              {isDeckLoaded
                ? `CUBIERTA / WEATHER DECK: ${deckWeightTons.toFixed(2)} MT (${deckWeightPct.toFixed(1)}%)`
                : profile === 'RORO'
                ? 'WEATHER DECK HORIZONTAL (CUBIERTA RODADA ALTA)'
                : 'CUBIERTA SUPERIOR (WEATHER DECK) DESPEJADA · CAPACIDAD: 3.50 t/m²'}
            </text>
          </g>

          {/* ======================================================== */}
          {/* ARQUITECTURA DINÁMICA: RORO (CUBIERTAS HORIZONTALES) O    */}
          {/* BODEGAS VERTICALES (COASTER 1-2 BODEGAS vs HANDYSIZE 4)   */}
          {/* ======================================================== */}
          {profile === 'RORO' ? (
            <g id="roro-horizontal-decks">
              {roroDecks.map((d, dIdx) => {
                const deckY = 138 + dIdx * 40;
                const deckHeight = 34;
                const isLoaded = d.weightMT > 0;
                return (
                  <g key={`deck-tier-${d.id}`}>
                    <rect
                      x="165"
                      y={deckY}
                      width="635"
                      height={deckHeight}
                      rx="3"
                      fill={isLoaded ? 'url(#loadedHoldGrad)' : 'url(#emptyHoldGrad)'}
                      stroke={isLoaded ? '#1d4ed8' : '#cbd5e1'}
                      strokeWidth={isLoaded ? '2' : '1.2'}
                    />
                    {isLoaded && (
                      <rect x="165" y={deckY} width="635" height={deckHeight} rx="3" fill="url(#cargoHatchPattern)" />
                    )}
                    <text
                      x="175"
                      y={deckY + 21}
                      fill={isLoaded ? '#ffffff' : '#1f2937'}
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {d.name.toUpperCase()} (Puntal {d.clearance})
                    </text>
                    <text
                      x="785"
                      y={deckY + 21}
                      fill={isLoaded ? '#ffffff' : '#1f2937'}
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {d.weightMT.toFixed(1)} MT ({d.weightPct.toFixed(1)}% peso) · {isLoaded ? 'ESTIBA RODADA' : 'DISPONIBLE'}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : (
            (() => {
              const activeCount = profile === 'COASTER' ? 2 : Math.min(4, Math.max(2, displayHolds.length));
              const totalWidth = 630;
              const gap = 12;
              const holdWidth = (totalWidth - (gap * (activeCount - 1))) / activeCount;
              const startX = 165;
              const holdY = 135;
              const holdHeight = 125;

              return displayHolds.slice(0, activeCount).map((hold, idx) => {
                const hX = startX + idx * (holdWidth + gap);
                const weightMT = Number(hold.totalWeightTons || 0);
                const weightPct = Number(hold.weightPercentage || 0);
                const isLoaded = weightMT > 0 || weightPct > 0;
                const holdNum = hold.holdNumber || (idx + 1);
                const holdTitle = profile === 'COASTER'
                  ? `Bodega Diáfana ${holdNum}`
                  : `Bodega ${holdNum}`;

                return (
                  <g key={`hold-visual-${holdNum}`} className="cursor-default transition-all">
                    {/* Contenedor / Bodega estructural */}
                    <rect
                      x={hX}
                      y={holdY}
                      width={holdWidth}
                      height={holdHeight}
                      rx="4"
                      fill={isLoaded ? 'url(#loadedHoldGrad)' : 'url(#emptyHoldGrad)'}
                      stroke={isLoaded ? '#1d4ed8' : '#cbd5e1'}
                      strokeWidth={isLoaded ? '2' : '1.2'}
                    />

                    {isLoaded && (
                      <rect
                        x={hX}
                        y={holdY}
                        width={holdWidth}
                        height={holdHeight}
                        rx="4"
                        fill="url(#cargoHatchPattern)"
                      />
                    )}

                    {/* Escotilla superior */}
                    <rect
                      x={hX + 6}
                      y={holdY - 4}
                      width={holdWidth - 12}
                      height="5"
                      rx="1"
                      fill={isLoaded ? '#1d4ed8' : '#e2e8f0'}
                      stroke={isLoaded ? '#1e40af' : '#94a3b8'}
                      strokeWidth="1"
                    />

                    {/* Cabecera de Bodega */}
                    <rect
                      x={hX}
                      y={holdY}
                      width={holdWidth}
                      height="22"
                      rx="3"
                      fill={isLoaded ? '#1e40af' : '#f1f5f9'}
                    />
                    <text
                      x={hX + holdWidth / 2}
                      y={holdY + 15}
                      fill={isLoaded ? '#ffffff' : '#1f2937'}
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      letterSpacing="0.5"
                    >
                      {holdTitle.toUpperCase()}
                    </text>

                    {/* Datos de Carga en el centro de la bodega */}
                    {isLoaded ? (
                      <g>
                        <rect
                          x={hX + 10}
                          y={holdY + 36}
                          width={holdWidth - 20}
                          height="40"
                          rx="4"
                          fill="#1e3a8a"
                          stroke="#93c5fd"
                          strokeWidth="1"
                        />
                        <text
                          x={hX + holdWidth / 2}
                          y={holdY + 54}
                          fill="#ffffff"
                          fontSize="13"
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {weightMT.toFixed(1)} MT
                        </text>
                        <text
                          x={hX + holdWidth / 2}
                          y={holdY + 70}
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {weightPct.toFixed(1)}% peso
                        </text>

                        <text
                          x={hX + holdWidth / 2}
                          y={holdY + 95}
                          fill="#ffffff"
                          fontSize="9"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                          textAnchor="middle"
                        >
                          {hold.stowageTier || (profile === 'COASTER' ? 'Bodega Corrida Diáfana' : 'Tanktop / Bloque')}
                        </text>

                        <rect
                          x={hX + 15}
                          y={holdY + 106}
                          width={holdWidth - 30}
                          height="12"
                          rx="2"
                          fill="#15803d"
                        />
                        <text
                          x={hX + holdWidth / 2}
                          y={holdY + 115}
                          fill="#ffffff"
                          fontSize="8"
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          CARGA ACTIVA
                        </text>
                      </g>
                    ) : (
                      <g>
                        <rect
                          x={hX + 12}
                          y={holdY + 45}
                          width={holdWidth - 24}
                          height="30"
                          rx="3"
                          fill="#f8fafc"
                          stroke="#e2e8f0"
                          strokeWidth="1"
                        />
                        <text
                          x={hX + holdWidth / 2}
                          y={holdY + 60}
                          fill="#1f2937"
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          0.0 MT (0%)
                        </text>
                        <text
                          x={hX + holdWidth / 2}
                          y={holdY + 70}
                          fill="#4b5563"
                          fontSize="8.5"
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          DISPONIBLE
                        </text>
                        <text
                          x={hX + holdWidth / 2}
                          y={holdY + 102}
                          fill="#1f2937"
                          fontSize="9"
                          fontWeight="semibold"
                          fontFamily="sans-serif"
                          textAnchor="middle"
                        >
                          Bodega Vacía
                        </text>
                      </g>
                    )}

                    {/* Fondo de Bodega */}
                    <line
                      x1={hX + 2}
                      y1={holdY + holdHeight - 1}
                      x2={hX + holdWidth - 2}
                      y2={holdY + holdHeight - 1}
                      stroke="#059669"
                      strokeWidth="2.5"
                    />
                  </g>
                );
              });
            })()
          )}

          {/* Línea de Tanktop continua */}
          <line x1="165" y1="262" x2="795" y2="262" stroke="#059669" strokeWidth="2" strokeDasharray="4 2" />
          <text x="480" y="274" fill="#047857" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
            TANKTOP / DOBLE FONDO CONTINUO · RESISTENCIA ESTRUCTURAL MÁXIMA: 20.0 t/m²
          </text>
        </svg>
      </div>

      {/* Leyenda y Resumen Rápido de Compartimentos */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono text-gray-700 mt-3 pt-3 border-t border-slate-200">
        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 border border-blue-700 shrink-0" />
          <span className="truncate font-semibold">Cargada (&gt;0 MT)</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-sm bg-white border border-slate-400 shrink-0" />
          <span className="truncate font-semibold text-gray-800">Vacía (0 MT)</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 shrink-0" />
          <span className="truncate font-semibold text-emerald-800">Tanktop 20 t/m²</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
          <span className="truncate font-semibold">Cubierta {deckWeightTons > 0 ? `${deckWeightTons.toFixed(1)} MT` : 'Libre'}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded border border-slate-200 col-span-2 sm:col-span-1">
          <span className="text-amber-600 font-bold">⚓</span>
          <span className="truncate font-bold text-slate-800">Ref: {projectRef || 'EXP-PROYECTO'}</span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECCIÓN OBLIGATORIA: TABLA DE VALIDACIÓN TÉCNICA E HIDRODINÁMICA   */}
      {/* ==================================================================== */}
      <div className="mt-4 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="text-emerald-700">⚖️</span>
            <span>VALIDACIÓN TÉCNICA E HIDRODINÁMICA (CÓDIGO CSS OMI &amp; ESTABILIDAD INTACTA)</span>
          </h4>
          <span className="text-[10px] font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
            COMPLIANCE OMI 100%
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-xs">
          <table className="w-full text-left text-[11px] font-mono text-slate-800">
            <thead className="bg-slate-100 text-[10px] uppercase text-slate-700 border-b border-slate-300">
              <tr>
                <th className="py-2.5 px-3">Parámetro Técnico</th>
                <th className="py-2.5 px-3">Valor Estimado / Calculado</th>
                <th className="py-2.5 px-3">Límite Admisible Buque</th>
                <th className="py-2.5 px-3">Utilización (%)</th>
                <th className="py-2.5 px-3 text-right">Dictamen de Seguridad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="text-blue-600">📦</span> Volumen Cúbico Ocupado
                </td>
                <td className="py-2.5 px-3 font-bold text-blue-700">
                  {volOccupied.toFixed(2)} m³
                </td>
                <td className="py-2.5 px-3 text-slate-600">
                  {volCapacity.toLocaleString('es-ES')} m³ Grain
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{volUtilizationPct.toFixed(1)}%</span>
                    <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${isVolExceeded ? 'bg-rose-600' : 'bg-blue-600'}`}
                        style={{ width: `${Math.min(100, Math.max(2, volUtilizationPct))}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                    !isVolExceeded ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'
                  }`}>
                    {!isVolExceeded ? '✓ CUMPLE CAPACIDAD CÚBICA' : '⚠ EXCEDIDO'}
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="text-emerald-700">⚓</span> Presión Máx. Doble Fondo
                </td>
                <td className="py-2.5 px-3 font-bold text-emerald-700">
                  {maxPressure.toFixed(2)} t/m²
                </td>
                <td className="py-2.5 px-3 text-slate-600">
                  &lt;= {maxAllowablePressure.toFixed(1)} t/m²
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{maxAllowablePressure > 0 ? ((maxPressure / maxAllowablePressure) * 100).toFixed(1) : 0}%</span>
                    <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${isPressureExceeded ? 'bg-rose-600' : 'bg-emerald-600'}`}
                        style={{ width: `${Math.min(100, Math.max(2, maxAllowablePressure > 0 ? (maxPressure / maxAllowablePressure) * 100 : 0))}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                    !isPressureExceeded ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'
                  }`}>
                    {!isPressureExceeded ? '✓ RESISTENCIA T/M² VALIDADA' : '⚠ REQUIERE REPARTO PRESIÓN'}
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="text-blue-600">📐</span> Altura Metacéntrica (GM)
                </td>
                <td className="py-2.5 px-3 font-bold text-blue-700">
                  {gm.toFixed(2)} m
                </td>
                <td className="py-2.5 px-3 text-slate-600">
                  &gt;= 0.15 m (Código OMI Estabilidad)
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-emerald-700 font-bold">Óptimo (Estable)</span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                    ✓ ESTABILIDAD INTACTA [OK]
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const MemoizedVisualStowagePlan = React.memo(VisualStowagePlan);
export default VisualStowagePlan;

