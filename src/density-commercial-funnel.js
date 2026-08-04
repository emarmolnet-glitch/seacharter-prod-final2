import { useCommercialFilter } from './commercial-filter.js';

(function initializeDensityCommercialFunnel(globalScope) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readName(vessel) {
    return String(vessel?.vesselName || vessel?.vessel_name || vessel?.name || vessel?.ShipName || 'Buque sin nombre').trim();
  }

  function readIdentity(vessel) {
    return {
      imo: String(vessel?.imo || vessel?.IMO || vessel?.imo_number || '').replace(/\D/g, ''),
      mmsi: String(vessel?.mmsi || vessel?.MMSI || '').replace(/\D/g, ''),
      name: readName(vessel),
      latitude: Number(vessel?.latitude ?? vessel?.lat),
      longitude: Number(vessel?.longitude ?? vessel?.lon ?? vessel?.lng),
    };
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 });
  }

  function renderCommercialMatches(state = globalScope.commercialDensityMatchState || {}) {
    const panel = globalScope.document?.getElementById('density-commercial-matches-panel');
    const list = globalScope.document?.getElementById('density-commercial-matches-list');
    const summary = globalScope.document?.getElementById('density-commercial-matches-summary');
    if (!panel || !list || !summary) return [];
    const matches = Array.isArray(state.topMatches) ? state.topMatches : [];
    panel.classList.remove('hidden');
    if (state.requiresCargo) {
      summary.textContent = 'Define la cantidad de carga para activar el ranking.';
      list.innerHTML = '<div class="density-commercial-empty"><strong>Falta la carga objetivo</strong><span>El embudo usa DWT mínimo del 105% y ordena por Delta DWT.</span></div>';
      return [];
    }
    summary.textContent = `${formatNumber(state.sourceCount)} señales → ${formatNumber(state.viableCount)} candidatos viables`;
    if (!matches.length) {
      list.innerHTML = '<div class="density-commercial-empty"><strong>Sin matches viables</strong><span>No hay General Cargo o Bulk Carrier con capacidad y estado compatibles.</span></div>';
      return [];
    }
    list.innerHTML = matches.map((vessel, index) => {
      const identity = readIdentity(vessel);
      const encodedIdentity = encodeURIComponent(JSON.stringify(identity));
      const distance = Number(vessel?.commercialMatch?.distanceToPolNm);
      const delta = Number(vessel?.commercialMatch?.deltaDwt) || 0;
      const status = vessel?.commercialMatch?.atAnchor
        ? 'At Anchor'
        : vessel?.commercialMatch?.underwayToPol
          ? 'Rumbo compatible con POL'
          : (vessel?.navigationStatus || 'Estado AIS no confirmado');
      return `
        <article class="density-commercial-card" data-vessel-recommendation="true" data-density-commercial-match="true" data-commercial-rank="${index + 1}">
          <button type="button" class="density-commercial-card__button" data-due-diligence-button data-due-diligence-mode="external-search" data-external-search="true" data-due-diligence-payload="${encodedIdentity}" aria-label="Auditar ${escapeHtml(readName(vessel))} mediante Due Diligence">
            <span class="density-commercial-card__rank">0${index + 1}</span>
            <span class="density-commercial-card__body">
              <span class="density-commercial-card__name">${escapeHtml(readName(vessel))}</span>
              <span class="density-commercial-card__status">${escapeHtml(status)}</span>
              <span class="density-commercial-card__metrics">
                <strong>${formatNumber(vessel.dwt)} DWT</strong>
                <span>Δ ${formatNumber(delta)} MT</span>
                <span>${Number.isFinite(distance) ? `${distance.toFixed(0)} NM a POL` : 'Distancia N/D'}</span>
              </span>
            </span>
            <span class="density-commercial-card__action"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span>
          </button>
          <p data-due-diligence-status class="density-commercial-card__feedback" aria-live="polite"></p>
        </article>`;
    }).join('');
    return matches;
  }

  function refreshCommercialFunnel({ refreshMap = true } = {}) {
    const vessels = typeof globalScope.getDensityMapSourceVessels === 'function'
      ? globalScope.getDensityMapSourceVessels()
      : [];
    renderCommercialMatches(globalScope.commercialDensityMatchState);
    if (refreshMap && globalScope.GlobalFleetGlobe?.getInstance?.('density')) {
      globalScope.GlobalFleetGlobe.updateVessels(vessels, 'density');
    }
    return globalScope.commercialDensityMatchState || { filteredVessels: vessels, topMatches: vessels.slice(0, 5) };
  }

  function scheduleRefresh() {
    globalScope.clearTimeout(globalScope.densityCommercialRefreshTimer);
    globalScope.densityCommercialRefreshTimer = globalScope.setTimeout(() => refreshCommercialFunnel(), 120);
  }

  function initialize() {
    renderCommercialMatches(globalScope.commercialDensityMatchState);
    globalScope.document?.getElementById('cargo-qty')?.addEventListener('input', scheduleRefresh);
    globalScope.document?.getElementById('port-pol')?.addEventListener('change', scheduleRefresh);
    globalScope.document?.getElementById('density-due-diligence-close')?.addEventListener('click', () => {
      const panel = globalScope.document.getElementById('density-due-diligence-panel');
      panel?.classList.add('hidden');
      panel?.setAttribute('aria-hidden', 'true');
    });
  }

  globalScope.useCommercialFilter = useCommercialFilter;
  globalScope.renderDensityCommercialMatches = renderCommercialMatches;
  globalScope.refreshDensityCommercialFunnel = refreshCommercialFunnel;
  globalScope.addEventListener('density:commercial-matches-updated', event => renderCommercialMatches(event?.detail));
  globalScope.addEventListener('openships:snapshot-updated', scheduleRefresh);
  if (globalScope.document?.readyState === 'loading') {
    globalScope.document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(window);

