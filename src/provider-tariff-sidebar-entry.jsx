/**
 * provider-tariff-sidebar-entry.jsx
 * Punto de entrada autónomo e independiente para montar el Right Sidebar / Drawer retráctil
 * de Tarifas Multi-proveedor FOB y Bejaia en SeaCharter Core PRO.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import ProviderTariffSidebar from './components/ProviderTariffSidebar.jsx';

let providerTariffRoot = null;

export function mountProviderTariffSidebar(container) {
  let mountPoint = container?.querySelector?.('#provider-tariff-drawer-root')
    || document.getElementById('provider-tariff-drawer-root');

  if (!mountPoint) {
    const forwardersContainer = document.getElementById('view-forwarders');
    mountPoint = document.createElement('div');
    mountPoint.id = 'provider-tariff-drawer-root';
    if (forwardersContainer) {
      forwardersContainer.appendChild(mountPoint);
    } else {
      document.body.appendChild(mountPoint);
    }
  }

  if (!providerTariffRoot) {
    providerTariffRoot = createRoot(mountPoint);
  }
  providerTariffRoot.render(<ProviderTariffSidebar />);
  return providerTariffRoot;
}

if (typeof window !== 'undefined') {
  window.mountProviderTariffSidebar = mountProviderTariffSidebar;
}

// Auto-inicialización segura una vez el DOM esté listo
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountProviderTariffSidebar();
    });
  } else {
    mountProviderTariffSidebar();
  }
}
