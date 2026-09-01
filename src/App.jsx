import React, { useEffect } from 'react';

/**
 * Global BroadcastChannel synchronization hook for SeaCharter Core PRO.
 * Listens for PING_SESSION events from Data Bridge or other tabs/windows
 * and responds with the active voyage/contract session reference.
 */
export function useSeaCharterSync() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') {
      return;
    }

    const channel = new BroadcastChannel('seacharter_sync_channel');
    console.log('[Core PRO] Canal de sincronización abierto');

    channel.onmessage = (event) => {
      const data = event?.data;
      if (data?.type === 'PING_SESSION' || data === 'PING_SESSION') {
        const currentSessionRef =
          window.ContractRefManager?.getActiveContractRef?.() ||
          window.ContractReference?.getActiveContractRef?.() ||
          window.getActiveContractRef?.() ||
          (typeof window.sessionStorage !== 'undefined' ? window.sessionStorage.getItem('active_contract_ref') : null) ||
          '';

        console.log('[Core PRO] PING recibido, respondiendo con:', currentSessionRef);
        channel.postMessage({
          type: 'CORE_SESSION_ACTIVE',
          reference: currentSessionRef,
        });
      }
    };

    return () => {
      channel.close();
    };
  }, []);
}

/**
 * Main Application / Layout wrapper component for SeaCharter Core PRO.
 */
export default function App({ children }) {
  useSeaCharterSync();

  return (
    <div className="seacharter-core-pro-app">
      {children}
    </div>
  );
}
