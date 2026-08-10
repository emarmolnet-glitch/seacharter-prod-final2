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
      className="w-full h-full min-h-[600px] flex flex-col items-center justify-center bg-slate-900 text-white"
      role="status"
      aria-live="polite"
      aria-label="Iniciando visor cartográfico"
    >
      <div className="relative mb-8 flex h-20 w-20 items-center justify-center" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border border-cyan-400/20 shadow-[0_0_40px_rgba(34,211,238,0.18)]" />
        <div className="h-16 w-16 animate-spin rounded-full border-2 border-slate-700 border-r-blue-500 border-t-cyan-400" />
        <div className="absolute h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.95)]" />
      </div>

      <h2 className="text-2xl font-semibold tracking-[0.12em] text-white sm:text-3xl">
        SeaCharter Core PRO
      </h2>
      <p className="mt-3 px-6 text-center text-sm font-medium tracking-wide text-slate-300 sm:text-base">
        Iniciando Rodahmar Engine y visor cartográfico...
      </p>
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
