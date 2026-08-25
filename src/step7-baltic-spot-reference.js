const indexFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

let activeRequestController = null;
let refreshTimer = null;
let lastRequestKey = '';
let lastObservedVesselType = '';
let currentContractMode = 'SPOT'; // Estado global del modo: 'SPOT' o 'COA'

let balticSpotState = {
  vesselType: '',
  marketReference: 'BDI',
  spotRate: null,
  variation: null,
  alibraRates: {},
  bunkerData: {},
  rawPayload: null,
};

const OCEAN_VALUE_CLASS = 'mono mt-0.5 text-lg font-black text-slate-950';
const REGIONAL_VALUE_CLASS = 'mt-1 max-w-[15rem] text-xs font-black leading-snug text-slate-800';

function readRateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Number.isFinite(Number(value))) return Number(value);
  if (!value || typeof value !== 'object') return null;

  const candidate = value.value
    ?? value.rate
    ?? value.spot_rate
    ?? value.spotRate
    ?? value.indexValue
    ?? value.price
    ?? value.latest
    ?? value.close
    ?? value.tce;
  return candidate !== null && candidate !== undefined && candidate !== '' && Number.isFinite(Number(candidate))
    ? Number(candidate)
    : null;
}

function readVariation(value) {
  if (!value || typeof value !== 'object') return null;
  const candidate = value.variation
    ?? value.changePercent
    ?? value.variationPercent
    ?? value.percentageChange
    ?? value.percentChange
    ?? value.pctChange
    ?? value.change_pct
    ?? value.variation_pct
    ?? value.change;
  if (candidate === null || candidate === undefined || candidate === '') return null;

  const parsedVariation = Number(String(candidate).replace('%', '').trim());
  return Number.isFinite(parsedVariation) ? parsedVariation : null;
}

function readMarketEntry(value) {
  const rate = readRateValue(value);
  return rate === null ? null : { rate, variation: readVariation(value) };
}

const INDEX_ALIASES = {
  BCI: ['BCI', 'CAPE', 'CAPESIZE'],
  BPI: ['BPI', 'PANAMAX'],
  BSI: ['BSI', 'SUPRAMAX'],
  BHSI: ['BHSI', 'HANDY', 'HANDYSIZE'],
  BDI: ['BDI', 'BDIINDEX', 'BALTICDRYINDEX'],
};

function normalizeIndexLabel(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function matchesMarketIndex(value, marketIndex) {
  const normalizedValue = normalizeIndexLabel(value);
  return (INDEX_ALIASES[marketIndex] || [marketIndex])
    .some((alias) => normalizedValue === normalizeIndexLabel(alias));
}

function findMarketEntryByIndex(payload, marketIndex, visited = new Set()) {
  if (!payload || typeof payload !== 'object' || visited.has(payload)) return null;
  visited.add(payload);

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (entry && typeof entry === 'object') {
        const entryIndex = entry.index ?? entry.code ?? entry.symbol ?? entry.name;
        if (matchesMarketIndex(entryIndex, marketIndex)) {
          const matchedEntry = readMarketEntry(entry);
          if (matchedEntry !== null) return matchedEntry;
        }
      }

      const nestedEntry = findMarketEntryByIndex(entry, marketIndex, visited);
      if (nestedEntry !== null) return nestedEntry;
    }
    return null;
  }

  const directKey = Object.keys(payload).find((key) => matchesMarketIndex(key, marketIndex));
  if (directKey) {
    const directEntry = readMarketEntry(payload[directKey]);
    if (directEntry !== null) return directEntry;
  }

  for (const nestedValue of Object.values(payload)) {
    const nestedEntry = findMarketEntryByIndex(nestedValue, marketIndex, visited);
    if (nestedEntry !== null) return nestedEntry;
  }

  return null;
}

function getSelectedVesselType() {
  return String(document.getElementById('vessel-badge')?.textContent || '').trim().toLowerCase();
}

