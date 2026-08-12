import { getIndexForVessel } from './utils/marketMapper.js?v=20260812-spot-fetch-fix';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

let activeRequestController = null;
let refreshTimer = null;
let lastRequestKey = '';
let lastObservedVesselType = '';
let balticSpotState = {
  vesselType: '',
  marketReference: 'BDI',
  spotRate: null,
  variation: null,
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
  BDI: ['BDI', 'BALTICDRYINDEX'],
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
  return String(document.getElementById('vessel-badge')?.textContent || '').trim();
}

function getCurrentReference() {
  const vesselType = getSelectedVesselType();
  const marketReference = getIndexForVessel(vesselType);
  const pol = String(document.getElementById('port-pol')?.value || '').trim();
  const pod = String(document.getElementById('port-pod')?.value || '').trim();
  return {
    vesselType,
    marketReference,
    requestKey: `${vesselType}|${pol}|${pod}`,
  };
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
  valueElement.textContent = value === null ? 'N/A' : currencyFormatter.format(value);
  valueElement.className = OCEAN_VALUE_CLASS;
  variationElement.hidden = false;
  variationElement.textContent = variation === null
    ? 'Variación N/D'
    : `${variation > 0 ? '+' : ''}${variation.toFixed(2)}%`;
  variationElement.className = `mt-0.5 text-[10px] font-black ${
    variation === null ? 'text-slate-400' : variation >= 0 ? 'text-emerald-600' : 'text-rose-600'
  }`;
  statusElement.textContent = label;
  statusElement.className = `mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'loading'
        ? 'border-sky-200 bg-sky-50 text-sky-700'
        : 'border-slate-200 bg-slate-100 text-slate-500'
  }`;
}

function renderRegionalReference(regionalReference) {
  const { indexElement, valueElement, variationElement, statusElement } = getViewElements();
  if (!indexElement || !valueElement || !variationElement || !statusElement) return;

  indexElement.textContent = 'REGIONAL';
  valueElement.textContent = 'No aplica índice global - Modelo Cost-Plus activo';
  valueElement.className = REGIONAL_VALUE_CLASS;
  variationElement.hidden = true;
  statusElement.textContent = regionalReference.label;
  statusElement.className = 'mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800';
}

async function refreshBalticSpotReference({ force = false } = {}) {
  const { vesselType, marketReference, requestKey } = getCurrentReference();
  if (!force && requestKey === lastRequestKey) return;
  lastRequestKey = requestKey;
  balticSpotState = {
    vesselType,
    marketReference,
    spotRate: null,
    variation: null,
    rawPayload: null,
  };

  activeRequestController?.abort();
  if (typeof marketReference === 'object' && marketReference.type === 'REGIONAL') {
    activeRequestController = null;
    renderRegionalReference(marketReference);
    return;
  }

  const marketIndex = marketReference;
  activeRequestController = new AbortController();
  renderStatus({ marketIndex, label: 'Consultando mercado', tone: 'loading' });

  try {
    const response = await fetch('/api/spot-rates', {
      cache: 'no-store',
      signal: activeRequestController.signal,
    });
    const payload = await response.json().catch(() => null);
    balticSpotState.rawPayload = payload;
    console.log('[Step7 Baltic] /api/spot-rates raw response:', payload);
    const spotEntry = findMarketEntryByIndex(payload, marketIndex);
    console.log('[Step7 Baltic] filtered index:', marketIndex, spotEntry);
    if (!response.ok) throw new Error('Spot rate unavailable');

    if (spotEntry === null) {
      renderStatus({ marketIndex, label: 'Índice no disponible', tone: 'neutral' });
      return;
    }

    balticSpotState.spotRate = spotEntry.rate;
    balticSpotState.variation = spotEntry.variation;

    renderStatus({
      marketIndex,
      value: balticSpotState.spotRate,
      variation: balticSpotState.variation,
      label: 'Dato spot en vivo',
      tone: 'success',
    });
  } catch (error) {
    if (error?.name === 'AbortError') return;
    renderStatus({ marketIndex, label: 'Referencia no disponible', tone: 'neutral' });
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
  refreshBalticSpotReference({ force: true });
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
