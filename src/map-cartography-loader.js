const GLOBE_SCRIPT_ID = 'global-fleet-globe-runtime';
const GLOBE_STYLES_ID = 'global-fleet-globe-styles';
const GLOBE_RUNTIME_URL = 'https://unpkg.com/globe.gl@2.46.1/dist/globe.gl.min.js';

// Usamos document.baseURI para que la ruta sea siempre relativa a index.html
// Esto evita el conflicto entre la nube de Netlify y el disco local de Electron.
const GLOBE_MODULE_URL = new URL('GlobalFleetGlobe.js?v=20260904-vessel-html-marker', document.baseURI).href;

let cartographyPromise = null;

export function ensureThreeTimerPolyfill() {}

export function mountFallbackCartographicCanvas(container) {
  if (!container || typeof document === 'undefined') return null;
  let canvas = container.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'fallback-cartographic-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    container.appendChild(canvas);
  }
  const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 800, height: 600 };
  const w = Math.max(rect.width || 800, 300);
  const h = Math.max(rect.height || 600, 300);
  canvas.width = w;
  canvas.height = h;

  let rendered = false;
  try {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && typeof gl.clearColor === 'function') {
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.02, 0.04, 0.08, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      rendered = true;
    }
  } catch (_) {}

  if (!rendered) {
    try {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, w, h);
        const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) / 1.5);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(14, 165, 233, 0.12)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 80) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += 60) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.38;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.stroke();
      }
    } catch (_) {}
  }

  container.dataset.renderKey = 'mounted';
  return canvas;
}

function ensureStylesheet() {
  if (document.getElementById(GLOBE_STYLES_ID)) return;
  const stylesheet = document.createElement('link');
  stylesheet.id = GLOBE_STYLES_ID;
  stylesheet.rel = 'stylesheet';
  stylesheet.href = (typeof document !== 'undefined' && document.baseURI)
    ? new URL('assets/css/density-globe.css?v=20260808-main-globe-recovery', document.baseURI).href
    : '/assets/css/density-globe.css?v=20260808-main-globe-recovery';
  // stylesheet.href = '/assets/css/density-globe.css?v=20260808-main-globe-recovery';
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
  ensureThreeTimerPolyfill();
  if (window.GlobalFleetGlobe) return Promise.resolve(window.GlobalFleetGlobe);
  if (cartographyPromise) return cartographyPromise;

  ensureStylesheet();
  cartographyPromise = loadClassicScript(GLOBE_SCRIPT_ID, GLOBE_RUNTIME_URL)
    .then(async () => {
      ensureThreeTimerPolyfill();
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
