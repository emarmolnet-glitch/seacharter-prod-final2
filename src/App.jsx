import React, { useEffect, useRef, useState } from 'react';
import { HashRouter, HashRouter as BrowserRouter } from 'react-router-dom';
import { ForwarderWorkspace } from './components/ForwarderWorkspace.jsx';
import { getApiUrl } from './utils/apiConfig.js';

/**
 * Normalizes reference identifiers for cross-module session matching.
 */
export function normalizeSessionRef(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * Extracts active contract reference from window/storage state.
 */
export function getActiveSessionReference() {
  if (typeof window === 'undefined') return '';
  return normalizeSessionRef(
    window.ContractRefManager?.getActiveContractRef?.() ||
    window.ContractReference?.getActiveContractRef?.() ||
    window.getActiveContractRef?.() ||
    (typeof window.sessionStorage !== 'undefined' ? window.sessionStorage.getItem('active_contract_ref') : null) ||
    (typeof window.localStorage !== 'undefined' ? window.localStorage.getItem('active_contract_ref') : null) ||
    ''
  );
}

/**
 * Checks if target reference matches the active session.
 */
export function matchesActiveSession(targetRef) {
  const currentRef = getActiveSessionReference();
  const normalizedTarget = normalizeSessionRef(targetRef);
  if (!normalizedTarget) return true; // No target restriction means current session
  if (!currentRef) return true;
  return normalizedTarget === currentRef;
}

/**
 * Extracts IMO and optional target reference from heterogeneous payloads.
 */
export function extractImoAndReference(data) {
  if (!data) return null;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (/^\d{7}$/.test(trimmed)) {
      return { imo: trimmed, reference: '' };
    }
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractImoAndReference(parsed);
      } catch (_) {}
    }
    return null;
  }

  if (typeof data !== 'object') return null;

  const targetRef = normalizeSessionRef(
    data.reference ||
    data.target_session_id ||
    data.targetSessionId ||
    data.target_session ||
    data.contractRef ||
    data.contract_ref ||
    data.session_id ||
    data.sessionId ||
    data.ref ||
    data.payload?.reference ||
    data.payload?.target_session_id ||
    ''
  );

  const imoCandidate = String(
    data.imo ||
    data.imo_number ||
    data.imoNumber ||
    data.pending_imo ||
    data.core_pro_pending_imo ||
    data.value ||
    data.vessel?.imo ||
    data.vessel?.imo_number ||
    data.payload?.imo ||
    data.payload?.vessel?.imo ||
    ''
  ).trim();

  if (imoCandidate && /^\d{7}$/.test(imoCandidate)) {
    return { imo: imoCandidate, reference: targetRef };
  }

  if (data.value && typeof data.value === 'object') {
    return extractImoAndReference(data.value);
  }
  if (typeof data.value === 'string' && data.value.trim().startsWith('{')) {
    try {
      return extractImoAndReference(JSON.parse(data.value));
    } catch (_) {}
  }

  return null;
}

/**
 * Reusable IMO hydration engine: updates React state, VoyageStore, GlobalStore and triggers fetchVesselByImo/fetchVesselSpecs.
 */
