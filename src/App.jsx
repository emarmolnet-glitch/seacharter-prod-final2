import React, { useEffect, useRef } from 'react';

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

    // 3. Ejecutar la función real que busca los datos y especificaciones en la base de datos
    if (typeof window !== 'undefined') {
      const fetchFn = (window.fetchVesselSpecs || window.fetchVesselByImo);
      if (typeof fetchFn === 'function') {
        void fetchFn(cleanImo);
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
          fetch('/api/app-state', {
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

    const initialRef = getActiveSessionReference();
    if (initialRef) {
      persistActiveSessionToBackend(initialRef);
    }

    channel.onmessage = (event) => {
      const data = event?.data;
      if (data?.type === 'PING_SESSION' || data === 'PING_SESSION') {
        const currentSessionRef = getActiveSessionReference();

        console.log('[Core PRO] PING recibido, respondiendo con:', currentSessionRef);
        channel.postMessage({
          type: 'CORE_SESSION_ACTIVE',
          reference: currentSessionRef,
        });

        if (currentSessionRef && currentSessionRef !== lastPersistedRef.current) {
          persistActiveSessionToBackend(currentSessionRef);
        }
      }
    };

    const handleContractChange = (e) => {
      const nextRef = e?.detail?.reference || e?.detail?.ref;
      if (nextRef) {
        persistActiveSessionToBackend(nextRef);
      }
    };

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('contract-reference:changed', handleContractChange);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('contract-reference:changed', handleContractChange);
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
        fetch('/api/app-state?key=core_pro_pending_imo', {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        }).catch(() => {});

        fetch('/api/app-state?key=selected_imo', {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        }).catch(() => {});

        fetch('/api/app-state', {
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
        const res = await fetch('/api/app-state?key=core_pro_pending_imo', {
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
 * Main Application / Layout wrapper component for SeaCharter Core PRO.
 */
export default function App({ children }) {
  useSeaCharterSync();
  useUrlImoAutoLookup();
  usePendingImoSync();

  return (
    <div className="seacharter-core-pro-app">
      {children}
    </div>
  );
}
