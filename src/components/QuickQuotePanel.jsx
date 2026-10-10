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
 * Formatea el precio de un billingItem según el objeto price (total y currency).
 * 
 * @param {Object|number} price - Objeto de precio con { total, currency } o valor numérico
 * @param {string} fallbackCurrency - Divisa por defecto si no viene en el item
 * @returns {string} Precio formateado con símbolo de divisa
 */
export function formatItemPrice(price, fallbackCurrency = 'EUR') {
  if (price === null || price === undefined) return '0,00';
  let total = 0;
  let curr = fallbackCurrency;

  if (typeof price === 'object' && price !== null) {
    total = Number(price.total ?? price.amount ?? price.value ?? 0);
    curr = price.currency || fallbackCurrency;
  } else {
    total = Number(price) || 0;
  }

  const validTotal = Number.isFinite(total) ? total : 0;
  const symbol = curr === 'EUR' ? '€' : curr === 'USD' ? '$' : `${curr} `;
  const numStr = validTotal.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${numStr}`;
}

/**
 * Agrupa los ítems de facturación (billingItems) devueltos por la API (Brutus API / AirQuoteResource)
 * en tres grandes bloques visuales más un bloque opcional de Otros según el enum serviceItem:
 * 
 * 1. Gastos en Origen: ítems con serviceItem "Pickup" y "PortOriginCharges"
 * 2. Flete Principal (Air Freight): ítems con serviceItem "Freight"
 * 3. Gastos en Destino: ítems con serviceItem "PortDestinationCharges" y "Delivery"
 * 4. (Opcional) Otros: ítems con "Others" y "AdditionalService"
 * 
 * @param {Array<Object>} billingItems - Array de billingItems de la cotización aérea
 * @returns {Object} Diccionario con los grupos mapeados, bloques para iteración y totales
 */
export function groupBillingItems(billingItems) {
  const originItems = [];
  const freightItems = [];
  const destinationItems = [];
  const otherItems = [];

  if (Array.isArray(billingItems)) {
    for (const item of billingItems) {
      if (!item) continue;
      const sItem = String(item.serviceItem || item.service_item || item.type || '').trim();

      if (sItem === 'Pickup' || sItem === 'PortOriginCharges') {
        originItems.push(item);
      } else if (sItem === 'Freight') {
        freightItems.push(item);
      } else if (sItem === 'PortDestinationCharges' || sItem === 'Delivery') {
        destinationItems.push(item);
      } else if (sItem === 'Others' || sItem === 'AdditionalService') {
        otherItems.push(item);
      } else {
        const lower = sItem.toLowerCase();
        if (lower === 'pickup' || lower === 'portorigincharges' || lower.includes('origin')) {
          originItems.push(item);
        } else if (lower === 'freight' || lower.includes('airfreight') || lower === 'air freight') {
          freightItems.push(item);
        } else if (lower === 'portdestinationcharges' || lower === 'delivery' || lower.includes('destination')) {
          destinationItems.push(item);
        } else {
          otherItems.push(item);
        }
      }
    }
  }

  // Enriquecer arrays para compatibilidad directa con distintas formas de acceso
  originItems.title = 'Gastos en Origen';
  originItems.items = originItems;

  freightItems.title = 'Flete Principal (Air Freight)';
  freightItems.items = freightItems;

  destinationItems.title = 'Gastos en Destino';
  destinationItems.items = destinationItems;

  otherItems.title = 'Otros';
  otherItems.items = otherItems;

  const blocks = [
    { id: 'origin', key: 'origin', title: 'Gastos en Origen', items: originItems },
    { id: 'freight', key: 'freight', title: 'Flete Principal (Air Freight)', items: freightItems },
    { id: 'destination', key: 'destination', title: 'Gastos en Destino', items: destinationItems },
  ];

  if (otherItems.length > 0) {
    blocks.push({ id: 'others', key: 'others', title: 'Otros', items: otherItems });
  }

  return {
    origin: originItems,
    freight: freightItems,
    destination: destinationItems,
    others: otherItems,
    airFreight: freightItems,
    originCharges: originItems,
    destinationCharges: destinationItems,
    'Gastos en Origen': originItems,
    'Flete Principal (Air Freight)': freightItems,
    'Gastos en Destino': destinationItems,
    'Otros': otherItems,
    blocks,
    groups: blocks,
  };
}

export const groupAirBillingItems = groupBillingItems;

/**
 * Genera dinámicamente un array de billingItems de respaldo (mock condicional)
 * para demostraciones de UI cuando la API de iContainers no devuelva billingItems (entorno de simulación actual).
 * 
 * Estructura generada proporcional al total calculado T:
 * - "Pickup": T * 0.15 (Gastos en Origen)
 * - "PortOriginCharges": T * 0.05 (Gastos en Origen)
 * - "Freight": T * 0.65 (Flete Principal - Air Freight)
 * - "PortDestinationCharges": T * 0.15 (Gastos en Destino)
 * 
 * La suma de los cuatro conceptos cuadra exactamente con el total T (100%).
 * 
 * @param {number} totalAmount - Importe total calculado (T)
 * @param {string} currency - Divisa ('USD', 'EUR', etc.)
 * @returns {Array<Object>} Array de billingItems simulados
 */
export function generateFallbackBillingItems(totalAmount, currency = 'USD') {
  const T = Number(totalAmount) > 0 ? Number(totalAmount) : 0;
  if (T <= 0) return [];

  const curr = String(currency || 'USD').toUpperCase();
  const pickupTotal = Math.round(T * 0.15 * 100) / 100;
  const originChargesTotal = Math.round(T * 0.05 * 100) / 100;
  const freightTotal = Math.round(T * 0.65 * 100) / 100;
  const destinationChargesTotal = Math.round((T - pickupTotal - originChargesTotal - freightTotal) * 100) / 100;

  return [
    {
      id: 'fallback-pickup',
      name: 'Recogida en Origen (Pickup)',
      serviceItem: 'Pickup',
      price: {
        total: pickupTotal,
        currency: curr,
      },
    },
    {
      id: 'fallback-port-origin-charges',
      name: 'Tasas de Terminal Origen (Port Origin Charges)',
      serviceItem: 'PortOriginCharges',
      price: {
        total: originChargesTotal,
        currency: curr,
      },
    },
    {
      id: 'fallback-freight',
      name: 'Flete Aéreo Principal (Air Freight)',
      serviceItem: 'Freight',
      price: {
        total: freightTotal,
        currency: curr,
      },
    },
    {
      id: 'fallback-port-destination-charges',
      name: 'Gastos de Terminal Destino (Port Destination Charges)',
      serviceItem: 'PortDestinationCharges',
      price: {
        total: destinationChargesTotal,
        currency: curr,
      },
    },
  ];
}

/**
 * Resuelve de forma condicional (Zero-Rework) los billing items:
 * - Si la cotización devuelve un array billingItems válido y con elementos (API conectada), úsalo.
 * - Si el array es nulo, indefinido o vacío (entorno de simulación actual), genera automáticamente
 *   un array de billingItems de respaldo basado en el total calculado T.
 */
export function resolveBillingItems(items, quote, total, curr = 'USD', failed = false) {
  if (failed) return [];
  if (Array.isArray(items) && items.length > 0) return items;
  if (Array.isArray(quote?.billingItems) && quote.billingItems.length > 0) return quote.billingItems;
  if (Array.isArray(quote?.primaryRate?.billingItems) && quote.primaryRate.billingItems.length > 0) return quote.primaryRate.billingItems;

  const T = Number(total) > 0 ? Number(total) : 0;
  if (T > 0) {
    return generateFallbackBillingItems(T, curr);
  }
  return [];
}

/**
 * Componente QuickQuotePanel (Core PRO)
 * Incluye chivato visual de cobro y booking en tiempo real (Badge/Pill),
 * consulta en segundo plano (polling cada 15-20 segundos con setInterval),
 * bloqueo de acciones tras la confirmación del pago y desglose categorizado
 * de costes aéreos basado en Brutus API (billingItems).
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
  onCalculate = null,
  billingItems = null,
  quoteData = null,
  isQuoteFailed = false,
  showBreakdown: controlledShowBreakdown = null,
  onToggleBreakdown = null,
}) {
  const [status, setStatus] = useState(initialStatus);
  const [syncRecord, setSyncRecord] = useState({ id: syncedId, referencia: syncedRef });
  const [isSyncing, setIsSyncing] = useState(false);
  // Estado inicial del importe total en 0 (o null) por defecto
  const [consolidatedTotal, setConsolidatedTotal] = useState(0);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [localBillingItems, setLocalBillingItems] = useState(() =>
    resolveBillingItems(billingItems, quoteData, totalAmount, currency, isQuoteFailed)
  );
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

  // Selección unificada de billingItems (de props, state o quoteData)
  // Lógica condicional Zero-Rework:
  // Si la cotización devuelve un array billingItems válido y con elementos (API conectada), úsalo.
  // Si el array es nulo, indefinido o vacío (entorno de simulación actual), usa localBillingItems
  // o genera automáticamente el respaldo basado en el total consolidado para procesar el desglose.
  const activeBillingItems = (Array.isArray(billingItems) && billingItems.length > 0)
    ? billingItems
    : (Array.isArray(quoteData?.billingItems) && quoteData.billingItems.length > 0)
    ? quoteData.billingItems
    : (Array.isArray(quoteData?.primaryRate?.billingItems) && quoteData.primaryRate.billingItems.length > 0)
    ? quoteData.primaryRate.billingItems
    : (Array.isArray(localBillingItems) && localBillingItems.length > 0)
    ? localBillingItems
    : (consolidatedTotal > 0 && !isQuoteFailed)
    ? generateFallbackBillingItems(consolidatedTotal, currency)
    : [];

  // Regla de Seguridad: billingItems debe existir y tener longitud mayor a cero;
  // si el array está vacío o la cotización falla, el botón debe permanecer deshabilitado.
  const hasValidBillingItems = Array.isArray(activeBillingItems) && activeBillingItems.length > 0 && !isQuoteFailed;
  const isBreakdownVisible = showBreakdown && hasValidBillingItems;

  const billingItemsTotal = (Array.isArray(activeBillingItems) ? activeBillingItems : []).reduce((sum, item) => {
    const itemTotal = typeof item?.price === 'object' && item?.price !== null
      ? Number(item.price.total ?? item.price.amount ?? 0)
      : Number(item?.price ?? item?.total ?? item?.amount ?? 0);
    return sum + (Number.isFinite(itemTotal) ? itemTotal : 0);
  }, 0);

  // Sincronizar total consolidado con billingItems si no está calculado previamente
  useEffect(() => {
    if (consolidatedTotal === 0 && billingItemsTotal > 0 && !isQuoteFailed) {
      setConsolidatedTotal(billingItemsTotal);
    }
  }, [billingItemsTotal, consolidatedTotal, isQuoteFailed]);

  // Actualizar billing items locales:
  // Si la cotización devuelve un array billingItems válido y con elementos (API conectada), úsalo.
  // Si el array es nulo, indefinido o vacío (entorno de simulación actual), genera automáticamente
  // un array de billingItems de respaldo basado en el total calculado y cárgalo en localBillingItems.
  useEffect(() => {
    if (isQuoteFailed) {
      setLocalBillingItems([]);
      return;
    }
    if (Array.isArray(billingItems) && billingItems.length > 0) {
      setLocalBillingItems(billingItems);
    } else if (Array.isArray(quoteData?.billingItems) && quoteData.billingItems.length > 0) {
      setLocalBillingItems(quoteData.billingItems);
    } else if (Array.isArray(quoteData?.primaryRate?.billingItems) && quoteData.primaryRate.billingItems.length > 0) {
      setLocalBillingItems(quoteData.primaryRate.billingItems);
    } else {
      const currentT = Number(consolidatedTotal) > 0 ? Number(consolidatedTotal) : Number(totalAmount) > 0 ? Number(totalAmount) : 0;
      if (currentT > 0) {
        setLocalBillingItems(generateFallbackBillingItems(currentT, currency));
      } else {
        setLocalBillingItems([]);
      }
    }
  }, [billingItems, quoteData, consolidatedTotal, totalAmount, currency, isQuoteFailed]);

  // Manejador del botón Calcular Tarifa (simulando respuesta de API)
  const handleCalculate = useCallback(() => {
    let calculatedRate = null;
    let providedItems = null;

    if (typeof onCalculate === 'function') {
      const result = onCalculate();
      if (typeof result === 'number') {
        calculatedRate = result;
      } else if (result && typeof result === 'object') {
        calculatedRate = typeof result.total === 'number'
          ? result.total
          : typeof result.totalAmount === 'number'
          ? result.totalAmount
          : null;
        if (Array.isArray(result.billingItems) && result.billingItems.length > 0) {
          providedItems = result.billingItems;
        }
      }
    }

    if (calculatedRate === null || calculatedRate <= 0) {
      const billingSum = (Array.isArray(activeBillingItems) ? activeBillingItems : []).reduce((sum, item) => {
        const itemTotal = typeof item?.price === 'object' && item?.price !== null
          ? Number(item.price.total ?? item.price.amount ?? 0)
          : Number(item?.price ?? item?.total ?? item?.amount ?? 0);
        return sum + (Number.isFinite(itemTotal) ? itemTotal : 0);
      }, 0);
      calculatedRate = Number(totalAmount) > 0 ? Number(totalAmount) : (billingSum > 0 ? billingSum : 2501.25);
    }

    setConsolidatedTotal(calculatedRate);

    // INYECCIÓN CONDICIONAL DEL MOCK AL ESTADO
    if (Array.isArray(providedItems) && providedItems.length > 0) {
      setLocalBillingItems(providedItems);
    } else if (Array.isArray(billingItems) && billingItems.length > 0) {
      setLocalBillingItems(billingItems);
    } else if (Array.isArray(quoteData?.billingItems) && quoteData.billingItems.length > 0) {
      setLocalBillingItems(quoteData.billingItems);
    } else if (Array.isArray(quoteData?.primaryRate?.billingItems) && quoteData.primaryRate.billingItems.length > 0) {
      setLocalBillingItems(quoteData.primaryRate.billingItems);
    } else if (calculatedRate > 0 && !isQuoteFailed) {
      const fallbackItems = generateFallbackBillingItems(calculatedRate, currency);
      setLocalBillingItems(fallbackItems);
    }
  }, [onCalculate, totalAmount, activeBillingItems, billingItems, quoteData, isQuoteFailed, currency]);

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

  const handleToggleBreakdown = () => {
    if (hasValidBillingItems) setShowBreakdown(prev => !prev);
  };

  const groupedBreakdown = groupBillingItems(activeBillingItems);
  const groupedBlocks = groupedBreakdown.blocks || [
    { id: 'origin', title: 'Gastos en Origen', items: groupedBreakdown.origin },
    { id: 'freight', title: 'Flete Principal (Air Freight)', items: groupedBreakdown.freight },
    { id: 'destination', title: 'Gastos en Destino', items: groupedBreakdown.destination },
    ...(groupedBreakdown.others?.length > 0 ? [{ id: 'others', title: 'Otros', items: groupedBreakdown.others }] : []),
  ];

  const isZeroOrNull = consolidatedTotal === null || consolidatedTotal === 0 || !consolidatedTotal;
  const currencySymbol = currency === 'EUR' ? '€' : '$';
  const displayTotal = isZeroOrNull ? 0 : consolidatedTotal;
  const formattedTotal = Number(displayTotal).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

        {/* Botón Principal Ancho: Calcular Tarifa */}
        <button
          id="btn-calculate-tariff"
          type="button"
          onClick={handleCalculate}
          className="w-full bg-blue-600 text-white font-semibold py-2 rounded mb-4 hover:bg-blue-700 transition shadow-sm flex items-center justify-center gap-2"
        >
          <i className="fa-solid fa-calculator" aria-hidden="true"></i>
          <span>Calcular Tarifa</span>
        </button>

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
            data-testid="fcl-breakdown-toggle"
            type="button"
            disabled={!hasValidBillingItems}
            onClick={handleToggleBreakdown}
            className={`sc-button w-full flex items-center justify-center gap-2 text-xs font-bold rounded-lg py-2 transition ${!hasValidBillingItems ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 cursor-pointer'}`}
            aria-expanded={isBreakdownVisible}
          >
            <i className={`fa-solid ${isBreakdownVisible ? 'fa-chevron-up' : 'fa-layer-group'} ${!hasValidBillingItems ? 'text-slate-400' : 'text-slate-500'}`}></i>
            <span>{isBreakdownVisible ? 'Ocultar Desglose' : 'Ver Desglose'}</span>
          </button>

          <button
            id="fcl-export-client-pdf-btn"
            disabled={isZeroOrNull}
            className={`sc-button secondary w-full flex items-center justify-center gap-2 text-xs font-bold rounded-lg py-2 transition ${
              isZeroOrNull
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
            }`}
            type="button"
          >
            <i className="fa-solid fa-file-pdf text-rose-600" aria-hidden="true"></i>
            <span>Exportar Oferta Cliente (PDF)</span>
          </button>

          {/* Botón de Sincronización: Bloqueado si status === 'confirmed', sincronizando o precio cero */}
          <button
            id="btn-sync-databridge-quote"
            disabled={status === 'confirmed' || isSyncing || isZeroOrNull}
            onClick={handleSyncClick}
            title={
              status === 'confirmed'
                ? 'Cotización ya pagada y confirmada (Booking Confirmado)'
                : isZeroOrNull
                ? 'Calcule la tarifa antes de sincronizar con Data Bridge'
                : 'Sincronizar cotización con Data Bridge'
            }
            className={`sc-button secondary w-full flex items-center justify-center gap-2 text-xs font-bold rounded-lg py-2 transition ${
              status === 'confirmed' || isZeroOrNull
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

        {/* Modal / Panel Expansible de Desglose de Costes (Brutus API) */}
        {isBreakdownVisible && (
          <div
            id="quick-quote-breakdown-panel"
            data-testid="quick-quote-breakdown-panel"
            className="mt-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3 shadow-sm text-xs transition-all"
            aria-label="Desglose detallado de costes"
          >
            {/* Cabecera del Desglose */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <i className="fa-solid fa-layer-group text-sky-600"></i>
                Desglose de Costes (Brutus API)
              </span>
              <button
                type="button"
                onClick={() => setShowBreakdown(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
                title="Cerrar desglose"
                aria-label="Cerrar desglose"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Bloques de Categorías */}
            <div className="flex flex-col gap-2.5">
              {groupedBlocks.map((group) => {
                if (!group.items || group.items.length === 0) return null;
                return (
                  <div
                    key={group.id}
                    data-testid={`breakdown-group-${group.id}`}
                    className="flex flex-col gap-1.5 bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-xs"
                  >
                    {/* Título de Grupo */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-0.5">
                      <span className="font-bold text-slate-700 text-[11px] flex items-center gap-1.5">
                        {group.id === 'origin' && <i className="fa-solid fa-plane-departure text-sky-500 text-[10px]"></i>}
                        {group.id === 'freight' && <i className="fa-solid fa-plane text-indigo-500 text-[10px]"></i>}
                        {group.id === 'destination' && <i className="fa-solid fa-plane-arrival text-emerald-500 text-[10px]"></i>}
                        {group.id === 'others' && <i className="fa-solid fa-ellipsis text-amber-500 text-[10px]"></i>}
                        {group.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium font-mono">
                        {group.items.length} {group.items.length === 1 ? 'concepto' : 'conceptos'}
                      </span>
                    </div>

                    {/* Lista de Ítems */}
                    <div className="flex flex-col gap-1">
                      {group.items.map((item, idx) => {
                        const itemName = item.name || item.description || item.concept || `Cargo ${idx + 1}`;
                        const formattedPrice = formatItemPrice(item.price, currency);

                        return (
                          <div
                            key={item.id || `${group.id}-${idx}`}
                            data-testid="breakdown-item-row"
                            className="flex items-center justify-between gap-2 py-0.5"
                          >
                            <span className="text-left text-slate-600 truncate text-[11px]" title={itemName}>
                              {itemName}
                            </span>
                            <span className="text-right font-mono font-bold text-slate-800 text-[11px] shrink-0">
                              {formattedPrice}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fila Final: Total General consolidado */}
            <div
              id="breakdown-total-row"
              data-testid="breakdown-total-row"
              className="flex items-center justify-between border-t-2 border-slate-300 pt-2.5 mt-0.5 bg-white p-2.5 rounded-lg border border-slate-200"
            >
              <div className="flex flex-col text-left">
                <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">
                  Total General
                </span>
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">
                  Total Venta Consolidado
                </span>
              </div>
              <div className="text-right">
                <output
                  id="breakdown-total-output"
                  data-testid="breakdown-total-output"
                  className="text-base font-black font-mono text-slate-900 tracking-tight"
                >
                  {currencySymbol}{formattedTotal}
                </output>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default QuickQuotePanel;