function getViewElements() {
  const indexElement = document.getElementById('baltic-spot-index');
  const valueElement = document.getElementById('baltic-spot-value');
  const variationElement = document.getElementById('baltic-spot-variation');
  const statusElement = document.getElementById('baltic-spot-status');
  return { indexElement, valueElement, variationElement, statusElement };
}

function renderStatus({ marketIndex, value = null, variation = null, label, tone }) {
  const { indexElement, valueElement, variationElement, statusElement } = getViewElements();
  if (!indexElement || !valueElement || !variationElement || !statusElement) return;

  indexElement.textContent = marketIndex;
  valueElement.textContent = value === null ? 'N/A' : `$${indexFormatter.format(value)} /DM`;
  valueElement.className = OCEAN_VALUE_CLASS;
  
  if (variation !== null && variation !== undefined) {
    variationElement.hidden = false;
    variationElement.textContent = `${variation > 0 ? '+' : ''}${variation.toFixed(2)}%`;
    variationElement.className = `mt-0.5 text-[10px] font-black ${variation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
  } else {
    variationElement.hidden = true;
  }

  statusElement.textContent = label;
  statusElement.className = `mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'loading'
        ? 'border-sky-200 bg-sky-50 text-sky-700'
        : 'border-slate-200 bg-slate-100 text-slate-500'
  }`;
}

// Renderizador inteligente según el modo (SPOT vs COA) y la clase de buque
function renderActiveBenchmark() {
  const vesselType = getSelectedVesselType();
  const alibraRates = balticSpotState.alibraRates;
  
  // Mapeo de clases de buques a las propiedades de Alibra
  let vesselKey = 'panamax';
  if (vesselType.includes('cape')) vesselKey = 'capesize';
  else if (vesselType.includes('supra') || vesselType.includes('ultra')) vesselKey = 'supramax';
  else if (vesselType.includes('handy')) vesselKey = 'handysize';

  const baseAlibraRate = alibraRates[vesselKey] || (vesselKey === 'capesize' ? 39500 : vesselKey === 'supramax' ? 20000 : vesselKey === 'handysize' ? 19000 : 20500);

  if (currentContractMode === 'COA' || currentContractMode === 'PERIOD') {
    // MODO COA / PERIOD: Usar Alibra 1-Year T/C fijo
    renderStatus({
      marketIndex: `${vesselKey.toUpperCase()} · 1Y T/C`,
      value: baseAlibraRate,
      variation: null,
      label: 'Referencia Period (Alibra)',
      tone: 'neutral',
    });
    return;
  }

  // MODO SPOT: Calcular Algoritmo Live (TCE Spot Teórico con Búnker y Ratio Baltic)
  const subIndices = {
    capesize:  { live: 4740, base: 4350, consumption: 52 },
    panamax:   { live: 2050, base: 2000, consumption: 32 },
    supramax:  { live: 2400, base: 2300, consumption: 26 },
    handysize: { live: 3420, base: 3300, consumption: 22 }
  };

  const config = subIndices[vesselKey] || subIndices.panamax;
  const marketRatio = config.live / config.base;
  let liveTceSpot = Math.round(baseAlibraRate * marketRatio);

  // Aplicar ajuste de búnker / scrubber si está disponible
  const vlsfo = balticSpotState.bunkerData.vlsfo || 844.29;
  const hsfo = balticSpotState.bunkerData.hsfo || 629.60;
  const useScrubber = document.getElementById('core-scrubber-toggle')?.checked || false;

  if (useScrubber) {
    const dailyScrubberAdvantage = Math.round(config.consumption * (vlsfo - hsfo) * 0.55);
    liveTceSpot += dailyScrubberAdvantage;
  } else {
    const bunkerBaseline = 650;
    const bunkerDrag = Math.round(config.consumption * Math.max(0, vlsfo - bunkerBaseline) * 0.08);
    liveTceSpot -= bunkerDrag;
  }

  renderStatus({
    marketIndex: `${vesselKey.toUpperCase()} · SPOT LIVE`,
    value: liveTceSpot,
    variation: balticSpotState.variation,
    label: useScrubber ? 'TCE Spot (HSFO Scrubber)' : 'TCE Spot (VLSFO Standard)',
    tone: 'success',
  });
}

async function refreshBalticSpotReference({ force = false } = {}) {
  const { vesselType, marketReference, requestKey } = {
    vesselType: getSelectedVesselType(),
    marketReference: 'BDI',
    requestKey: 'market-latest-bdi'
  };

  if (!force && requestKey === lastRequestKey) {
    renderActiveBenchmark();
    return;
  }
  lastRequestKey = requestKey;

  activeRequestController?.abort();
  activeRequestController = new AbortController();
  
  const { indexElement, statusElement } = getViewElements();
  if (statusElement) statusElement.textContent = 'Consultando mercado';

  try {
    const response = await fetch('/api/market/latest', {
      cache: 'no-store',
      signal: activeRequestController.signal,
    });
    const payload = await response.json().catch(() => null);
    balticSpotState.rawPayload = payload;
    
    // Extraer datos de la respuesta (maneja tanto objetos directos como dentro de .data)
    const dataRecord = payload?.data || payload || {};
    
    balticSpotState.alibraRates = {
      capesize: Number(dataRecord.capesize_tc) || 39500,
      panamax: Number(dataRecord.panamax_tc) || 20500,
      supramax: Number(dataRecord.supramax_tc) || 20000,
      handysize: Number(dataRecord.handysize_tc) || 19000,
    };

    balticSpotState.bunkerData = {
      vlsfo: Number(dataRecord.bunker_price_vlsfo ?? dataRecord.vlsfo) || 844.29,
      hsfo: Number(dataRecord.bunker_price_hsfo ?? dataRecord.hsfo) || 629.60,
    };

    const spotEntry = findMarketEntryByIndex(payload, 'BDI');
    balticSpotState.spotRate = spotEntry?.rate || Number(dataRecord.bdi_index) || 2926;
    balticSpotState.variation = spotEntry?.variation || null;

    if (!response.ok) throw new Error('Spot rate unavailable');

    renderActiveBenchmark();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    renderActiveBenchmark(); // Renderiza con respaldos locales si falla la red
  }
}

function scheduleRefresh(options = {}) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => refreshBalticSpotReference(options), 250);
}

function refreshWhenVesselTypeChanges() {
  const vesselType = getSelectedVesselType();
  if (vesselType === lastObservedVesselType) return;
  lastObservedVesselType = vesselType;
  renderActiveBenchmark();
}

function initializeBalticSpotReference() {
  const vesselBadge = document.getElementById('vessel-badge');
  const routeInputs = [document.getElementById('port-pol'), document.getElementById('port-pod')].filter(Boolean);

  routeInputs.forEach((input) => {
    input.addEventListener('change', () => scheduleRefresh({ force: true }));
  });

  if (vesselBadge) {
    new MutationObserver(refreshWhenVesselTypeChanges).observe(vesselBadge, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Enlazar los botones / pestañas de SPOT y COA de la sección 7
  document.querySelectorAll('[data-flete-mode-tab], button').forEach((btn) => {
    const text = btn.textContent.trim().toUpperCase();
    if (text === 'SPOT' || text === 'COA') {
      btn.addEventListener('click', () => {
        currentContractMode = text;
        renderActiveBenchmark();
      });
    }
  });

  window.addEventListener('CALCULATION_EVENT', refreshWhenVesselTypeChanges);
  window.refreshBalticSpotReference = () => refreshBalticSpotReference({ force: true });
  lastObservedVesselType = getSelectedVesselType();
  refreshBalticSpotReference({ force: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBalticSpotReference, { once: true });
} else {
  initializeBalticSpotReference();
}