export function executeImoHydration(imoValue) {
  const cleanImo = String(imoValue || '').trim();
  if (!cleanImo || !/^\d{7}$/.test(cleanImo)) return false;

  const referenceManager = typeof window !== 'undefined'
    ? (window.ContractReference || window.ContractRefManager)
    : null;

  referenceManager?.setInjectionLock?.(true);

  try {
    // 1. Actualización nativa de estado en el input de Section 2 si existe
    const imoInput = typeof document !== 'undefined'
      ? (document.getElementById?.('vessel-identity-imo') ||
         document.getElementById?.('imo') ||
         (typeof document.querySelector === 'function' ? (document.querySelector('input[name="imo"]') || document.querySelector('input[name="imo_number"]') || document.querySelector('input[name="vessel_imo"]')) : null))
      : null;

    if (imoInput) {
      imoInput.value = cleanImo;
    }

    const altImoInput = typeof document !== 'undefined' && document.getElementById?.('imo') && document.getElementById?.('imo') !== imoInput
      ? document.getElementById?.('imo')
      : null;
    if (altImoInput) {
      altImoInput.value = cleanImo;
    }

    if (typeof window !== 'undefined' && typeof window.handleManualVesselUpdate === 'function') {
      window.handleManualVesselUpdate('imo', cleanImo);
    }

    const vesselData = { imo: cleanImo, imo_number: cleanImo, imoNumber: cleanImo };

    // 2. Sincronización en Contexto Global / Zustand / VoyageStore
    if (typeof window !== 'undefined' && typeof window.patchSection2Vessel === 'function') {
      window.patchSection2Vessel(vesselData);
    }

    if (typeof window !== 'undefined') {
      try {
        const vStore = window.VoyageStore?.getState?.() || window.useVoyageStore?.getState?.();
        vStore?.patchSection2Vessel?.(vesselData);
      } catch (_) {}
      if (window.GlobalStore) {
        window.GlobalStore.activeVessel = { ...(window.GlobalStore.activeVessel || {}), ...vesselData };
        window.GlobalStore.calculatorVessel = { ...(window.GlobalStore.calculatorVessel || {}), ...vesselData };
      }
    }

    // 3. Ejecutar la función o abrir el VesselDetailDrawer para revisión del fletador
    if (typeof window !== 'undefined') {
      if (typeof window.openVesselDetailDrawer === 'function') {
        // Consultar ficha y abrir drawer para revisión intermedia
        void fetch(getApiUrl(`/api/vessel/${encodeURIComponent(cleanImo)}`))
          .then((res) => res.json())
          .then((payload) => {
            if (payload?.success && payload.vessel) {
              window.openVesselDetailDrawer(payload.vessel, 'Data Bridge (Neon DB)');
            } else {
              window.openVesselDetailDrawer({ imo: cleanImo, imo_number: cleanImo }, 'Data Bridge (Broadcast)');
            }
          })
          .catch(() => {
            window.openVesselDetailDrawer({ imo: cleanImo, imo_number: cleanImo }, 'Data Bridge (Broadcast)');
          });
      } else {
        const fetchFn = (window.fetchVesselSpecs || window.fetchVesselByImo);
        if (typeof fetchFn === 'function') {
          void fetchFn(cleanImo);
        } else if (typeof fetch === 'function') {
          void fetch(getApiUrl(`/api/vessel/${encodeURIComponent(cleanImo)}`))
            .then((res) => res.json())
            .then((payload) => {
              if (payload?.success && payload.vessel) {
                const fullVessel = payload.vessel;
                try {
                  const vStore = window.VoyageStore?.getState?.() || window.useVoyageStore?.getState?.();
                  vStore?.patchSection2Vessel?.(fullVessel);
                } catch (_) {}
                if (window.GlobalStore) {
                  window.GlobalStore.activeVessel = { ...(window.GlobalStore.activeVessel || {}), ...fullVessel };
                  window.GlobalStore.calculatorVessel = { ...(window.GlobalStore.calculatorVessel || {}), ...fullVessel };
                }
                if (typeof window.applyDataBridgeHydrationToCalculator === 'function') {
                  window.applyDataBridgeHydrationToCalculator(fullVessel, { imo: cleanImo, imo_number: cleanImo });
                }
              }
            })
            .catch(() => {});
        }
      }
    }

    return true;
  } finally {
    if (referenceManager?.setInjectionLock) {
      setTimeout(() => referenceManager.setInjectionLock?.(false), 250);
    }
  }
}

/**
 * Global BroadcastChannel synchronization hook for SeaCharter Core PRO.
 * Listens for PING_SESSION events from Data Bridge or other tabs/windows
 * and responds with the active voyage/contract session reference.
 */
