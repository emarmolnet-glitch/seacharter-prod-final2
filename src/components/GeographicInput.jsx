import React, { useState, useEffect } from 'react';

/**
 * GeographicInput / MapSidebar Component
 * 
 * Provides reactive geographic input panel controls for POL/POD route configuration
 * on the 3D globe map of SeaCharter Core PRO.
 * Supports smooth slide animations and directional arrow toggling.
 */
export function GeographicInput({
  initialOpen = true,
  onToggle,
  onCalculateRoute,
  defaultBallast = '',
  defaultPol = '',
  defaultPod = '',
  defaultLaydays = '',
  defaultCancelling = '',
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(initialOpen);
  const [ballast, setBallast] = useState(defaultBallast);
  const [pol, setPol] = useState(defaultPol);
  const [pod, setPod] = useState(defaultPod);
  const [laydays, setLaydays] = useState(defaultLaydays);
  const [cancelling, setCancelling] = useState(defaultCancelling);

  const handleToggle = () => {
    const nextState = !isPanelOpen;
    setIsPanelOpen(nextState);
    if (typeof onToggle === 'function') {
      onToggle(nextState);
    }
    if (typeof window !== 'undefined' && typeof window.toggleRouteInputPanel === 'function') {
      // Synchronize with global map layout if available
      window.scheduleRouteMapRedraw?.(180);
    }
  };

  // Sync if global window state triggers a toggle
  useEffect(() => {
    const handleGlobalToggle = (event) => {
      if (typeof event.detail?.isOpen === 'boolean') {
        setIsPanelOpen(event.detail.isOpen);
      }
    };
    window.addEventListener('map:geo-input-toggled', handleGlobalToggle);
    return () => window.removeEventListener('map:geo-input-toggled', handleGlobalToggle);
  }, []);

  const handleCalculate = (e) => {
    e?.preventDefault();
    if (typeof onCalculateRoute === 'function') {
      onCalculateRoute({ ballast, pol, pod, laydays, cancelling });
    } else if (typeof window !== 'undefined' && typeof window.runOnDemandMapRouteWorkflow === 'function') {
      const btn = document.getElementById('btn-map-locate-route');
      window.runOnDemandMapRouteWorkflow(btn);
    }
  };

  return (
    <section
      id="map-input-overlay"
      aria-label="Input geográfico"
      aria-hidden={!isPanelOpen}
      className={`transition-transform duration-300 z-50 ${
        isPanelOpen ? 'translate-x-0' : '-translate-x-[calc(100%-2rem)]'
      } map-floating-panel route-sync-card ecosystem-panel space-y-4`}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2
            className={`text-sm font-bold uppercase text-[#002060] transition-opacity duration-200 ${
              isPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            data-i18n="map_input_header"
          >
            <i className="fa-solid fa-map-location-dot mr-2" aria-hidden="true" />
            Input geográfico
          </h2>
          <button
            id="btn-map-collapse-input"
            type="button"
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className="map-icon-button !w-8 !h-8 !shadow-none cursor-pointer shrink-0 z-10"
            title={isPanelOpen ? 'Colapsar Input geográfico' : 'Expandir Input geográfico'}
            aria-label={isPanelOpen ? 'Colapsar Input geográfico' : 'Expandir Input geográfico'}
            aria-expanded={isPanelOpen}
            aria-controls="map-input-overlay"
          >
            <i
              className={`fa-solid fa-chevron-left text-xs transition-transform duration-300 ${
                isPanelOpen ? '' : 'rotate-180'
              }`}
              aria-hidden="true"
            />
          </button>
        </div>
        <p
          className={`text-xs text-slate-600 mt-1 transition-opacity duration-200 ${
            isPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          Los puertos, laycan y millas alimentan automáticamente la calculadora y los contratos.
        </p>
      </div>

      <div
        className={`space-y-3 transition-opacity duration-200 ${
          isPanelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none overflow-hidden h-0'
        }`}
      >
        <div className="input-group">
          <label htmlFor="map-port-ballast" data-i18n="map_label_ballast">
            Puerto previo (Lastre)
          </label>
          <input
            type="text"
            id="map-port-ballast"
            className="input-gc"
            placeholder="Ej: Puerto Rico"
            autoComplete="off"
            inputMode="text"
            spellCheck="false"
            value={ballast}
            onChange={(e) => setBallast(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label htmlFor="map-port-pol" data-i18n="map_label_pol">
            Puerto de carga (POL)
          </label>
          <input
            type="text"
            id="map-port-pol"
            className="input-gc"
            placeholder="Ej: Buenos Aires"
            autoComplete="off"
            inputMode="text"
            spellCheck="false"
            value={pol}
            onChange={(e) => setPol(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label htmlFor="map-port-pod" data-i18n="map_label_pod">
            Puerto de descarga (POD)
          </label>
          <input
            type="text"
            id="map-port-pod"
            className="input-gc"
            placeholder="Ej: Monopoli"
            autoComplete="off"
            inputMode="text"
            spellCheck="false"
            value={pod}
            onChange={(e) => setPod(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="input-group">
            <label htmlFor="map-laycan-date">Laydays (Inicio)</label>
            <input
              type="date"
              id="map-laycan-date"
              className="input-gc"
              value={laydays}
              onChange={(e) => setLaydays(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label htmlFor="map-cancelling-date">Cancelación (Cancelling)</label>
            <input
              type="date"
              id="map-cancelling-date"
              className="input-gc"
              value={cancelling}
              onChange={(e) => setCancelling(e.target.value)}
            />
          </div>
        </div>

        <button
          id="btn-map-locate-route"
          type="button"
          onClick={handleCalculate}
          className="btn-light-action w-full text-xs font-bold py-2 rounded"
        >
          <i className="fa-solid fa-route mr-1" aria-hidden="true" /> Calcular ruta marítima y actualizar ecosistema
        </button>
      </div>
    </section>
  );
}

export default GeographicInput;
