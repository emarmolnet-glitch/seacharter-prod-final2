import { useCommercialFilter } from './commercial-filter.js';

(function initializeDensityCommercialFunnel(globalScope) {
  'use strict';

  function syncCommercialToggle() {
    const active = globalScope.GlobalStore?.isGlobalDebugActive === true;
    globalScope.document?.querySelectorAll('[data-commercial-filter-toggle]').forEach(toggle => {
      toggle.classList.toggle('is-active', active);
      toggle.setAttribute('aria-checked', String(active));
      const status = toggle.querySelector('[data-commercial-filter-status]');
      if (status) status.textContent = `DEBUG DWT · ${active ? 'ON' : 'OFF'}`;
    });
  }

  function refreshCommercialFunnel({ refreshMap = true } = {}) {
    if (typeof globalScope.getDensityMapSourceVessels === 'function') {
      globalScope.getDensityMapSourceVessels();
    }
    const displayVessels = typeof globalScope.syncDensityDisplayConsumers === 'function'
      ? globalScope.syncDensityDisplayConsumers({ updateGlobe: refreshMap })
      : (globalScope.getDensityDisplayVessels?.() || []);
    return {
      ...(globalScope.GlobalStore?.getCommercialVesselState?.() || {}),
      displayVessels
    };
  }

  function toggleCommercialFilter() {
    const isGlobalDebugActive = globalScope.GlobalStore?.isGlobalDebugActive === true;
    const setIsGlobalDebugActive = globalScope.GlobalStore?.setIsGlobalDebugActive?.bind(globalScope.GlobalStore);
    setIsGlobalDebugActive?.(!isGlobalDebugActive, { source: 'commercial-filter-toggle' });
    syncCommercialToggle();
    refreshCommercialFunnel();
  }

  function syncTargetCargoDwt() {
    const targetCargoDwt = globalScope.resolveGlobalTargetCargoDwt?.() || 0;
    globalScope.GlobalStore?.setTargetCargoDwt?.(targetCargoDwt, { source: 'commercial-cargo-input' });
    return targetCargoDwt;
  }

  function scheduleRefresh() {
    globalScope.clearTimeout(globalScope.densityCommercialRefreshTimer);
    globalScope.densityCommercialRefreshTimer = globalScope.setTimeout(() => {
      syncTargetCargoDwt();
      refreshCommercialFunnel();
    }, 120);
  }

  function initialize() {
    syncCommercialToggle();
    globalScope.document?.querySelectorAll('[data-commercial-filter-toggle]').forEach(toggle => {
      toggle.addEventListener('click', toggleCommercialFilter);
    });
    globalScope.document?.getElementById('cargo-qty')?.addEventListener('input', scheduleRefresh);
    globalScope.document?.getElementById('port-pol')?.addEventListener('change', scheduleRefresh);
    globalScope.document?.getElementById('density-due-diligence-close')?.addEventListener('click', () => {
      const panel = globalScope.document.getElementById('density-due-diligence-panel');
      panel?.classList.add('hidden');
      panel?.setAttribute('aria-hidden', 'true');
    });
  }

  globalScope.useCommercialFilter = useCommercialFilter;
  globalScope.refreshDensityCommercialFunnel = refreshCommercialFunnel;
  globalScope.toggleDensityCommercialFilter = toggleCommercialFilter;
  globalScope.addEventListener('commercial-vessel-state-updated', syncCommercialToggle);
  globalScope.addEventListener('openships:snapshot-updated', scheduleRefresh);
  if (globalScope.document?.readyState === 'loading') {
    globalScope.document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(window);