export function useSeaCharterSync() {
  const lastPersistedRef = useRef('');
  const isSavingRef = useRef(false);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') {
      return;
    }

    const channel = new BroadcastChannel('seacharter_sync_channel');
    console.log('[Core PRO] Canal de sincronización abierto');

    const persistActiveSessionToBackend = (ref, immediate = false) => {
      const normalized = String(ref || '').trim().toUpperCase();
      if (!normalized || typeof fetch !== 'function') return;

      // Only trigger if reference actually changed
      if (normalized === lastPersistedRef.current) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const executeSave = () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;

        if (typeof window.ContractRefManager?.persistSessionToDatabase === 'function') {
          window.ContractRefManager.persistSessionToDatabase(normalized, null, true)
            .then((data) => {
              if (data) {
                lastPersistedRef.current = normalized;
              }
            })
            .catch(() => {})
            .finally(() => { isSavingRef.current = false; });
        } else {
          fetch(getApiUrl('/api/app-state'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              id: 'current_session',
              key: 'current_session',
              session_ref: normalized,
              currentSessionRef: normalized,
              reference: normalized,
              timestamp: Date.now(),
            }),
          })
            .then((res) => {
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
              }
              return res.json();
            })
            .then((data) => {
              lastPersistedRef.current = normalized;
              console.log('[Core PRO] Sesión activa guardada en Neon:', normalized);
            })
            .catch((err) => {
              console.warn('[Core PRO] No se pudo persistir la sesión activa en backend:', err?.message || err);
            })
            .finally(() => { isSavingRef.current = false; });
        }
      };

      if (immediate) {
        executeSave();
      } else {
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          executeSave();
        }, 500);
      }
    };

    // 2. DETENER ESCRITURA AUTOMÁTICA EN NEON (GUARDADO PREMATURO):
    // La aplicación SOLO debe hacer el POST/UPSERT a Neon cuando el usuario pulse explícitamente
    // el botón de "Calcular ruta" o "Guardar", no por el simple hecho de generar un ID aleatorio o montar el componente.
    channel.onmessage = (event) => {
      const data = event?.data;
      if (data?.type === 'PING_SESSION' || data === 'PING_SESSION') {
        const currentSessionRef = getActiveSessionReference();

        console.log('[Core PRO] PING recibido, respondiendo con:', currentSessionRef);
        channel.postMessage({
          type: 'CORE_SESSION_ACTIVE',
          reference: currentSessionRef,
        });
      }
    };

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      channel.close();
    };
  }, []);
}

/**
 * Hook for URL IMO parameter injection and automatic database vessel lookup.
 */
export function useUrlImoAutoLookup() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location?.search) return;

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const imoValue = searchParams.get('imo')?.trim() || '';

      if (imoValue && /^\d{7}$/.test(imoValue)) {
        // 2. INYECCIÓN DE ESTADO: Inyectar inmediatamente en Section 2
        const imoInput = document.getElementById('vessel-identity-imo');
        if (imoInput) {
          imoInput.value = imoValue;
        }

        if (typeof window.handleManualVesselUpdate === 'function') {
          window.handleManualVesselUpdate('imo', imoValue);
        }

        if (typeof window.patchSection2Vessel === 'function') {
          window.patchSection2Vessel({ imo: imoValue });
        }

        // 3. AUTO-DISPARO DE BÚSQUEDA: Ejecutar consulta existente en base de datos
        if (typeof window.fetchVesselByImo === 'function') {
          void window.fetchVesselByImo(imoValue);
        }

        // 4. LIMPIEZA DE URL: Limpiar parámetro imo para evitar repetición al recargar
        if (window.history?.replaceState && window.location?.href) {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('imo');
          const nextSearch = cleanUrl.searchParams.toString();
          const nextUrl = `${cleanUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${cleanUrl.hash}`;
          window.history.replaceState(window.history.state, '', nextUrl);
        }
      }
    } catch (_) {}
  }, []);
}

/**
 * Hook for background IMO injection via BroadcastChannels ('core_pro_channel', 'seacharter_sync_channel'),
 * localStorage ('core_pro_pending_imo'), and Neon DB polling.
 */
