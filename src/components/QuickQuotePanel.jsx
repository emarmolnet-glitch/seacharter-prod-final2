import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Normaliza y comprueba si un texto de estado devuelto por el backend
 * corresponde a un cobro o confirmación de booking.
 */
export function isBookingConfirmedStatus(statusStr) {
  if (!statusStr) return false;
  const s = String(statusStr).toLowerCase().trim();
  return (
    s.includes('booking confirmado') ||
    s.includes('pago recibido') ||
    s.includes('confirmado') ||
    s.includes('pagado') ||
    s === 'booking_confirmed' ||
    s === 'paid'
  );
}

/**
 * Componente QuickQuotePanel (Core PRO)
 * Incluye chivato visual de cobro y booking en tiempo real (Badge/Pill),
 * consulta en segundo plano (polling cada 15-20 segundos con setInterval)
 * y bloqueo de acciones tras la confirmación del pago.
 */
export function QuickQuotePanel({
  modeLabel = 'GLOBAL',
  totalAmount = 0,
  currency = 'EUR',
  initialStatus = 'draft',
  syncedId = null,
  syncedRef = null,
  onSyncDataBridge = null,
  pollingIntervalMs = 15000,
}) {
  const [status, setStatus] = useState(initialStatus);
  const [syncRecord, setSyncRecord] = useState({ id: syncedId, referencia: syncedRef });
  const [isSyncing, setIsSyncing] = useState(false);
  const activeIntervalRef = useRef(null);

  // Sincronizar props externas si cambian
  useEffect(() => {
    if (syncedId || syncedRef) {
      setSyncRecord((prev) => ({
        id: syncedId !== undefined ? syncedId : prev.id,
        referencia: syncedRef !== undefined ? syncedRef : prev.referencia,
      }));
    }
  }, [syncedId, syncedRef]);

  useEffect(() => {
    if (initialStatus && initialStatus !== status) {
      setStatus(initialStatus);
    }
  }, [initialStatus]);

  // Consulta en segundo plano (Polling): cada 15-20s si la cotización ya fue sincronizada
  useEffect(() => {
    const hasSyncIdentifier = Boolean(syncRecord.referencia || syncRecord.id);
    
    // Si no está sincronizado o ya es el estado definitivo ("confirmed"), no iniciar polling
    if (!hasSyncIdentifier || status === 'confirmed') {
      if (activeIntervalRef.current) {
        clearInterval(activeIntervalRef.current);
        activeIntervalRef.current = null;
      }
      return;
    }

    const checkStatus = async () => {
      try {
        const queryParam = syncRecord.id
          ? `id=${encodeURIComponent(syncRecord.id)}`
          : `ref=${encodeURIComponent(syncRecord.referencia)}`;

        const response = await fetch(`/api/multimodal/sync?${queryParam}`, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) return;
        const result = await response.json();
        if (!result || !result.success) return;

        let record = null;
        if (Array.isArray(result.data)) {
          record =
            result.data.find(
              (r) =>
                (syncRecord.referencia && r.referencia === syncRecord.referencia) ||
                (syncRecord.id && String(r.id) === String(syncRecord.id))
            ) || result.data[0];
        } else if (result.data && typeof result.data === 'object') {
          record = result.data;
        }

        if (record && record.estado) {
          if (isBookingConfirmedStatus(record.estado)) {
            setStatus('confirmed');
            if (activeIntervalRef.current) {
              clearInterval(activeIntervalRef.current);
              activeIntervalRef.current = null;
            }
          } else if (status !== 'confirmed') {
            setStatus('waiting_payment');
          }
        }
      } catch (err) {
        console.warn('[QuickQuotePanel Polling] Error consultando estado en segundo plano:', err);
      }
    };

    // Iniciar intervalo de polling
    const interval = setInterval(checkStatus, pollingIntervalMs);
    activeIntervalRef.current = interval;

    // Limpieza estricta de intervalo al desmontar el componente o cambiar dependencias
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      activeIntervalRef.current = null;
    };
  }, [syncRecord.referencia, syncRecord.id, status, pollingIntervalMs]);

  // Manejador del botón Sincronizar Data Bridge
  const handleSyncClick = useCallback(async () => {
    if (status === 'confirmed' || isSyncing) return;

    setIsSyncing(true);
    try {
      let result = null;
      if (typeof onSyncDataBridge === 'function') {
        result = await onSyncDataBridge();
      } else if (typeof window !== 'undefined' && typeof window.handleSyncDataBridge === 'function') {
        result = await window.handleSyncDataBridge();
      }

      const newRef = result?.referencia || `RDM-MM-${Math.floor(1000 + Math.random() * 9000)}`;
      const newId = result?.id || null;

      setSyncRecord({ id: newId, referencia: newRef });
      setStatus('waiting_payment');
    } catch (err) {
      console.error('[QuickQuotePanel] Error al sincronizar:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [status, isSyncing, onSyncDataBridge]);

  const currencySymbol = currency === 'EUR' ? '€' : '$';
  const formattedTotal = Number(totalAmount || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="lg:col-span-4 xl:col-span-3 sticky top-4 z-30">
      <section
        id="multimodal-quick-quote-panel"
        className="multimodal-global-quote-panel bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4"
        aria-live="polite"
      >
        {/* Cabecera con Título Dinámico y Subtítulo */}
        <div className="border-b border-slate-100 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span
              id="quick-quote-mode-title"
              className="fcl-kicker text-xs font-black uppercase tracking-wider text-sky-700"
            >
              QUICK QUOTE {modeLabel}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              <i className="fa-solid fa-lock text-[9px]"></i> All-In Venta
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-snug">
            Precio final de venta consolidado para el cliente (Flete Base + Margen Comercial).
          </p>

          {/* Chivato de Cobro y Booking / Badge de Estado */}
          <div id="quick-quote-status-wrapper" className="mt-2.5 flex items-center">
            {status === 'confirmed' ? (
              <span
                id="quick-quote-status-badge"
                data-status="confirmed"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-sm transition-all duration-200"
              >
                <span id="quick-quote-status-icon" className="text-emerald-700 font-black text-xs">
                  ✓
                </span>
                <span id="quick-quote-status-text">Pago Recibido - Booking Confirmado</span>
              </span>
            ) : status === 'waiting_payment' ? (
              <span
                id="quick-quote-status-badge"
                data-status="waiting_payment"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm transition-all duration-200"
              >
                <i id="quick-quote-status-icon" className="fa-regular fa-clock text-[10px] text-amber-800"></i>
                <span id="quick-quote-status-text">Enviado - Esperando Pago</span>
              </span>
            ) : (
              <span
                id="quick-quote-status-badge"
                data-status="draft"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 transition-all duration-200"
              >
                <i id="quick-quote-status-icon" className="fa-regular fa-file-lines text-[10px] text-slate-400"></i>
                <span id="quick-quote-status-text">Borrador</span>
              </span>
            )}
          </div>
        </div>

        {/* Visualización del Precio Total */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col gap-1 text-left">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Total Venta Consolidado
          </span>
          <output
            id="multimodal-quote-total"
            className="fcl-total-value text-3xl xl:text-4xl font-black text-slate-800 tracking-tight font-mono"
            title={`Precio final de venta: ${currencySymbol}${formattedTotal}`}
          >
            {currencySymbol}
            {formattedTotal}
          </output>
          <span className="text-[11px] text-slate-400 font-medium">
            Impuestos no incluidos · Sujeto a recargos aplicables
          </span>
        </div>

        {/* Acciones del Panel */}
        <div className="flex flex-col gap-2 w-full pt-1">
          <button
            id="fcl-breakdown-toggle"
            className="sc-button w-full flex items-center justify-center gap-2 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg py-2 transition"
            type="button"
          >
            <i className="fa-solid fa-layer-group text-slate-500"></i>
            <span>Ver Desglose de Costes</span>
          </button>

          <button
            id="fcl-export-client-pdf-btn"
            className="sc-button secondary w-full flex items-center justify-center gap-2 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg py-2 transition"
            type="button"
          >
            <i className="fa-solid fa-file-pdf text-rose-600" aria-hidden="true"></i>
            <span>Exportar Oferta Cliente (PDF)</span>
          </button>

          {/* Botón de Sincronización: Bloqueado si status === 'confirmed' */}
          <button
            id="btn-sync-databridge-quote"
            disabled={status === 'confirmed' || isSyncing}
            onClick={handleSyncClick}
            title={
              status === 'confirmed'
                ? 'Cotización ya pagada y confirmada (Booking Confirmado)'
                : 'Sincronizar cotización con Data Bridge'
            }
            className={`sc-button secondary w-full flex items-center justify-center gap-2 text-xs font-bold rounded-lg py-2 transition ${
              status === 'confirmed'
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200'
            }`}
            type="button"
          >
            {isSyncing ? (
              <>
                <i className="fa-solid fa-spinner fa-spin text-sky-600" aria-hidden="true"></i>
                <span>Sincronizando...</span>
              </>
            ) : status === 'confirmed' ? (
              <>
                <i className="fa-solid fa-lock text-emerald-600" aria-hidden="true"></i>
                <span>Booking Confirmado</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-cloud-arrow-down text-sky-600" aria-hidden="true"></i>
                <span>Sincronizar Data Bridge</span>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

export default QuickQuotePanel;
