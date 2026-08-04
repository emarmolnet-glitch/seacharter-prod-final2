import React from 'react';

export default function DashboardExecutive({ contractData }) {
  const laytime = contractData?.laytime || {
    allowedHours: 72,
    usedHours: 64.5,
    status: 'En Control',
    demurrageRateUSD: 8500,
    estimatedDemurrageUSD: 0
  };

  const isDelayed = laytime.status === 'En Demora' || laytime.usedHours > laytime.allowedHours;

  return (
    <div className="min-h-full bg-[#0B3040] text-slate-100 p-6 space-y-6 w-full pb-16">

      {/* Cabecera Principal */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-slate-900">
        <div>
          <span className="text-xs font-semibold tracking-wider text-cyan-600 uppercase">Contrato Marítimo · Control Ejecutivo</span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Dashboard Ejecutivo & Laytime</h1>
          <p className="text-sm text-slate-600 mt-0.5">Visión consolidada del viaje, la exposición contractual y los hitos de plancha.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-right">
          <span className="block text-[10px] uppercase tracking-wider text-slate-500">Referencia</span>
          <span className="text-sm font-mono font-bold text-cyan-600">{contractData?.reference || 'RDM/2026-0604'}</span>
        </div>
      </div>

      {/* Grid de Estado del Buque y Ruta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Tarjeta Buque */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-slate-900 shadow-sm">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Buque Nominado</span>
          <h2 className="text-lg font-bold text-slate-900 mt-1">{contractData?.live?.vesselName || 'NERMIN KARABEKIR'}</h2>
          <span className="inline-block mt-2 px-2.5 py-1 bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs rounded font-mono">
            IMO 9591820 · Seguimiento AIS Activo
          </span>
        </div>

        {/* Tarjeta Ruta / Progreso */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 text-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs text-slate-600 mb-2">
            <span className="font-semibold text-slate-900">{contractData?.route?.pol?.name || 'BEJAIA (DZ)'}</span>
            <span className="text-cyan-600 font-mono font-semibold">Tránsito Comercial</span>
            <span className="font-semibold text-slate-900">{contractData?.route?.pod?.name || 'AVEIRO (PT)'}</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
            <div className="bg-cyan-500 h-full w-3/5 rounded-full"></div>
          </div>
        </div>

      </div>

      {/* Métricas Clave (KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-semibold">Carga Contractual</span>
          <p className="text-lg font-bold text-slate-900 mt-1">Cement / Clinker</p>
          <span className="text-xs text-slate-500">10.000 MT</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-semibold">Fase Operativa</span>
          <p className="text-lg font-bold text-cyan-600 mt-1">En Tránsito</p>
          <span className="text-xs text-slate-500">ETA calculada</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-semibold">Estado Laytime</span>
          <p className={`text-lg font-bold mt-1 ${isDelayed ? 'text-amber-600' : 'text-emerald-600'}`}>
            {isDelayed ? 'Riesgo Demora' : 'En Control'}
          </p>
          <span className="text-xs text-slate-500">{laytime.usedHours}h consumidas de {laytime.allowedHours}h</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-semibold">Exposición Demurrage</span>
          <p className={`text-lg font-bold mt-1 ${isDelayed ? 'text-rose-600' : 'text-slate-900'}`}>
            {isDelayed ? `$${laytime.estimatedDemurrageUSD.toLocaleString()}` : 'USD 0'}
          </p>
          <span className="text-xs text-slate-500">Tarifa: ${laytime.demurrageRateUSD}/día</span>
        </div>
      </div>

      {/* Bloque Detallado: Auditoría de Plancha & Demoras (Statement of Facts) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-slate-900 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Auditoría de Plancha & Tiempos de Puerto</h2>
            <p className="text-xs text-slate-500">Control estricto de plancha SHINC/SHEX y cálculo de sobreestadías</p>
          </div>
          <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded-lg font-mono font-semibold">
            Regla: SHINC
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
            <span className="text-xs text-slate-500 font-medium uppercase">Tiempo Permitido (Allowed)</span>
            <p className="text-xl font-bold text-slate-900 mt-1">{laytime.allowedHours} Horas</p>
            <span className="text-xs text-slate-600">Basado en volumen contractual</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
            <span className="text-xs text-slate-500 font-medium uppercase">Tiempo Consumido (Used)</span>
            <p className="text-xl font-bold text-cyan-600 mt-1">{laytime.usedHours} Horas</p>
            <span className="text-xs text-slate-600">Calculado desde NOR aceptada</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
            <span className="text-xs text-slate-500 font-medium uppercase">Balance de Plancha</span>
            <p className={`text-xl font-bold mt-1 ${laytime.allowedHours - laytime.usedHours >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {(laytime.allowedHours - laytime.usedHours).toFixed(1)} Horas
            </p>
            <span className="text-xs text-slate-600">
              {laytime.allowedHours - laytime.usedHours >= 0 ? 'Margen disponible' : 'Exceso de plancha'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