export function usePendingImoSync() {
  const processedKeysRef = useRef(new Set());
  const isPollingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Helper to discard and clean up pending IMO from storage and Neon
    const cleanupPendingImo = () => {
      try {
        if (typeof window.localStorage !== 'undefined') {
          window.localStorage.removeItem('core_pro_pending_imo');
          window.localStorage.removeItem('selected_imo');
          window.localStorage.removeItem('pending_imo');
          window.localStorage.removeItem('seacharter_pending_imo');
        }
      } catch (_) {}

      if (typeof fetch === 'function') {
        fetch(getApiUrl('/api/app-state?key=core_pro_pending_imo'), {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        }).catch(() => {});

        fetch(getApiUrl('/api/app-state?key=selected_imo'), {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        }).catch(() => {});

        fetch(getApiUrl('/api/app-state'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ key: 'core_pro_pending_imo' }),
        }).catch(() => {});
      }
    };

    // Helper to process candidate message / item
    const processCandidate = (candidate, sourceKey = '') => {
      const extracted = extractImoAndReference(candidate);
      if (!extracted || !extracted.imo) return false;

      if (!matchesActiveSession(extracted.reference)) {
        return false;
      }

      const currentActiveRef = getActiveSessionReference();
      const dedupKey = `${currentActiveRef || 'ALL'}:${extracted.imo}:${sourceKey}`;

      if (processedKeysRef.current.has(dedupKey)) {
        return false;
      }

      processedKeysRef.current.add(dedupKey);

      // Inyectar en Sección 2 y disparar búsqueda en base de datos
      const hydrated = executeImoHydration(extracted.imo);
      if (hydrated) {
        cleanupPendingImo();
      }
      return hydrated;
    };

    // 1. Initial check from localStorage
    try {
      const storedImo = window.localStorage?.getItem('core_pro_pending_imo') ||
                        window.localStorage?.getItem('pending_imo') ||
                        window.localStorage?.getItem('seacharter_pending_imo');
      if (storedImo) {
        processCandidate(storedImo, 'localStorage:init');
      }
    } catch (_) {}

    // 2. Storage event listener for cross-tab localStorage changes
    const handleStorage = (event) => {
      if (!event) return;
      if (event.key === 'core_pro_pending_imo' || event.key === 'pending_imo' || event.key === 'seacharter_pending_imo') {
        if (event.newValue) {
          processCandidate(event.newValue, `storage:${event.key}`);
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    // 3. BroadcastChannels listeners ('cross_app_sync', 'core_pro_channel', 'seacharter_sync_channel')
    let crossAppChannel = null;
    let coreProChannel = null;
    let seacharterSyncChannel = null;

    if (typeof window.BroadcastChannel === 'function') {
      try {
        crossAppChannel = new window.BroadcastChannel('cross_app_sync');
        crossAppChannel.onmessage = (event) => {
          const data = event?.data;
          if (data && (data.type === 'LOAD_IMO' || data.imo || data.selected_imo)) {
            processCandidate(data, 'bc:cross_app_sync');
          }
        };
      } catch (_) {}

      try {
        coreProChannel = new window.BroadcastChannel('core_pro_channel');
        coreProChannel.onmessage = (event) => {
          const data = event?.data;
          if (data) {
            processCandidate(data, 'bc:core_pro_channel');
          }
        };
      } catch (_) {}

      try {
        seacharterSyncChannel = new window.BroadcastChannel('seacharter_sync_channel');
        seacharterSyncChannel.onmessage = (event) => {
          const data = event?.data;
          if (data) {
            processCandidate(data, 'bc:seacharter_sync_channel');
          }
        };
      } catch (_) {}
    }

    // 4. Polling to Neon DB for 'core_pro_pending_imo' / 'selected_imo'
    const pollNeonPendingImo = async () => {
      if (isPollingRef.current || typeof fetch !== 'function') return;
      isPollingRef.current = true;
      try {
        const res = await fetch(getApiUrl('/api/app-state?key=core_pro_pending_imo'), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          console.log('[Core PRO] Polling check, IMO recibido:', data);
          if (data?.success && (data.value || data.imo || data.selected_imo || data.pending_imo)) {
            processCandidate(data, 'neon:poll');
          }
        }
      } catch (pollErr) {
        console.warn('[Core PRO] Error en polling de estado:', pollErr);
      } finally {
        isPollingRef.current = false;
      }
    };

    // Run immediate check and periodic interval
    void pollNeonPendingImo();
    const pollInterval = setInterval(pollNeonPendingImo, 3000);

    return () => {
      window.removeEventListener('storage', handleStorage);
      crossAppChannel?.close();
      coreProChannel?.close();
      seacharterSyncChannel?.close();
      clearInterval(pollInterval);
    };
  }, []);
}

