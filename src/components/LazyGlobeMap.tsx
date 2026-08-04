import React, { memo, useEffect, useState } from 'react';

interface GlobeMapProps {
  containerId: string;
  globeKey?: string;
}

interface GlobalFleetGlobeApi {
  mount?: (options: { containerId: string; key: string }) => unknown;
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
    let checkTimer: number | undefined;

    const mountGlobe = () => {
      if (cancelled) return;
      if (typeof globeWindow.GlobalFleetGlobe?.mount === 'function') {
        globeWindow.GlobalFleetGlobe.mount({ containerId, key: globeKey });
        return;
      }
      checkTimer = window.setTimeout(mountGlobe, 100);
    };

    mountGlobe();
    return () => {
      cancelled = true;
      if (checkTimer !== undefined) window.clearTimeout(checkTimer);
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
