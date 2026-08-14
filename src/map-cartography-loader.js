const GLOBE_SCRIPT_ID = 'global-fleet-globe-runtime';
const GLOBE_STYLES_ID = 'global-fleet-globe-styles';
const GLOBE_RUNTIME_URL = 'https://unpkg.com/globe.gl@2.46.1/dist/globe.gl.min.js';
const GLOBE_MODULE_URL = '/GlobalFleetGlobe.js?v=20260814-tracking-position-sync';

let cartographyPromise = null;

function ensureStylesheet() {
  if (document.getElementById(GLOBE_STYLES_ID)) return;
  const stylesheet = document.createElement('link');
  stylesheet.id = GLOBE_STYLES_ID;
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/assets/css/density-globe.css?v=20260808-main-globe-recovery';
  document.head.appendChild(stylesheet);
}

function loadClassicScript(id, src) {
  if (id === GLOBE_SCRIPT_ID && typeof window.Globe === 'function') return Promise.resolve();

  const existingScript = document.getElementById(id);
  if (existingScript) {
    return new Promise((resolve, reject) => {
      if (existingScript.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

export function ensureGlobalFleetGlobeLoaded() {
  if (window.GlobalFleetGlobe) return Promise.resolve(window.GlobalFleetGlobe);
  if (cartographyPromise) return cartographyPromise;

  ensureStylesheet();
  cartographyPromise = loadClassicScript(GLOBE_SCRIPT_ID, GLOBE_RUNTIME_URL)
    .then(async () => {
      await import(/* @vite-ignore */ GLOBE_MODULE_URL);
      if (!window.GlobalFleetGlobe) throw new Error('GlobalFleetGlobe no expuso su API después de cargar.');
      return window.GlobalFleetGlobe;
    })
    .catch((error) => {
      cartographyPromise = null;
      throw error;
    });

  return cartographyPromise;
}

export function destroyGlobalFleetGlobe(key = 'main') {
  window.GlobalFleetGlobe?.destroy?.(key);
}