/**
 * Storage key for persistent header visibility preference.
 */
export const HEADER_STORAGE_KEY = 'seacharter_header_visible';

/**
 * Returns stored header visibility preference or true by default.
 */
export function getStoredHeaderVisibility(defaultVisible = true) {
  if (typeof window === 'undefined') return defaultVisible;
  try {
    const stored = window.localStorage?.getItem(HEADER_STORAGE_KEY);
    if (stored !== null && stored !== undefined) {
      return stored === 'true';
    }
  } catch (_) {}
  return defaultVisible;
}

/**
 * Persists header visibility preference to localStorage and emits an event.
 */
export function setStoredHeaderVisibility(visible) {
  const boolVal = Boolean(visible);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(HEADER_STORAGE_KEY, String(boolVal));
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('header:visibility-change', {
        detail: { isHeaderVisible: boolVal, visible: boolVal }
      }));
    } catch (_) {}
  }
  return boolVal;
}

/**
 * Global Header Visibility management hook for SeaCharter Core PRO.
 * Keeps state in sync with localStorage, DOM layout, and window resize events.
 */
export function useHeaderVisibility(defaultVisible = true) {
  const [isHeaderVisible, setIsHeaderVisible] = useState(() => getStoredHeaderVisibility(defaultVisible));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Apply visibility class and ARIA states to DOM elements
    const syncDom = (visible) => {
      if (typeof document !== 'undefined') {
        if (document.body) {
          document.body.classList.toggle('header-collapsed', !visible);
          document.body.dataset.headerVisible = String(visible);
        }
        const appHeader = document.querySelector('header.app-header');
        if (appHeader) {
          appHeader.classList.toggle('header-collapsed', !visible);
          appHeader.setAttribute('aria-hidden', String(!visible));
        }
        const collapseBtn = document.getElementById('btn-collapse-header');
        if (collapseBtn) {
          collapseBtn.setAttribute('aria-expanded', String(visible));
        }
        const expandBtn = document.getElementById('btn-expand-header');
        if (expandBtn) {
          expandBtn.setAttribute('aria-expanded', String(visible));
        }
      }
      window.dispatchEvent(new Event('resize'));
    };

    syncDom(isHeaderVisible);

    const handleVisibilityEvent = (event) => {
      const nextVal = event?.detail?.isHeaderVisible ?? event?.detail?.visible;
      if (typeof nextVal === 'boolean') {
        setIsHeaderVisible(nextVal);
      }
    };

    const handleToggleEvent = () => {
      setIsHeaderVisible((prev) => {
        const next = !prev;
        setStoredHeaderVisibility(next);
        return next;
      });
    };

    window.addEventListener('header:visibility-change', handleVisibilityEvent);
    window.addEventListener('header:toggle', handleToggleEvent);

    window.isHeaderVisible = isHeaderVisible;
    window.setHeaderVisibility = (val) => {
      const next = Boolean(val);
      setStoredHeaderVisibility(next);
      setIsHeaderVisible(next);
    };
    window.toggleHeaderVisibility = () => {
      setIsHeaderVisible((prev) => {
        const next = !prev;
        setStoredHeaderVisibility(next);
        return next;
      });
    };

    return () => {
      window.removeEventListener('header:visibility-change', handleVisibilityEvent);
      window.removeEventListener('header:toggle', handleToggleEvent);
    };
  }, [isHeaderVisible]);

  const toggleHeader = () => {
    const next = !isHeaderVisible;
    setStoredHeaderVisibility(next);
    setIsHeaderVisible(next);
  };

  return { isHeaderVisible, setIsHeaderVisible, toggleHeader };
}

import { ProjectProvider, ProjectContext, useProject, useProjectRef, generateRandomProjectRef } from './context/ProjectContext.jsx';

