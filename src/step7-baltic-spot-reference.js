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

function getSelectedVesselClass() {
  const vesselType = String(document.getElementById('vessel-badge')?.textContent || '').trim().toLowerCase();
  if (vesselType.includes('cape')) return 'Capesize';
  if (vesselType.includes('panamax') || vesselType.includes('kamsar')) return 'Panamax';
  if (vesselType.includes('supra') || vesselType.includes('ultra')) return 'Supramax';
  if (vesselType.includes('handy')) return 'Handysize';
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
  const vesselClass = getSelectedVesselClass();
  const tceSpot = vesselClass ? snapshot?.tceSpotByClass?.[vesselClass] : null;
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
}

function renderSnapshot(snapshot) {
  latestSnapshot = snapshot || null;
  renderBdi(latestSnapshot);
  renderTceSpot(latestSnapshot);
}

function refreshWhenVesselTypeChanges() {
  const vesselType = String(document.getElementById('vessel-badge')?.textContent || '').trim();
  if (vesselType === lastObservedVesselType) return;
  lastObservedVesselType = vesselType;
  renderTceSpot(latestSnapshot);
}

function initializeBalticSpotReference() {
  const hydration = window.MarketIntelligenceHydration;
  const vesselBadge = document.getElementById('vessel-badge');

  if (vesselBadge) {
    new MutationObserver(refreshWhenVesselTypeChanges).observe(vesselBadge, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  window.addEventListener('CALCULATION_EVENT', refreshWhenVesselTypeChanges);
  window.refreshBalticSpotReference = () => hydration?.refresh({ force: true });
  lastObservedVesselType = String(vesselBadge?.textContent || '').trim();

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
