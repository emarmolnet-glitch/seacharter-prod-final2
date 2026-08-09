import React, { memo, useEffect, useState } from 'react';

interface GlobeMapProps {
  containerId: string;
  globeKey?: string;
}

interface GlobalFleetGlobeApi {
  mount?: (options: { containerId: string; key: string }) => unknown;
  destroy?: (key?: string) => void;
  resize?: (key?: string) => void;
}

interface GlobeWindow extends Window {
  GlobalFleetGlobe?: GlobalFleetGlobeApi;
}

export function MapSkeletonFallback({ title = 'Cargando Visor Cartográfico...' }: { title?: string }) {
  return (
    <div className="map-skeleton-container" aria-label="Cargando mapa en segundo plano">
      <div className="map-skeleton-globe">
        <div className="map-skeleton-pulse"></div>
      </div>
      <div className="map-skeleton-status">
        <span className="map-skeleton-pulse"></span>
        <span>{title}</span>
      </div>
    </div>
  );
}

const GlobeCanvasContent = memo(function GlobeCanvasContent({ containerId, globeKey = 'main' }: GlobeMapProps) {
  useEffect(() => {
    const globeWindow = window as GlobeWindow;
    let cancelled = false;
    let mountTimerId: number | undefined;
    let resizeFrameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const scheduleResize = () => {
      if (resizeFrameId !== undefined) window.cancelAnimationFrame(resizeFrameId);
      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = undefined;
        globeWindow.GlobalFleetGlobe?.resize?.(globeKey);
      });
    };

    void import('../map-cartography-loader')
      .then(({ ensureGlobalFleetGlobeLoaded }) => ensureGlobalFleetGlobeLoaded())
      .then((globeApi) => {
        if (cancelled) return;
        mountTimerId = window.setTimeout(() => {
          if (cancelled) return;
          globeApi.mount?.({ containerId, key: globeKey });
          const container = document.getElementById(containerId);
          if (container && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleResize);
            resizeObserver.observe(container);
          }
        }, 0);
      })
      .catch((error) => console.error('[LazyGlobeMap] No se pudo cargar el módulo cartográfico.', error));

    return () => {
      cancelled = true;
      if (mountTimerId !== undefined) window.clearTimeout(mountTimerId);
      if (resizeFrameId !== undefined) window.cancelAnimationFrame(resizeFrameId);
      resizeObserver?.disconnect();
      globeWindow.GlobalFleetGlobe?.destroy?.(globeKey);
    };
  }, [containerId, globeKey]);

  return <div id={containerId} className="density-globe-canvas h-full w-full rounded-lg border border-slate-200 bg-slate-950" />;
});

const LazyGlobeMap = memo(function LazyGlobeMap({ containerId, globeKey = 'main' }: GlobeMapProps) {
  const [showGlobe, setShowGlobe] = useState(false);

  useEffect(() => {
    let idleCallbackId: number | undefined;
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleCallbackId = window.requestIdleCallback(() => setShowGlobe(true), { timeout: 1000 });
      } else {
        setShowGlobe(true);
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
      if (idleCallbackId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, []);

  if (!showGlobe) return <MapSkeletonFallback />;
  return <GlobeCanvasContent containerId={containerId} globeKey={globeKey} />;
});

export default LazyGlobeMap;