export function AppLayout({ children }) {
  const [currentView, setCurrentView] = useState(() => (typeof window !== 'undefined' ? window.currentView || '' : ''));

  useSeaCharterSync();
  useUrlImoAutoLookup();
  usePendingImoSync();

  useEffect(() => {
    const handleViewChange = (event) => {
      const nextView = event?.detail?.view || window.currentView || '';
      setCurrentView(nextView);
    };
    window.addEventListener('navigation:view-change', handleViewChange);
    return () => window.removeEventListener('navigation:view-change', handleViewChange);
  }, []);

  return currentView === 'FORWARDERS' ? (
    <ForwarderWorkspace />
  ) : (
    children
  );
}

export default function App(props) {
  return (
    <HashRouter>
      <ProjectProvider>
        <AppLayout {...props} />
      </ProjectProvider>
    </HashRouter>
  );
}

/**
 * Top Navigation Bar (TopNav) component displaying corporate branding,
 * vessel search input, and the active project reference input.
 */
export function TopNav() {
  const { activeProjectRef, setActiveProjectRef } = useProject();

  const handleRefChange = (e) => {
    setActiveProjectRef(e.target.value);
  };

  return (
    <header
      className="app-header bg-white border-b border-slate-200 px-4 py-2 md:px-6 flex items-center justify-between shadow-md shrink-0 no-print z-50"
      role="banner"
      aria-label="Cabecera principal de navegación"
    >
      {/* IZQUIERDA: LOGO CORPORATIVO */}
      <div className="header-left flex items-center gap-3 shrink-0">
        <div className="bg-blue-600 p-2 rounded-lg text-white shadow-md flex items-center justify-center w-8 h-8">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
            <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
            <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
            <path d="M12 10v4"/>
            <path d="M12 2v3"/>
          </svg>
        </div>
        <div>
          <h1 className="text-xs md:text-sm font-bold text-slate-900 tracking-tight flex items-center whitespace-nowrap">
            <span>SeaCharter Core PRO</span>
            <span className="text-[9px] md:text-[10px] bg-blue-500/10 text-blue-700 px-1.5 py-0.5 rounded border border-blue-500/20 ml-1.5 md:ml-2 font-mono font-bold tracking-wider">RODAHMAR ENGINE</span>
          </h1>
        </div>
      </div>

      {/* CENTRO: STATUS BRIDGE, BUSCADOR IMO, VOYAGE REF */}
      <div className="header-center flex items-center gap-2 md:gap-3 flex-1 justify-center max-w-3xl mx-2 md:mx-4">
        <div id="connection-status-root" className="shrink-0"></div>

        {/* BUSCADOR DIRECTO DE BUQUES */}
        <div id="header-vessel-search-container" className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs shadow-2xs flex-1 min-w-[160px] focus-within:ring-2 focus-within:ring-sky-500 focus-within:border-sky-500 transition-all">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            id="header-vessel-search-input"
            className="bg-transparent font-sans text-xs font-semibold text-slate-800 focus:outline-none w-full placeholder:text-slate-400"
            placeholder="Buscar buque por nombre o IMO..."
            aria-label="Buscar buque en base de datos"
          />
        </div>

        {/* SELECTOR REFERENCIA DE VIAJE / EXPEDIENTE ACTIVO */}
        <div id="header-voyage-ref-container" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50/90 border border-blue-300 text-blue-900 text-xs font-mono shadow-xs shrink-0 transition-all hover:border-blue-400" title="Expediente Activo (project_ref)">
          <i className="fa-solid fa-folder-closed text-xs text-blue-600"></i>
          <span className="text-blue-800 font-sans text-[10px] uppercase font-black tracking-wider bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">Expediente:</span>
          <input
            type="text"
            id="quick-ref"
            value={activeProjectRef || ''}
            onChange={handleRefChange}
            className="bg-transparent font-mono text-xs font-bold text-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 w-28 sm:w-36 transition-all uppercase placeholder-blue-300"
            placeholder="RDM/2026-..."
            title="Referencia Única del Expediente (project_ref)"
          />
        </div>
      </div>
    </header>
  );
}

export { HashRouter, HashRouter as BrowserRouter };
export { ProjectProvider, ProjectContext, useProject, useProjectRef, generateRandomProjectRef };
export { default as VoyageExecutiveReportModal, buildVoyageStowagePlan } from './components/VoyageExecutiveReportModal.jsx';

