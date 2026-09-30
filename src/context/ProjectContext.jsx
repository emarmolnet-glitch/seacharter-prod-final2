import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const ProjectContext = createContext({
  activeProjectRef: '',
  setActiveProjectRef: () => {},
  generateNewProjectRef: () => '',
  resetProjectRef: () => {},
});

function getInitialProjectRef() {
  if (typeof window === 'undefined') return '';
  try {
    // 1. Check URL parameters (?ref=... or ?project_ref=...)
    const params = new URLSearchParams(window.location.search || '');
    const urlRef = (params.get('ref') || params.get('project_ref') || params.get('contract_ref') || '').trim();
    if (urlRef) return urlRef;
  } catch (_) {}

  try {
    // 2. Check window globals
    if (window.activeProjectRef && typeof window.activeProjectRef === 'string') {
      return window.activeProjectRef.trim();
    }
    const mgrRef = window.ContractRefManager?.getActiveContractRef?.() ||
                   window.ContractReference?.getActiveContractRef?.() ||
                   (typeof window.getActiveContractRef === 'function' ? window.getActiveContractRef() : null) ||
                   (typeof window.getActiveProjectRef === 'function' ? window.getActiveProjectRef() : null);
    if (mgrRef && typeof mgrRef === 'string' && mgrRef.trim() && mgrRef.trim() !== '—' && mgrRef.trim() !== '-') {
      return mgrRef.trim();
    }
  } catch (_) {}

  try {
    // 3. Check session/local storage
    const sRef = window.sessionStorage?.getItem('active_project_ref') || window.sessionStorage?.getItem('active_contract_ref');
    if (sRef && sRef.trim() && sRef.trim() !== '—') return sRef.trim();
  } catch (_) {}

  return '';
}

export function ProjectProvider({ children, initialRef = '' }) {
  const [activeProjectRef, setActiveProjectRefState] = useState(() => initialRef || getInitialProjectRef());

  const generateNewProjectRef = useCallback(() => {
    const year = new Date().getFullYear();
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `RDM/${year}-${suffix}`;
  }, []);

  const setActiveProjectRef = useCallback((newRef) => {
    const cleanRef = String(newRef || '').trim().toUpperCase();
    setActiveProjectRefState(cleanRef);

    if (typeof window !== 'undefined') {
      window.activeProjectRef = cleanRef;
      if (typeof window.sessionStorage !== 'undefined') {
        try {
          if (cleanRef) {
            window.sessionStorage.setItem('active_project_ref', cleanRef);
            window.sessionStorage.setItem('active_contract_ref', cleanRef);
          } else {
            window.sessionStorage.removeItem('active_project_ref');
            window.sessionStorage.removeItem('active_contract_ref');
          }
        } catch (_) {}
      }

      // Sync with ContractRefManager if available
      if (typeof window.setActiveContractRef === 'function') {
        try {
          window.setActiveContractRef(cleanRef);
        } catch (_) {}
      } else if (typeof window.ContractRefManager?.setActiveContractRef === 'function') {
        try {
          window.ContractRefManager.setActiveContractRef(cleanRef);
        } catch (_) {}
      }

      // Sync with SeaCharterStore
      if (window.SeaCharterStore?.set) {
        try {
          window.SeaCharterStore.set({ activeProjectRef: cleanRef }, { silent: true });
        } catch (_) {}
      }
      if (window.State) {
        window.State.activeProjectRef = cleanRef;
      }

      // Sync with DOM header elements
      const quickRefEl = document.getElementById('quick-ref');
      if (quickRefEl && quickRefEl.value !== cleanRef) {
        quickRefEl.value = cleanRef;
      }
      const badgeEl = document.getElementById('header-active-project-badge');
      if (badgeEl) {
        badgeEl.textContent = cleanRef || 'SIN ASIGNAR';
        badgeEl.dataset.projectRef = cleanRef;
      }
      const headerContainer = document.getElementById('header-voyage-ref-container');
      if (headerContainer) {
        headerContainer.dataset.projectRef = cleanRef;
        headerContainer.title = cleanRef ? `Expediente Activo: ${cleanRef}` : 'Referencia Única del Expediente';
      }

      // Sync URL if possible
      try {
        if (window.history?.replaceState && window.location) {
          const url = new URL(window.location.href);
          if (cleanRef) {
            url.searchParams.set('ref', cleanRef);
          } else {
            url.searchParams.delete('ref');
          }
          const nextUrl = `${url.pathname}${url.search}${url.hash}`;
          window.history.replaceState(window.history.state, '', nextUrl);
        }
      } catch (_) {}

      // Dispatch event
      try {
        window.dispatchEvent(new CustomEvent('project-ref:changed', {
          detail: { activeProjectRef: cleanRef, reference: cleanRef }
        }));
      } catch (_) {}
    }
  }, []);

  const resetProjectRef = useCallback(() => {
    setActiveProjectRef('');
  }, [setActiveProjectRef]);

  // Synchronize on mount and listen to events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Expose setter globally
    window.setActiveProjectRef = setActiveProjectRef;
    window.getActiveProjectRef = () => activeProjectRef || window.activeProjectRef || '';

    const handleContractRefChanged = (e) => {
      const ref = e?.detail?.reference || e?.detail?.activeProjectRef;
      if (ref && ref !== activeProjectRef) {
        setActiveProjectRef(ref);
      }
    };

    window.addEventListener('contract-reference:changed', handleContractRefChanged);
    window.addEventListener('project-ref:changed', handleContractRefChanged);

    return () => {
      window.removeEventListener('contract-reference:changed', handleContractRefChanged);
      window.removeEventListener('project-ref:changed', handleContractRefChanged);
    };
  }, [activeProjectRef, setActiveProjectRef]);

  const value = {
    activeProjectRef,
    setActiveProjectRef,
    generateNewProjectRef,
    resetProjectRef,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}

export function useProjectRef() {
  const { activeProjectRef, setActiveProjectRef, generateNewProjectRef, resetProjectRef } = useProject();
  return { activeProjectRef, setActiveProjectRef, generateNewProjectRef, resetProjectRef };
}

export default ProjectContext;
