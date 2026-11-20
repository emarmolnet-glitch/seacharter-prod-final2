const indexFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

let latestSnapshot = null;
let lastObservedVesselType = '';

function formatDate(value) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function normalizeVesselClass(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'desconocido' || normalized === 'unknown' || normalized === 'clase no detectada') {
    return '';
  }
  if (normalized.includes('cape') || normalized.includes('vloc') || normalized.includes('vlcc')) return 'Capesize';
  if (normalized.includes('panamax') || normalized.includes('kamsar')) return 'Panamax';
  if (normalized.includes('supra') || normalized.includes('ultra')) return 'Supramax';
  if (normalized.includes('handy')) return 'Handysize';
  return '';
}

function getSelectedVesselClass() {
  // 1. Prioritize explicitly selected vessel in vessel-badge if it maps to a standard class
  const badge = document.getElementById('vessel-badge');
  const badgeRaw = badge?.textContent === 'Cement Carrier' ? badge?.dataset?.operationalClass : badge?.textContent;
  const badgeClass = normalizeVesselClass(badgeRaw);
  if (badgeClass) return badgeClass;

  // 2. Synchronize with DWT Pricing Router (card dataset, badge dataset, status text, window category)
  const routerBadge = document.getElementById('vessel-pricing-router-badge');
  const routerStatus = document.getElementById('vessel-pricing-router-status');
  const routerCard = document.getElementById('vessel-pricing-router-card');
  const routerCandidates = [
    routerCard?.dataset?.vesselClass,
    routerBadge?.dataset?.vesselClass,
    routerStatus?.dataset?.vesselClass,
    typeof window !== 'undefined' ? window.currentVesselStandardClass : null,
    typeof window !== 'undefined' ? window.currentVesselPricingCategory : null,
    typeof window !== 'undefined' ? window.currentVesselPricingClass?.categoryName : null,
    routerBadge?.textContent,
    routerStatus?.textContent,
  ];
  for (const candidate of routerCandidates) {
    const candidateClass = normalizeVesselClass(candidate);
    if (candidateClass) return candidateClass;
  }

  // 3. Fallback to State if detected
  if (typeof window !== 'undefined' && window.State) {
    const stateClass = normalizeVesselClass(window.State.class || window.State.detectedVesselSegment);
    if (stateClass) return stateClass;
  }

  // 4. Derive from vessel DWT input if standard class (>= 15,000 MT)
  const dwtInput = document.getElementById('vessel-dwt');
  const dwtVal = Number(dwtInput?.value || (typeof window !== 'undefined' && window.State?.dwt) || 0);
  if (dwtVal >= 15000) {
    if (typeof window !== 'undefined' && typeof window.getVesselClass === 'function') {
      const pricingObj = window.getVesselClass(dwtVal);
      const cls = normalizeVesselClass(pricingObj?.categoryName);
      if (cls) return cls;
    }
    if (dwtVal < 35000) return 'Handysize';
    if (dwtVal < 65000) return 'Supramax';
    if (dwtVal < 85000) return 'Panamax';
    return 'Capesize';
  }

  return '';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
  return element;
}

function statusTone(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized.includes('LIVE') || normalized.includes('READY') || normalized.includes('AUTO')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized.includes('MANUAL') || normalized.includes('STALE') || normalized.includes('DEGRA')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-100 text-slate-500';
}

function renderStatus(id, label, layoutClass = '') {
  const element = setText(id, label || 'No disponible');
  if (element) {
    element.className = `${layoutClass} rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${statusTone(label)}`.trim();
  }
}

function renderBdi(snapshot) {
  const bdi = snapshot?.bdi;
  setText('baltic-spot-index', 'BDI');
  setText('baltic-spot-value', bdi?.value === null || bdi?.value === undefined ? '—' : indexFormatter.format(bdi.value));
  setText('baltic-spot-updated', formatDate(bdi?.updatedAt));

  const variations = [];
  if (bdi?.changeValue !== null && bdi?.changeValue !== undefined) {
    variations.push(`${bdi.changeValue >= 0 ? '+' : ''}${indexFormatter.format(bdi.changeValue)} pts`);
  }
  if (bdi?.changePct !== null && bdi?.changePct !== undefined) {
    variations.push(`${bdi.changePct >= 0 ? '+' : ''}${indexFormatter.format(bdi.changePct)}%`);
  }
  const variationElement = setText('baltic-spot-variation', variations.join(' · ') || 'Variación N/D');
  if (variationElement) {
    const direction = bdi?.changeValue ?? bdi?.changePct;
    variationElement.className = `mt-0.5 text-[10px] font-black ${
      direction === null || direction === undefined
        ? 'text-slate-400'
        : direction >= 0 ? 'text-emerald-600' : 'text-rose-600'
    }`;
  }
  renderStatus('baltic-spot-status', bdi?.status || snapshot?.status || 'No disponible', 'mt-2 inline-flex');
}

