import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { generateRandomProjectRef } from '../utils/projectRef.js';

export const ProjectContext = createContext({
  activeProjectRef: '',
  setActiveProjectRef: () => {},
  generateNewProjectRef: () => '',
  resetProjectRef: () => {},
});

export { generateRandomProjectRef };

function getInitialProjectRef() {
  if (typeof window === 'undefined') return '';
  try {
    // 1. Check URL parameters (?ref=... or ?project_ref=...) without modifying the URL
    const params = new URLSearchParams(window.location.search || '');
    const urlRef = (params.get('ref') || params.get('project_ref') || params.get('contract_ref') || '').trim();
    if (urlRef) return urlRef;
  } catch (_) {}

  // Si no hay parámetro ?ref= explícito en la URL, IGNORAR la caché guardada y generar inmediatamente una nueva referencia limpia
  return generateRandomProjectRef();
}

export function ProjectProvider({ children, initialRef = '' }) {
  const [activeProjectRef, setActiveProjectRefState] = useState(() => initialRef || getInitialProjectRef());
  const activeRefRef = useRef(activeProjectRef);
  activeRefRef.current = activeProjectRef;

  const isSyncingRef = useRef(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const generateNewProjectRef = useCallback(() => {
    try {
      if (retryCountRef.current >= maxRetries) {
        return '';
      }
      retryCountRef.current += 1;
      return generateRandomProjectRef() || '';
    } catch (_) {
      return '';
    }
  }, []);

  const setActiveProjectRef = useCallback((newRef) => {
    const cleanRef = String(newRef || '').trim().toUpperCase();
    if (activeRefRef.current === cleanRef) {
      return;
    }
    activeRefRef.current = cleanRef;
    setActiveProjectRefState(cleanRef);

    if (typeof window !== 'undefined') {
      window.activeProjectRef = cleanRef;

      try {
        if (cleanRef) {
          window.sessionStorage?.setItem('active_project_ref', cleanRef);
          window.sessionStorage?.setItem('active_contract_ref', cleanRef);
        } else {
          window.sessionStorage?.removeItem('active_project_ref');
          window.sessionStorage?.removeItem('active_contract_ref');
        }
      } catch (_) {}

      if (window.State) {
        window.State.activeProjectRef = cleanRef;
        window.State.activeReference = cleanRef;
      }

      if (window.SeaCharterStore?.set) {
        try {
          window.SeaCharterStore.set({ activeProjectRef: cleanRef }, { silent: true });
        } catch (_) {}
      }

      // 3. EVITAR RECARGAS POR URL:
      // Si estamos actualizando la URL para reflejar el nuevo ID (?ref=...),
      // utilizar window.history.replaceState de forma segura sin recargas ni re-renders de Router
      try {
        if (cleanRef && window.history?.replaceState && window.location) {
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.get('ref') !== cleanRef) {
            currentUrl.searchParams.set('ref', cleanRef);
            window.history.replaceState(window.history.state, '', currentUrl.toString());
          }
        }
      } catch (_) {}

      // Sync with TopNav input (#quick-ref) immediately
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

      ['gc-ref', 'asb-ref', 'tracking-live-contract-ref'].forEach((id) => {
        const input = document.getElementById(id);
        if (input && input.value !== cleanRef) input.value = cleanRef;
      });

      // Synchronize with external store without looping or saving automatically to DB
      if (!isSyncingRef.current) {
        isSyncingRef.current = true;
        try {
          if (typeof window.setActiveContractRef === 'function') {
            window.setActiveContractRef(cleanRef);
          } else if (typeof window.ContractRefManager?.setActiveContractRef === 'function') {
            window.ContractRefManager.setActiveContractRef(cleanRef);
          }
          window.dispatchEvent(new CustomEvent('project-ref:changed', {
            detail: { activeProjectRef: cleanRef, reference: cleanRef }
          }));
        } catch (_) {}
        isSyncingRef.current = false;
      }
    }
  }, []);

  const resetProjectRef = useCallback(() => {
    setActiveProjectRef('');
  }, [setActiveProjectRef]);

  // 1. REVISIÓN DEL HOOK DE INICIALIZACIÓN (CRÍTICO):
  // La lógica que autogenera el project_ref y llama a setActiveProjectRef
  // DEBE estar estrictamente contenida dentro de un useEffect con un array de dependencias vacío [].
  // Comprueba primero si activeProjectRef ya tiene un valor. Si ya existe, hace return temprano.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Si ya existe activeProjectRef, hacer return temprano para evitar sobreescribirlo y generar re-renders
    if (activeRefRef.current && activeRefRef.current.trim()) {
      return;
    }

    let urlRef = '';
    try {
      const params = new URLSearchParams(window.location.search || '');
      urlRef = (params.get('ref') || params.get('project_ref') || params.get('contract_ref') || '').trim();
    } catch (_) {}

    if (urlRef) {
      setActiveProjectRef(urlRef);
      return;
    }

    if (retryCountRef.current >= maxRetries) {
      setActiveProjectRef('');
      return;
    }
    retryCountRef.current += 1;

    // Auto-generar nueva referencia única
    try {
      const newRef = generateRandomProjectRef();
      setActiveProjectRef(newRef || '');
    } catch (_) {
      setActiveProjectRef('');
    }
  }, []); // Strictly empty dependency array []

  // Exponer utilidades globales y escuchar cambios externos sin crear bucles
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.generateRandomProjectRef = generateRandomProjectRef;
    window.generateNewProjectRef = generateRandomProjectRef;
    window.setActiveProjectRef = setActiveProjectRef;
    window.getActiveProjectRef = () => activeRefRef.current || window.activeProjectRef || '';

    const handleContractRefChanged = (e) => {
      const ref = e?.detail?.reference || e?.detail?.activeProjectRef;
      if (ref && ref !== activeRefRef.current && !isSyncingRef.current) {
        setActiveProjectRef(ref);
      }
    };

    window.addEventListener('contract-reference:changed', handleContractRefChanged);

    return () => {
      window.removeEventListener('contract-reference:changed', handleContractRefChanged);
    };
  }, [setActiveProjectRef]);

  // 3. CONECTAR BOTÓN NUEVO PROYECTO (+) DEL SIDEBAR IZQUIERDO:
  // Su función onClick es puramente de estado:
  // The vanilla dossier controller owns New Estimation; the reference setter above
  // keeps React synchronized without attaching a second click handler.

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
