import React, { useState, useMemo, useEffect, useRef } from 'react';
import VisualStowagePlan, { resolveVesselProfile, MemoizedVisualStowagePlan } from './VisualStowagePlan.jsx';
import { buildVoyageStowagePlan } from '../voyage-stowage-builder.mjs';

export { buildVoyageStowagePlan };

/**
 * VoyageExecutiveReportModal
 * Modal del Reporte Ejecutivo del Viaje con Croquis Naval y Modo Cliente (Censura Financiera)
 * Versión Corporativa en Tema Claro (Light Theme) con Flujo Seguro de Impresión Asíncrona
 */
export default function VoyageExecutiveReportModal({
  isOpen = true,
  onClose = () => {},
  voyageData = null,
  initialClientMode = false,
}) {
  const [isClientMode, setIsClientMode] = useState(initialClientMode);
  const [printPending, setPrintPending] = useState(false);
  const isPrintingRef = useRef(false);

  // Extraer estado del viaje desde props o desde window.State
  const winState = typeof window !== 'undefined' ? window.State || {} : {};
  const data = voyageData || winState || {};

  const vesselName = data.vessel || data.vesselName || 'TBN (To Be Named)';
  const vesselClass = data.class || data.shipClass || data.vesselClass || 'Handysize';
  const shipProfile = data.shipProfile || data.ship_profile || data.designCategory || data.categoriaDiseno || '';
  const dwt = Number(data.dwt || data.vesselDwt || 32000);
  const cargoTons = Number(data.cargo || data.cargoQty || 25000);
  const cargoType = data.cargoType || 'Granel Sólido (Dry Bulk)';
  const pol = data.pol || 'Puerto de Carga (POL)';
  const pod = data.pod || 'Puerto de Descarga (POD)';
  const ballastPort = data.ballastPort || data.portBallast || 'N/A (Carga Directa)';
  const totalDays = Number(data.totalDays || 0);
  const distTotal = Number(data.distTotal || (Number(data.distBallast || 0) + Number(data.distLaden || 0)) || 0);
  const cpStandard = data.charterPartyStandard || (cargoType.includes('Líquido') ? 'ASBATANKVOY' : 'GENCON');
  const estId = data.activeReference ? `EST-${data.activeReference}` : 'RDM-EST-001';

  // Métricas financieras
  const freightSell = Number(data.freightSell || 0);
  const freightBuy = Number(data.freightRate || 0);
  const breakEven = Number(data.breakEven || 0);
  const netCharterer = Number(data.netProfitCharterer || 0);
  const netOwner = Number(data.netProfitOwner || 0);
  const tce = Number(data.tceOwner || data.tceDaily || 0);

  // Costes operativos
  const costBunkers = Number(data.costBunkers || 0);
  const costOpex = Number(data.costOpex || 0);
  const costPda = Number(data.costPda || 0);
  const costEts = Number(data.etsCost || 0);
  const costTotal = Number(data.costTotal || (costBunkers + costOpex + costPda + costEts));

  const totalSaleAmount = freightSell * cargoTons;

  // Resolver vesselType exacto (ej. Coaster, Minibulker, Handysize, Ro-Ro, Ro-Lo)
  const resolvedVesselType = data.vesselType || shipProfile || (data.vessel ? `${data.vessel} (${vesselClass})` : `${vesselClass} ${dwt > 0 ? `${dwt.toLocaleString('en-US')} DWT` : ''}`.trim());
  const vesselDescription = resolvedVesselType;

  // Memoizar el plan de estiba para evitar re-cálculos o desmontajes innecesarios al alternar isClientMode
  const stowagePlan = useMemo(() => {
    return data.stowagePlan || buildVoyageStowagePlan({
      ...data,
      vesselType: resolvedVesselType,
      shipProfile,
      class: vesselClass,
      dwt,
      cargo: cargoTons,
    });
  }, [data, resolvedVesselType, shipProfile, vesselClass, dwt, cargoTons]);

  // Manejo de impresión reactivo sin setTimeout mágicos
  const handlePrint = (clientMode) => {
    if (typeof window !== 'undefined') {
      window.isExecutiveClientMode = clientMode;
    }
    setIsClientMode(clientMode);
    setPrintPending(true);
  };

  useEffect(() => {
    if (!printPending || isPrintingRef.current) return;
    isPrintingRef.current = true;

    // Disparar la impresión solo cuando el DOM ya haya renderizado con el nuevo estado
    document.body.classList.add('is-printing-modal');
    if (isClientMode) {
      document.body.classList.add('print-client-mode');
    } else {
      document.body.classList.remove('print-client-mode');
    }

    const cleanup = () => {
      document.body.classList.remove('is-printing-modal');
      document.body.classList.remove('print-client-mode');
      isPrintingRef.current = false;
      setPrintPending(false);
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    // Microtask/frame para permitir que el paint del navegador procese las clases CSS
    const animId = requestAnimationFrame(() => {
      window.print();
      // Fallback de cleanup si el navegador no emite afterprint inmediatamente
      setTimeout(cleanup, 1000);
    });

    return () => {
      cancelAnimationFrame(animId);
      cleanup();
    };
  }, [printPending, isClientMode]);

  if (!isOpen) return null;

  return (
    <div
      id="voyage-executive-report-modal"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 pt-10 sm:p-6 sm:pt-14 backdrop-blur-sm print:p-0 print:bg-white print:static print:inset-auto print:overflow-visible"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl print:border-none print:shadow-none print:bg-white print:max-w-none print:rounded-none">
        
        {/* Cabecera del Reporte (Tema Claro Corporativo) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 p-5 sm:p-6 bg-slate-50 print:bg-white print:border-b-2 print:border-slate-300">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 print:hidden" />
              <h2
                id="report-modal-title"
                className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-2"
              >
                <i className="fa-solid fa-file-invoice-dollar text-blue-600 print:hidden"></i>
                RESUMEN OPERATIVO Y FINANCIERO
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              ID Estimación: <span className="font-mono font-bold text-slate-800">{estId}</span> · Póliza: <span className="font-bold text-blue-800">{cpStandard}</span>
              {isClientMode && (
                <span className="ml-2 inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
                  MODO CLIENTE ACTIVO (Censura Financiera)
                </span>
              )}
            </p>
          </div>

          {/* Toggle de Modo Cliente en cabecera */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            <div
              id="report-mode-toggle-group"
              role="radiogroup"
              aria-label="Selector de Modo de Reporte"
              className="inline-flex rounded-lg p-1 bg-slate-100 border border-slate-200 gap-1"
            >
              <button
                type="button"
                id="btn-toggle-internal-mode"
                aria-pressed={!isClientMode}
                onClick={() => setIsClientMode(false)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  !isClientMode
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
                title="Muestra la estructura completa de costes, márgenes y TCE"
              >
                <span>🏢 Reporte Interno</span>
              </button>
              <button
                type="button"
                id="btn-toggle-client-mode"
                aria-pressed={isClientMode}
                onClick={() => setIsClientMode(true)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  isClientMode
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
                title="Oculta costes internos y márgenes confidenciales (Client-Facing)"
              >
                <span>👤 Reporte Cliente</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 border border-slate-200 transition"
              aria-label="Cerrar modal"
            >
              <i className="fa-solid fa-xmark text-base"></i>
            </button>
          </div>
        </div>

        {/* Cuerpo del Reporte (Light Theme) */}
        <div className="p-5 sm:p-6 space-y-6 text-slate-800 text-xs print:p-4">

          {/* Fila 1: Resumen Operativo y Ruta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Especificaciones Buque & Carga */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h5 className="font-bold text-blue-900 uppercase mb-2 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                <i className="fa-solid fa-ship text-blue-600 print:hidden"></i> ESPECIFICACIONES BUQUE &amp; CARGA
              </h5>
              <ul className="space-y-1.5">
                <li className="flex justify-between"><span className="text-slate-600">Buque:</span> <span className="font-bold text-slate-900">{vesselName}</span></li>
                <li className="flex justify-between"><span className="text-slate-600">Capacidad / Clase:</span> <span className="font-bold text-slate-900">{vesselDescription}</span></li>
                <li className="flex justify-between"><span className="text-slate-600">Carga a Transportar:</span> <span className="font-bold text-slate-900">{cargoTons.toLocaleString('en-US')} MT</span></li>
                <li className="flex justify-between"><span className="text-slate-600">Tipo Carga:</span> <span className="font-bold text-slate-900">{cargoType}</span></li>
                <li className="flex justify-between"><span className="text-slate-600">Póliza Estándar:</span> <span className="font-bold text-blue-800">{cpStandard}</span></li>
              </ul>
            </div>

            {/* Ruta e Itinerario */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h5 className="font-bold text-blue-900 uppercase mb-2 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                <i className="fa-solid fa-route text-blue-600 print:hidden"></i> RUTA E ITINERARIO
              </h5>
              <ul className="space-y-1.5">
                <li className="flex justify-between"><span className="text-slate-600">Puerto Lastre:</span> <span className="font-bold text-slate-900">{ballastPort}</span></li>
                <li className="flex justify-between"><span className="text-slate-600">Carga / Descarga:</span> <span className="font-bold text-slate-900">{pol} ➔ {pod}</span></li>
                <li className="flex justify-between"><span className="text-slate-600">Distancia Total:</span> <span className="font-bold text-slate-900">{distTotal.toLocaleString('en-US')} NM</span></li>
                <li className="flex justify-between"><span className="text-slate-600">Duración Estimada:</span> <span className="font-bold text-slate-900">{totalDays.toFixed(2)} Días</span></li>
              </ul>
            </div>
          </div>

          {/* Fila 2: Análisis Financiero (Condicional en Modo Cliente) */}
          <div
            id="executive-financial-row"
            className={`grid grid-cols-1 ${!isClientMode ? 'md:grid-cols-2' : ''} gap-4 transition-all duration-300`}
          >
            {/* ESTRUCTURA DE COSTES (Oculta al 100% en Modo Cliente) */}
            {!isClientMode && (
              <div
                id="executive-cost-structure-column"
                className="bg-slate-50 p-4 rounded-xl border border-slate-200"
              >
                <h5 className="font-bold text-amber-900 uppercase mb-2 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <i className="fa-solid fa-coins text-amber-600 print:hidden"></i> ESTRUCTURA DE COSTES
                </h5>
                <ul className="space-y-2">
                  <li className="flex justify-between"><span className="text-slate-600">Combustible (Bunkers):</span> <span className="font-bold text-slate-900">${costBunkers.toLocaleString('en-US')}</span></li>
                  <li className="flex justify-between"><span className="text-slate-600">Costo Operativo (OPEX):</span> <span className="font-bold text-slate-900">${costOpex.toLocaleString('en-US')}</span></li>
                  <li className="flex justify-between"><span className="text-slate-600">Tasas / Gastos (PDAs):</span> <span className="font-bold text-slate-900">${costPda.toLocaleString('en-US')}</span></li>
                  <li className="flex justify-between"><span className="text-slate-600">Costo ETS Estimado:</span> <span className="font-bold text-slate-900">${costEts.toLocaleString('en-US')}</span></li>
                  <li className="pt-2 mt-2 border-t border-slate-300 flex justify-between font-bold text-amber-900 text-sm">
                    <span>Total Gastos Estimados:</span>
                    <span>${costTotal.toLocaleString('en-US')}</span>
                  </li>
                </ul>
              </div>
            )}

            {/* VÁLVULAS Y RESULTADOS NETOS / VIABILIDAD COMERCIAL */}
            <div
              id="executive-net-results-column"
              className={`bg-slate-50 p-4 rounded-xl border border-slate-200 ${
                isClientMode ? 'w-full shadow-sm border-emerald-300 bg-emerald-50/30' : ''
              }`}
            >
              <h5 className="font-bold text-emerald-900 uppercase mb-2 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                <i className="fa-solid fa-briefcase text-emerald-600 print:hidden"></i> {isClientMode ? 'OFERTA Y FLETE DE VENTA' : 'VIABILIDAD & RESULTADOS NETOS'}
              </h5>

              <ul className="space-y-2">
                {/* En Modo Cliente: SOLO visible la cifra final de venta */}
                <li className="flex justify-between items-center text-emerald-950 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                  <span className="font-bold text-sm">Flete Sugerido (Tarifa de Venta):</span>
                  <span className="font-mono text-base font-black text-emerald-700">
                    ${freightSell.toFixed(2)} / TM
                  </span>
                </li>

                {cargoTons > 0 && (
                  <li className="flex justify-between items-center text-slate-900 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <span className="font-bold">Precio Total de Venta:</span>
                    <span className="font-mono text-base font-black text-blue-900">
                      ${totalSaleAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </li>
                )}

                {/* En Modo Interno (!isClientMode): Desglose confidencial de compra, break-even, beneficios y TCE */}
                {!isClientMode && (
                  <>
                    <li className="flex justify-between text-indigo-900">
                      <span className="text-slate-600">Compra Armador:</span>
                      <span className="font-bold">${freightBuy.toFixed(2)} / TM</span>
                    </li>
                    <li className="flex justify-between text-slate-600">
                      <span>Punto de Equilibrio (Break-Even):</span>
                      <span className="font-mono font-bold text-slate-900 break-even-result">${breakEven.toFixed(2)} / TM</span>
                    </li>
                    <li className="pt-2 mt-2 border-t border-slate-300 flex justify-between font-bold text-emerald-800 text-sm net-profit-charterer">
                      <span>Beneficio Neto Fletador:</span>
                      <span>${netCharterer.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    </li>
                    <li className="flex justify-between font-bold text-indigo-900 text-sm net-profit-owner">
                      <span>Beneficio Neto Armador:</span>
                      <span>${netOwner.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    </li>
                    {tce > 0 && (
                      <li className="flex justify-between font-bold text-blue-900 text-sm">
                        <span>TCE Estimado Armador:</span>
                        <span>${tce.toLocaleString('en-US', { maximumFractionDigits: 0 })} / Día</span>
                      </li>
                    )}
                  </>
                )}
              </ul>
            </div>
          </div>

          {/* CROQUIS DEL BUQUE (VisualStowagePlan)
              Renderizado entre el Resumen Operativo/Financiero y los Acordeones de Datos */}
          <section
            id="executive-visual-stowage-section"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm break-inside-avoid"
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 text-sm">📐</span>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  CROQUIS NAVAL Y PLANO DE ESTIBA MATRICIAL
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-600">
                {vesselDescription}
              </span>
            </div>

            <VisualStowagePlan
              stowagePlan={stowagePlan}
              vesselType={resolvedVesselType}
              projectRef={estId}
            />
          </section>

          {/* ACORDEONES DE DATOS Y DESGLOSE INTERNO */}
          <section id="executive-data-accordions" className="space-y-3">
            {/* 1. Desglose Break-Even (OCULTO EN MODO CLIENTE) */}
            {!isClientMode && (
              <details className="bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer group hover:bg-slate-100 transition">
                <summary className="font-bold text-slate-800 select-none flex justify-between items-center text-xs uppercase tracking-wider">
                  <span><i className="fa-solid fa-calculator text-indigo-600 mr-1.5 print:hidden"></i> FÓRMULAS Y DESGLOSE DE CÁLCULO BREAK-EVEN</span>
                  <i className="fa-solid fa-chevron-down text-slate-500 group-open:rotate-180 transition-transform print:hidden"></i>
                </summary>
                <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <p><strong>Fórmula:</strong> Coste Total Operativo / Toneladas Métricas de Carga</p>
                  <p><strong>Cálculo:</strong> ${costTotal.toLocaleString('en-US')} / {cargoTons.toLocaleString('en-US')} MT = <strong className="text-slate-900">${breakEven.toFixed(2)} / TM</strong></p>
                </div>
              </details>
            )}

            {/* 2. Costes de Combustible (OCULTO EN MODO CLIENTE) */}
            {!isClientMode && (
              <details className="bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer group hover:bg-slate-100 transition">
                <summary className="font-bold text-slate-800 select-none flex justify-between items-center text-xs uppercase tracking-wider">
                  <span><i className="fa-solid fa-gas-pump text-amber-600 mr-1.5 print:hidden"></i> COSTOS DE COMBUSTIBLE</span>
                  <i className="fa-solid fa-chevron-down text-slate-500 group-open:rotate-180 transition-transform print:hidden"></i>
                </summary>
                <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <p><strong>Gasto de Combustible en Mar y Puerto:</strong> ${costBunkers.toLocaleString('en-US')}</p>
                </div>
              </details>
            )}

            {/* 3. Cálculos OPEX y Buque (OCULTO EN MODO CLIENTE) */}
            {!isClientMode && (
              <details className="bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer group hover:bg-slate-100 transition">
                <summary className="font-bold text-slate-800 select-none flex justify-between items-center text-xs uppercase tracking-wider">
                  <span><i className="fa-solid fa-anchor text-orange-600 mr-1.5 print:hidden"></i> CÁLCULOS OPEX Y CARACTERÍSTICAS BUQUE</span>
                  <i className="fa-solid fa-chevron-down text-slate-500 group-open:rotate-180 transition-transform print:hidden"></i>
                </summary>
                <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <p><strong>Costo Operativo Diario (OPEX):</strong> ${costOpex.toLocaleString('en-US')}</p>
                  <p><strong>DWT:</strong> {dwt.toLocaleString('en-US')} · <strong>Clase:</strong> {vesselClass}</p>
                </div>
              </details>
            )}

            {/* 4. Restricciones Portuarias y Calado (SIEMPRE VISIBLE para verificación técnica) */}
            <details className="bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer group hover:bg-slate-100 transition" open>
              <summary className="font-bold text-slate-800 select-none flex justify-between items-center text-xs uppercase tracking-wider">
                <span><i className="fa-solid fa-circle-exclamation text-emerald-600 mr-1.5 print:hidden"></i> RESTRICCIONES PORTUARIAS Y CONDICIONES OPERATIVAS</span>
                <i className="fa-solid fa-chevron-down text-slate-500 group-open:rotate-180 transition-transform print:hidden"></i>
              </summary>
              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
                <p><strong>Puerto de Carga (POL):</strong> {pol} · Calado y eslora validados conforme a carta náutica.</p>
                <p><strong>Puerto de Descarga (POD):</strong> {pod} · Infraestructura de grúas y calado operativo verificado.</p>
              </div>
            </details>
          </section>

        </div>

        {/* Pie del modal: Controles de Acción (Reemplazo del botón único por dos botones vinculados a isClientMode) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 sm:p-5 bg-slate-50">
          <button
            id="btn-close-executive-report"
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white hover:bg-slate-100 border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 transition"
          >
            Cerrar
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-print-internal-report"
              type="button"
              onClick={() => handlePrint(false)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                !isClientMode
                  ? 'bg-blue-600 hover:bg-blue-500 text-white ring-2 ring-blue-400'
                  : 'bg-white hover:bg-slate-100 border border-slate-300 text-slate-700'
              }`}
              title="Genera e imprime el reporte interno completo con costes y desglose de break-even"
            >
              <i className="fa-solid fa-print"></i>
              <span>🏢 Imprimir Reporte Interno</span>
            </button>

            <button
              id="btn-print-client-report"
              type="button"
              onClick={() => handlePrint(true)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                isClientMode
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-400'
                  : 'bg-white hover:bg-slate-100 border border-slate-300 text-slate-700'
              }`}
              title="Genera e imprime el reporte cliente censurando costes internos y márgenes"
            >
              <i className="fa-solid fa-print"></i>
              <span>👤 Imprimir Reporte Cliente</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
