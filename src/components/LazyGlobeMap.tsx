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

export function MapSkeletonFallback() {
  return (
<div 
  className="w-full h-full min-h-[600px] flex flex-col items-center justify-center bg-slate-900 text-slate-100"
  style={{ backgroundColor: '#0f172a', color: '#f1f5f9' }}
>
  {/* Efecto Radar / Spinner */}
  <div className="relative flex items-center justify-center mb-8">
    <div className="absolute inset-0 rounded-full border-4 border-cyan-500/30 animate-ping"></div>
    <div className="h-16 w-16 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"></div>
    <div className="absolute h-3 w-3 rounded-full bg-cyan-400"></div>
  </div>
  
  {/* Textos */}
  <h2 className="text-2xl font-bold tracking-wide text-white">SeaCharter Core PRO</h2>
  <p className="mt-3 text-sm text-cyan-400 animate-pulse font-medium">Iniciando motor cartográfico y datos AIS...</p>
  
  {/* Barra de progreso simulada */}
  <div className="mt-8 w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden">
    <div className="h-full bg-cyan-500 w-full animate-pulse"></div>
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
