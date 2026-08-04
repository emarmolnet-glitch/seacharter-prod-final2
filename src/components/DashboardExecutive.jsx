import React, { useState } from 'react';
import StatementOfFactsEditor from './StatementOfFactsEditor.jsx';

const phaseLabels = {
  APPROACHING_POL: 'Aproximación a puerto de carga',
  AT_POL: 'En puerto de carga',
  LOADING: 'En carga',
  IN_TRANSIT: 'En tránsito',
  AT_POD: 'En puerto de descarga',
  DISCHARGING: 'En descarga',
  COMPLETED: 'Completado'
};

function LoadingLine({ className = '' }) {
  return <span className={`block animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value, locale = 'en-US', options = {}) {
  return finiteNumber(value).toLocaleString(locale, options);
}

function displayText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatAlertDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function DashboardLoading() {
  return (
    <div className="min-h-full w-full space-y-6 bg-[#0B3040] p-6 text-slate-100" aria-busy="true" aria-label="Cargando Dashboard Ejecutivo">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <LoadingLine className="h-3 w-48" />
        <LoadingLine className="mt-3 h-8 w-80 max-w-full" />
        <LoadingLine className="mt-3 h-4 w-[34rem] max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <LoadingLine className="h-3 w-28" />
            <LoadingLine className="mt-3 h-6 w-40" />
            <LoadingLine className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <LoadingLine className="h-5 w-64 max-w-full" />
        <LoadingLine className="mt-4 h-20 w-full" />
      </div>
    </div>
  );
}

export default function DashboardExecutive({ contractData }) {
  const voyageData = contractData?.voyage || null;
  const isLoading = Boolean(contractData?.isLoading);
  const loadError = contractData?.loadError || '';
  const [sofEvents, setSofEvents] = useState([]);
  const systemAlerts = Array.isArray(voyageData?.alerts) ? voyageData.alerts : [];

  if (isLoading) return <DashboardLoading />;

  if (!voyageData) {
    return (
      <div className="flex min-h-full w-full items-center justify-center bg-[#0B3040] p-6 text-slate-100">
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-900 shadow-lg">
          <h1 className="text-base font-bold">Sin viaje activo</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">El Dashboard Ejecutivo permanece vacío hasta que Neon devuelva un viaje válido.</p>
          {loadError && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{loadError}</p>}
        </div>
      </div>
    );
  }

  const laytime = contractData?.laytime || {};
  const allowedHours = finiteNumber(laytime?.allowedHours);
  const grossUsedHours = finiteNumber(laytime?.usedHours);
  const demurrageRateUSD = finiteNumber(laytime?.demurrageRateUSD);
  const rawTerms = String(laytime.laytimeRule || laytime.terms || contractData?.laytimeRule || 'SHINC').toUpperCase();
  const terms = ['SHINC', 'SHEX', 'FHEX'].includes(rawTerms) ? rawTerms : 'SHINC';
  const deductedHours = sofEvents.reduce(
    (sum, event) => event?.status === 'DRAFT' ? sum : sum + finiteNumber(event?.durationHours),
    0
  );
  const netUsedHours = Math.max(0, grossUsedHours - deductedHours);
  const balanceHours = allowedHours - netUsedHours;
  const demurrageHours = Math.max(0, -balanceHours);
  const estimatedDemurrageUSD = (demurrageHours / 24) * demurrageRateUSD;
  const isDelayed = demurrageHours > 0;
  const vesselName = displayText(voyageData?.vesselName);
  const vesselImo = displayText(voyageData?.imo);
  const loadPort = displayText(voyageData?.loadPort);
  const dischargePort = displayText(voyageData?.dischargePort);
  const cargoType = displayText(voyageData?.cargoType);
  const cargoUnit = displayText(voyageData?.cargoUnit);
  const hasVesselData = Boolean(vesselName || vesselImo);
  const hasRouteData = Boolean(loadPort && dischargePort);
  const hasCargoData = Boolean(cargoType || Number.isFinite(Number(voyageData?.cargoQty)));
  const cargoQuantity = Number(voyageData?.cargoQty);
  const cargoQuantityLabel = Number.isFinite(cargoQuantity)
    ? `${formatNumber(cargoQuantity, 'es-ES', { maximumFractionDigits: 2 })}${cargoUnit ? ` ${cargoUnit}` : ''}`
    : '—';
  const operationalPhase = voyageData?.operationalPhaseLabel || phaseLabels[voyageData?.operationalPhase] || voyageData?.operationalPhase || '—';
  const routeProgress = hasRouteData ? Math.min(100, Math.max(0, finiteNumber(voyageData?.routeProgressPct))) : 0;

  const handleInjectAlert = (alert) => {
    if (!alert?.draftEvent) return;
    const startTime = new Date(alert.draftEvent.startTime || '');
    const endTime = new Date(alert.draftEvent.endTime || '');
    const durationHours = Number.isFinite(startTime.getTime()) && Number.isFinite(endTime.getTime())
      ? Math.max(0, (endTime - startTime) / (1000 * 60 * 60))
      : 0;

    setSofEvents((currentEvents) => {
      const alreadyInjected = currentEvents.some((event) => event.sourceAlertId === alert.id);
      if (alreadyInjected) return currentEvents;

      return [
        ...currentEvents,
        {
          id: `auto-${alert.id}-${Date.now()}`,
          ...alert.draftEvent,
          detectedAt: alert.detectedAt,
          durationHours,
          status: 'DRAFT',
          isAutoGenerated: true,
          sourceAlertId: alert.id
        }
      ];
    });
  };

  return (
    <div className="min-h-full bg-[#0B3040] text-slate-100 p-6 space-y-6 w-full pb-16 print:h-auto print:min-h-full print:overflow-visible print:block print:bg-white print:p-0 print:pb-0 print:text-black print:[&_button]:hidden">

      {/* Cabecera Principal */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-slate-900 break-inside-avoid print:rounded-none print:border-slate-300 print:shadow-none print:text-black">
        <div>
          <span className="text-xs font-semibold tracking-wider text-cyan-600 uppercase">Contrato Marítimo · Control Ejecutivo</span>
          <h1 className="text-lg font-bold text-slate-900 mt-1">Dashboard Ejecutivo & Laytime</h1>
          <p className="text-sm text-slate-600 mt-0.5">Visión consolidada del viaje, la exposición contractual y los hitos de plancha.</p>
        </div>
        <div className="flex items-stretch gap-2 print:block">
          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 active:translate-y-px"
          >
            <span aria-hidden="true">📄</span>
            Exportar PDF
          </button>
          <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-right print:border-slate-300 print:bg-white">
            <span className="block text-[10px] uppercase tracking-wider text-slate-500 print:text-slate-700">Referencia</span>
            {isLoading ? (
              <LoadingLine className="ml-auto mt-1 h-4 w-28" />
            ) : (
              <span className="text-sm font-mono font-bold text-cyan-600 print:text-black">{voyageData?.reference || contractData?.reference || '—'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Alertas del Sistema: Telemetría y Automatización */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm break-inside-avoid print:break-inside-avoid print:border-slate-300 print:shadow-none print:text-black">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 print:text-black">Alertas del Sistema (Telemetría)</h2>
            <p className="mt-1 text-xs text-slate-500 print:text-slate-600">OpenShips, geofencing y señales IoT operativas</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
            {systemAlerts.length} activas
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {systemAlerts.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Sin alertas activas para este viaje.
            </div>
          )}
          {systemAlerts.map((alert, index) => {
            const isWarning = ['warning', 'warn', 'medium'].includes(String(alert?.tone || alert?.level || alert?.severity || '').toLowerCase());
            const isInjected = sofEvents.some((event) => event.sourceAlertId === alert.id);
            const canInject = Boolean(alert?.draftEvent);

            return (
              <article
                key={alert?.id || `voyage-alert-${index}`}
                className={`rounded-lg border p-4 break-inside-avoid print:bg-white ${
                  isWarning
                    ? 'border-amber-100 bg-amber-50/50 print:border-slate-300'
                    : 'border-cyan-100 bg-cyan-50/50 print:border-slate-300'
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      isWarning
                        ? 'border-amber-200 bg-white text-amber-700 print:text-amber-700'
                        : 'border-cyan-200 bg-white text-cyan-700 print:text-cyan-700'
                    }`}>
                      {isWarning ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.7 2.8 17a2 2 0 0 0 1.74 3h14.92A2 2 0 0 0 21.2 17L13.7 3.7a2 2 0 0 0-3.4 0Z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" />
                          <circle cx="12" cy="10" r="2" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className={`text-sm font-bold ${isWarning ? 'text-amber-700' : 'text-cyan-700'}`}>
                          {alert?.title || alert?.type || 'Aviso operativo'}
                        </h3>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 print:text-slate-600">{alert?.source || 'Tracking'}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700 print:text-black">{alert?.message || alert?.detail || alert?.description || 'Sin detalle adicional.'}</p>
                      <span className="mt-2 block text-[10px] font-mono uppercase tracking-wider text-slate-500 print:text-slate-600">
                        Detectado: {formatAlertDate(alert?.detectedAt || alert?.createdAt || alert?.created_at)} LT
                      </span>
                    </div>
                  </div>
                  {canInject && (
                    <button
                      type="button"
                      onClick={() => handleInjectAlert(alert)}
                      disabled={isInjected}
                      className={`print:hidden inline-flex shrink-0 items-center justify-center rounded-lg border px-3.5 py-2 text-xs font-bold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                        isInjected
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {isInjected ? 'Borrador inyectado' : '+ Inyectar en SOF'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Grid de Estado del Buque y Ruta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Tarjeta Buque */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-slate-900 shadow-sm break-inside-avoid print:break-inside-avoid print:border-slate-300 print:shadow-none print:text-black">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Buque Nominado</span>
          {isLoading ? (
            <div className="mt-2 space-y-3">
              <LoadingLine className="h-6 w-48" />
              <LoadingLine className="h-6 w-56" />
            </div>
          ) : hasVesselData ? (
            <>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{vesselName || '—'}</h2>
              <span className="inline-block mt-2 px-2.5 py-1 bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs rounded font-mono">
                {vesselImo ? `IMO ${vesselImo}` : 'IMO pendiente'} · Seguimiento AIS activo
              </span>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Esperando datos del mapa</p>
          )}
        </div>

        {/* Tarjeta Ruta / Progreso */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 text-slate-900 shadow-sm flex flex-col justify-between break-inside-avoid print:border-slate-300 print:shadow-none print:text-black">
          {isLoading ? (
            <div className="mb-3 flex items-center justify-between gap-4">
              <LoadingLine className="h-4 w-24" />
              <LoadingLine className="h-4 w-32" />
              <LoadingLine className="h-4 w-24" />
            </div>
          ) : hasRouteData ? (
            <div className="flex justify-between items-center text-xs text-slate-600 mb-2">
              <span className="font-semibold text-slate-900">{loadPort}</span>
              <span className="text-cyan-600 font-mono font-semibold">{operationalPhase}</span>
              <span className="font-semibold text-slate-900">{dischargePort}</span>
            </div>
          ) : (
            <p className="mb-2 text-center text-sm text-slate-500">Esperando datos del mapa</p>
          )}
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
            <div className={`bg-cyan-500 h-full rounded-full ${isLoading ? 'w-2/5 animate-pulse' : ''}`} style={isLoading ? undefined : { width: hasRouteData ? `${routeProgress}%` : '0%' }}></div>
          </div>
        </div>

      </div>

      {/* Métricas Clave (KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm break-inside-avoid print:break-inside-avoid print:border-slate-300 print:shadow-none print:text-black">
          <span className="text-xs text-slate-500 uppercase font-semibold">Carga Contractual</span>
          {isLoading ? (
            <div className="mt-2 space-y-2">
              <LoadingLine className="h-5 w-32" />
              <LoadingLine className="h-3 w-20" />
            </div>
          ) : hasCargoData ? (
            <>
              <p className="text-lg font-bold text-slate-900 mt-1">{cargoType || '—'}</p>
              <span className="text-xs text-slate-500">{cargoQuantityLabel}</span>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Esperando datos del mapa</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm break-inside-avoid print:break-inside-avoid print:border-slate-300 print:shadow-none print:text-black">
          <span className="text-xs text-slate-500 uppercase font-semibold">Fase Operativa</span>
          {isLoading ? (
            <div className="mt-2 space-y-2">
              <LoadingLine className="h-5 w-28" />
              <LoadingLine className="h-3 w-20" />
            </div>
          ) : (
            <>
              <p className="text-lg font-bold text-cyan-600 mt-1">{operationalPhase}</p>
              <span className="text-xs text-slate-500">{hasRouteData ? `Progreso de ruta: ${formatNumber(routeProgress, 'es-ES', { maximumFractionDigits: 0 })}%` : 'Esperando datos del mapa'}</span>
            </>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm break-inside-avoid print:break-inside-avoid print:border-slate-300 print:shadow-none print:text-black">
          <span className="text-xs text-slate-500 uppercase font-semibold">Estado Laytime</span>
          <p className={`text-lg font-bold mt-1 ${isDelayed ? 'text-amber-600' : 'text-emerald-600'}`}>
            {isDelayed ? 'Riesgo Demora' : 'En Control'}
          </p>
          <span className="text-xs text-slate-500">{formatNumber(netUsedHours, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h netas de {formatNumber(allowedHours, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm break-inside-avoid print:break-inside-avoid print:border-slate-300 print:shadow-none print:text-black">
          <span className="text-xs text-slate-500 uppercase font-semibold">Exposición Demurrage</span>
          <p className={`text-lg font-bold mt-1 ${isDelayed ? 'text-rose-600' : 'text-slate-900'}`}>
            {isDelayed ? `$${formatNumber(estimatedDemurrageUSD, 'en-US', { maximumFractionDigits: 2 })}` : 'USD 0'}
          </p>
          <span className="text-xs text-slate-500">Tarifa: ${formatNumber(demurrageRateUSD)}/día</span>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 print:hidden" role="status">
          {loadError}
        </div>
      )}

      {/* Bloque Detallado: Auditoría de Plancha & Demoras (Statement of Facts) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-slate-900 shadow-sm space-y-4 break-inside-avoid print:mt-4 print:break-before-auto print:border-slate-300 print:shadow-none print:text-black">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Auditoría de Plancha & Tiempos de Puerto</h2>
            <p className="text-xs text-slate-500">Control estricto de plancha SHINC/SHEX y cálculo de sobreestadías</p>
          </div>
          <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded-lg font-mono font-semibold">
            Regla: {terms}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
            <span className="text-xs text-slate-500 font-medium uppercase">Tiempo Permitido (Allowed)</span>
            <p className="text-lg font-bold text-slate-900 mt-1">{formatNumber(allowedHours, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Horas</p>
            <span className="text-xs text-slate-600">Basado en volumen contractual</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
            <span className="text-xs text-slate-500 font-medium uppercase">Tiempo Consumido (Used)</span>
            <p className="text-lg font-bold text-cyan-600 mt-1">{formatNumber(netUsedHours, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Horas</p>
            <span className="text-xs text-slate-600">{formatNumber(grossUsedHours, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h brutas − {formatNumber(deductedHours, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h deducidas</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
            <span className="text-xs text-slate-500 font-medium uppercase">Balance de Plancha</span>
            <p className={`text-lg font-bold mt-1 ${balanceHours >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatNumber(balanceHours, 'es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Horas
            </p>
            <span className="text-xs text-slate-600">
              {balanceHours >= 0 ? 'Margen disponible' : 'Exceso de plancha'}
            </span>
          </div>
        </div>
      </div>

      <div className="print:[&>*]:border-slate-300 print:[&>*]:shadow-none print:[&>*]:text-black">
        <StatementOfFactsEditor events={sofEvents} onEventsChange={setSofEvents} terms={terms} />
      </div>

    </div>
  );
}
