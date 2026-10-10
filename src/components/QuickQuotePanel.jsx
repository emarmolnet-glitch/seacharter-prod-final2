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
  onExportPdf = null,
  onExport = null,
  generarPDF = null,
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
  
  // NUEVO ESTADO PARA EL BOTÓN DE PAGO
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // NUEVA FUNCIÓN PARA EL BOTÓN DE PAGO
  const handleCheckout = useCallback(() => {
    setIsCheckingOut(true);
    setTimeout(() => {
      alert("Iniciando conexión con pasarela de pago segura... (Proveedor de pagos pendiente de integración)");
      setIsCheckingOut(false);
    }, 1000);
  }, []);

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

  // Manejador del botón Exportar Oferta Cliente (PDF)
  const handleExport = useCallback(async (customQuoteData = null) => {
    const isZero = consolidatedTotal === null || consolidatedTotal === 0 || !consolidatedTotal;
    if (isZero) return;

    try {
      if (typeof onExportPdf === 'function') {
        await onExportPdf({ totalPrice: consolidatedTotal, currency, mode: modeLabel, quoteData: customQuoteData || quoteData });
        return;
      }
      if (typeof onExport === 'function') {
        await onExport({ totalPrice: consolidatedTotal, currency, mode: modeLabel, quoteData: customQuoteData || quoteData });
        return;
      }
      if (typeof generarPDF === 'function') {
        await generarPDF({ totalPrice: consolidatedTotal, currency, mode: modeLabel, quoteData: customQuoteData || quoteData });
        return;
      }
      if (typeof window !== 'undefined' && typeof window.exportMultimodalClientPdf === 'function') {
        window.exportMultimodalClientPdf({ totalPrice: consolidatedTotal, currency, mode: modeLabel, quoteData: customQuoteData || quoteData });
        return;
      }
      if (typeof window !== 'undefined' && typeof window.generarPDF === 'function') {
        window.generarPDF({ totalPrice: consolidatedTotal, currency, mode: modeLabel, quoteData: customQuoteData || quoteData });
        return;
      }
      console.warn('[QuickQuotePanel] No hay función de exportación a PDF configurada.');
    } catch (err) {
      console.error('[QuickQuotePanel] Error al exportar oferta PDF:', err);
    }
  }, [consolidatedTotal, currency, modeLabel, onExportPdf, onExport, generarPDF, quoteData]);

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

  const isZeroOrNull