function renderTceSpot(snapshot) {
  const activeSnapshot = snapshot || latestSnapshot || (typeof window !== 'undefined' ? (window.MarketIntelligenceHydration?.getSnapshot?.() || window.State?.marketSnapshot) : null);
  const vesselClass = getSelectedVesselClass();
  const tceSpot = vesselClass ? (activeSnapshot?.tceSpotByClass?.[vesselClass] || activeSnapshot?.tceSpotByClass?.[vesselClass.toLowerCase()]) : null;
  setText('tce-spot-theoretical-class', vesselClass || 'Clase no detectada');
  setText(
    'tce-spot-theoretical-value',
    tceSpot?.theoreticalSpotTce === null || tceSpot?.theoreticalSpotTce === undefined
      ? '—'
      : currencyFormatter.format(tceSpot.theoreticalSpotTce),
  );
  setText('tce-spot-theoretical-updated', formatDate(tceSpot?.updatedAt));
  setText('tce-spot-theoretical-fuel', tceSpot?.fuelLabel || 'Combustible N/D');

  const spreadParts = [];
  if (tceSpot?.spreadUsd !== null && tceSpot?.spreadUsd !== undefined) {
    spreadParts.push(`${tceSpot.spreadUsd >= 0 ? '+' : '-'}${currencyFormatter.format(Math.abs(tceSpot.spreadUsd))}`);
  }
  if (tceSpot?.spreadPct !== null && tceSpot?.spreadPct !== undefined) {
    spreadParts.push(`${tceSpot.spreadPct >= 0 ? '+' : ''}${indexFormatter.format(tceSpot.spreadPct)}%`);
  }
  const spreadElement = setText(
    'tce-spot-theoretical-spread',
    spreadParts.length ? `Brecha: ${spreadParts.join(' · ')}` : 'Brecha no disponible',
  );
  if (spreadElement) {
    const direction = tceSpot?.spreadUsd ?? tceSpot?.spreadPct;
    spreadElement.className = `text-[10px] font-black ${
      direction === null || direction === undefined
        ? 'text-slate-500'
        : direction >= 0 ? 'text-emerald-700' : 'text-rose-700'
    }`;
  }

  renderStatus(
    'tce-spot-theoretical-status',
    tceSpot?.algorithmLabel || tceSpot?.status || 'No disponible',
  );

  if (typeof window !== 'undefined') {
    if (window.State) {
      window.State.marketSnapshot = activeSnapshot || snapshot;
      if (Number.isFinite(Number(tceSpot?.theoreticalSpotTce)) && Number(tceSpot.theoreticalSpotTce) > 0) {
        window.State.theoreticalSpotTce = Number(tceSpot.theoreticalSpotTce);
      }
    }
    if (Number.isFinite(Number(tceSpot?.theoreticalSpotTce)) && Number(tceSpot.theoreticalSpotTce) > 0 && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('MARKET_REFERENCE_UPDATED', {
        detail: {
          tce: Number(tceSpot.theoreticalSpotTce),
          mode: 'live',
          vesselClass,
          status: tceSpot.status || 'LIVE',
        },
      }));
    }
  }
}

function renderSnapshot(snapshot) {
  latestSnapshot = snapshot || null;
  renderBdi(latestSnapshot);
  renderTceSpot(latestSnapshot);
}

function refreshWhenVesselTypeChanges(force = false) {
  const currentClass = getSelectedVesselClass();
  const rawBadge = String(document.getElementById('vessel-badge')?.textContent || '').trim();
  const routerBadge = String(document.getElementById('vessel-pricing-router-badge')?.textContent || '').trim();
  const routerStatus = String(document.getElementById('vessel-pricing-router-status')?.textContent || '').trim();
  const dwtVal = String(document.getElementById('vessel-dwt')?.value || '').trim();
  const signature = `${currentClass}|${rawBadge}|${routerBadge}|${routerStatus}|${dwtVal}`;
  if (!force && signature === lastObservedVesselType) return;
  lastObservedVesselType = signature;
  renderTceSpot(latestSnapshot);
}

function initializeBalticSpotReference() {
  const hydration = window.MarketIntelligenceHydration;
  const vesselBadge = document.getElementById('vessel-badge');
  const routerStatus = document.getElementById('vessel-pricing-router-status');
  const routerBadge = document.getElementById('vessel-pricing-router-badge');
  const vesselDwt = document.getElementById('vessel-dwt');

  if (vesselBadge) {
    new MutationObserver(() => refreshWhenVesselTypeChanges()).observe(vesselBadge, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (routerStatus) {
    new MutationObserver(() => refreshWhenVesselTypeChanges()).observe(routerStatus, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (routerBadge) {
    new MutationObserver(() => refreshWhenVesselTypeChanges()).observe(routerBadge, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (vesselDwt) {
    vesselDwt.addEventListener('input', () => refreshWhenVesselTypeChanges());
    vesselDwt.addEventListener('change', () => refreshWhenVesselTypeChanges());
  }

  window.addEventListener('CALCULATION_EVENT', () => refreshWhenVesselTypeChanges());
  window.addEventListener('VESSEL_PRICING_ROUTER_UPDATED', () => refreshWhenVesselTypeChanges(true));
  window.addEventListener('seacharter:dwt-pricing-router-updated', () => refreshWhenVesselTypeChanges(true));
  window.refreshBalticSpotReference = () => hydration?.refresh({ force: true });
  window.refreshBalticSpotReferenceFromRouter = () => refreshWhenVesselTypeChanges(true);
  window.renderTceSpotBalticReference = () => renderTceSpot(latestSnapshot);
  lastObservedVesselType = '';

  if (!hydration) {
    renderSnapshot(null);
    return;
  }

  hydration.subscribe(state => renderSnapshot(state.snapshot));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBalticSpotReference, { once: true });
} else {
  initializeBalticSpotReference();
}
