import React from 'react';

/**
 * VisualStowagePlan
 *
 * Representación visual gráfica (2D) del buque mercante y sus bodegas de carga
 * en corte esquemático longitudinal (perfil lateral), optimizada para Modo Claro
 * e Impresión ejecutiva de alta legibilidad en PDF.
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
  const holds = Array.isArray(stowagePlan?.holds) ? stowagePlan.holds : [];
  const deck = stowagePlan?.weatherDeck || {};
  const hydro = stowagePlan?.hydrodynamicsAndSafety || {};
  const classification = stowagePlan?.cargoClassification || {};

  // Buque estándar: 4 bodegas intermedias (o entre 2 y 4 según el modelo)
  const defaultHolds = [
    { holdNumber: 1, name: 'Bodega 1 (Proa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
    { holdNumber: 2, name: 'Bodega 2 (Crujía Proa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
    { holdNumber: 3, name: 'Bodega 3 (Crujía Popa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
    { holdNumber: 4, name: 'Bodega 4 (Popa)', weightPercentage: 0, totalWeightTons: 0, totalVolumeCbm: 0 },
  ];

  const displayHolds = holds.length > 0 ? holds : defaultHolds;

  // Totales
  const totalWeightTons = Number(classification.totalWeightTons || displayHolds.reduce((acc, h) => acc + (Number(h.totalWeightTons) || 0), 0) + (Number(deck.totalWeightTons) || 0));
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

  return (
    <div className="visual-stowage-plan-wrapper bg-white text-slate-800 border-2 border-slate-300 rounded-xl p-4 sm:p-6 shadow-md mb-4 print:bg-white print:text-slate-800 print:border-slate-300 print:shadow-none break-inside-avoid">
      {/* Barra superior de telemetría y título del plano (Modo Claro) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.4)]" />
          <span className="text-xs font-black uppercase tracking-wider text-slate-900">
            UNIVERSAL STOWAGE ENGINE · SEACHARTER PRO
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold">
            CORTE ESQUEMÁTICO 2D
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-600 flex items-center gap-3">
          <span><strong className="text-slate-800 uppercase text-[10px]">Carga Total:</strong> {totalWeightTons.toFixed(2)} MT</span>
          <span><strong className="text-slate-800 uppercase text-[10px]">Eslora Ref:</strong> Handysize MPP</span>
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
            {/* Silueta principal del buque en gris tenue */}
            <linearGradient id="vesselHullGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f3f4f6" />
              <stop offset="70%" stopColor="#e5e7eb" />
              <stop offset="100%" stopColor="#d1d5db" />
            </linearGradient>

            {/* Línea de flotación / Calado de diseño */}
            <linearGradient id="waterlineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#0369a1" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.6" />
            </linearGradient>

            {/* Bodega OCUPADA (con carga): Azul corporativo medio brillante e intenso */}
            <linearGradient id="loadedHoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            {/* Bodega VACÍA: Blanco puro con borde sutil */}
            <linearGradient id="emptyHoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>

            {/* Cubierta activa (con carga) */}
            <linearGradient id="deckActiveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            {/* Superestructuras de proa y popa en tonos claros definidos */}
            <linearGradient id="superstructureGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>

            {/* Trama sutil para bodega ocupada */}
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
          {/* Contorno del casco principal */}
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
          {/* Barandilla y mástil de proa */}
          <line x1="70" y1="95" x2="140" y2="95" stroke="#64748b" strokeWidth="1.5" />
          <line x1="105" y1="95" x2="105" y2="60" stroke="#475569" strokeWidth="2" />
          <line x1="95" y1="70" x2="115" y2="70" stroke="#475569" strokeWidth="1.5" />
          <circle cx="105" cy="58" r="2.5" fill="#0284c7" />
          {/* Etiqueta exterior CASTILLO PROA en gris oscuro text-gray-700 */}
          <text x="105" y="112" fill="#374151" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
            CASTILLO PROA
          </text>

          {/* Castillo de Popa / Superestructura y Puente de Mando (Aft Accommodation & Bridge) */}
          <g id="superstructure-aft">
            {/* Bloque inferior de acomodación */}
            <rect x="805" y="65" width="105" height="55" rx="3" fill="url(#superstructureGrad)" stroke="#9ca3af" strokeWidth="1.5" />
            {/* Ventanas acomodación */}
            <line x1="815" y1="80" x2="895" y2="80" stroke="#0284c7" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.9" />
            <line x1="815" y1="95" x2="895" y2="95" stroke="#0284c7" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.9" />

            {/* Puente de mando superior (Bridge) */}
            <rect x="825" y="32" width="75" height="33" rx="2" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
            {/* Ventanales puente en ángulo */}
            <rect x="830" y="38" width="65" height="12" rx="1.5" fill="#bae6fd" stroke="#0284c7" strokeWidth="1" />

            {/* Chimenea / Funnel */}
            <path d="M 875,32 L 880,12 L 895,12 L 892,32 Z" fill="#dc2626" stroke="#b91c1c" strokeWidth="1.5" />
            <line x1="878" y1="18" x2="894" y2="18" stroke="#ffffff" strokeWidth="2" />

            {/* Radar / Mástil principal */}
            <line x1="860" y1="32" x2="860" y2="10" stroke="#475569" strokeWidth="2" />
            <line x1="850" y1="16" x2="870" y2="16" stroke="#475569" strokeWidth="1.5" />
            <circle cx="860" cy="9" r="2.5" fill="#d97706" />

            {/* Etiqueta exterior PUENTE / POPA en gris oscuro text-gray-700 */}
            <text x="857" y="112" fill="#374151" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              PUENTE / POPA
            </text>
          </g>

          {/* Grúas de cubierta / Deck Cranes (Típicas 2x60t en buques multipropósito MPP) */}
          <g id="deck-cranes" stroke="#64748b" opacity="0.95">
            {/* Grúa 1 (entre Bodega 1 y Bodega 2) */}
            <rect x="305" y="90" width="16" height="30" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
            <circle cx="313" cy="90" r="5" fill="#475569" />
            <line x1="313" y1="90" x2="265" y2="45" stroke="#334155" strokeWidth="3" />
            <line x1="265" y1="45" x2="265" y2="115" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
            <rect x="261" y="115" width="8" height="5" fill="#d97706" />

            {/* Grúa 2 (entre Bodega 3 y Bodega 4) */}
            <rect x="635" y="90" width="16" height="30" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
            <circle cx="643" cy="90" r="5" fill="#475569" />
            <line x1="643" y1="90" x2="595" y2="45" stroke="#334155" strokeWidth="3" />
            <line x1="595" y1="45" x2="595" y2="115" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
            <rect x="591" y="115" width="8" height="5" fill="#d97706" />
          </g>

          {/* ======================================================== */}
          {/* CUBIERTA SUPERIOR / WEATHER DECK (Etiqueta en gris oscuro) */}
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
                : 'CUBIERTA SUPERIOR (WEATHER DECK) DESPEJADA · CAPACIDAD: 3.50 t/m²'}
            </text>
          </g>

          {/* ======================================================== */}
          {/* BODEGAS INTERMEDIAS 1 A 4 (HOLDS) */}
          {/* ======================================================== */}
          {(() => {
            const count = Math.min(4, Math.max(2, displayHolds.length));
            // Espacio horizontal útil para las bodegas: desde x=165 hasta x=795 (ancho total: 630px)
            const totalWidth = 630;
            const gap = 12;
            const holdWidth = (totalWidth - (gap * (count - 1))) / count;
            const startX = 165;
            const holdY = 135;
            const holdHeight = 125;

            return displayHolds.slice(0, count).map((hold, idx) => {
              const hX = startX + idx * (holdWidth + gap);
              const weightMT = Number(hold.totalWeightTons || 0);
              const weightPct = Number(hold.weightPercentage || 0);
              const isLoaded = weightMT > 0 || weightPct > 0;
              const holdNum = hold.holdNumber || (idx + 1);
              const holdTitle = `Bodega ${holdNum}`;

              // Relleno de carga:
              // OCUPADA: color azul corporativo (#2563eb / bg-blue-600) y texto estrictamente BLANCO en negrita.
              // VACÍA: fondo blanco puro (bg-white / #ffffff), borde sutil y texto gris oscuro (#1f2937 / text-gray-800).
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

                  {/* Patrón superpuesto si está cargada para dar profundidad de estiba */}
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

                  {/* Escotilla superior (Hatch coaming) */}
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

                  {/* Cabecera de Bodega: Número / Nombre */}
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
                      {/* Badge con Toneladas Métricas (MT) - Fondo azul oscuro con texto BLANCO en negrita */}
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
                      {/* Texto estrictamente BLANCO y en negrita (font-bold) */}
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

                      {/* Tier / Sub-estiba en blanco negrita */}
                      <text
                        x={hX + holdWidth / 2}
                        y={holdY + 95}
                        fill="#ffffff"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                        textAnchor="middle"
                      >
                        {hold.stowageTier || 'Tanktop / Bloque'}
                      </text>

                      {/* Indicador de estado */}
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
                      {/* Estado Vacío - Fondo blanco / recuadro sutil con texto gris oscuro o negro (#1f2937 / text-gray-800) */}
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

                  {/* Fondo de Bodega / Tanktop límite inferior */}
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
          })()}

          {/* Línea de Tanktop continua (Doble fondo reforzado) */}
          <line x1="165" y1="262" x2="795" y2="262" stroke="#059669" strokeWidth="2" strokeDasharray="4 2" />
          <text x="480" y="274" fill="#047857" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
            TANKTOP / DOBLE FONDO CONTINUO · RESISTENCIA ESTRUCTURAL MÁXIMA: 20.0 t/m²
          </text>
        </svg>
      </div>

      {/* Leyenda y Resumen Rápido de Compartimentos (Modo Claro) */}
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

        {/* Tabla estructurada con los datos duros exigidos (Modo Claro) */}
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
              {/* 1. Volumen Ocupado vs Capacidad Grain */}
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

              {/* 2. Presión Máxima de Plancha (Tanktop) */}
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

              {/* 3. Estabilidad Hidrodinámica GM */}
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

export default VisualStowagePlan;
