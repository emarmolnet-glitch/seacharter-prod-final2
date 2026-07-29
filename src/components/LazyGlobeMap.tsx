import React, { Suspense, lazy, useEffect, useState } from 'react';

// Lightweight Map Skeleton Fallback Component
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

// Internal Globe Component loaded lazily
const GlobeCanvasContent = lazy(() => {
  return new Promise<{ default: React.ComponentType<{ containerId: string; globeKey?: string }> }>((resolve) => {
    // Dynamic import simulation / resolution for GlobalFleetGlobe
    if (typeof window !== 'undefined' && window.GlobalFleetGlobe) {
      resolve({
        default: function GlobeCanvasWrapper({ containerId, globeKey = 'main' }: { containerId: string; globeKey?: string }) {
          useEffect(() => {
            if (window.GlobalFleetGlobe && typeof window.GlobalFleetGlobe.mount === 'function') {
              window.GlobalFleetGlobe.mount({ containerId, key: globeKey });
            }
          }, [containerId, globeKey]);

          return <div id={containerId} className="density-globe-canvas h-full w-full rounded-lg border border-slate-200 bg-slate-950" />;
        },
      });
    } else {
      // Defer resolution until Globe.gl / GlobalFleetGlobe script is ready
      const checkTimer = setInterval(() => {
        if (typeof window !== 'undefined' && window.GlobalFleetGlobe) {
          clearInterval(checkTimer);
          resolve({
            default: function GlobeCanvasWrapper({ containerId, globeKey = 'main' }: { containerId: string; globeKey?: string }) {
              useEffect(() => {
                if (window.GlobalFleetGlobe && typeof window.GlobalFleetGlobe.mount === 'function') {
                  window.GlobalFleetGlobe.mount({ containerId, key: globeKey });
                }
              }, [containerId, globeKey]);

              return <div id={containerId} className="density-globe-canvas h-full w-full rounded-lg border border-slate-200 bg-slate-950" />;
            },
          });
        }
      }, 50);
    }
  });
});

export default function LazyGlobeMap({ containerId, globeKey = 'main' }: { containerId: string; globeKey?: string }) {
  const [showGlobe, setShowGlobe] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => setShowGlobe(true), { timeout: 1000 });
      } else {
        setShowGlobe(true);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  if (!showGlobe) {
    return <MapSkeletonFallback />;
  }

  return (
    <Suspense fallback={<MapSkeletonFallback />}>
      <GlobeCanvasContent containerId={containerId} globeKey={globeKey} />
    </Suspense>
  );
}
