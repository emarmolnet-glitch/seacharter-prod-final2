const SPLASH_EXIT_DELAY_MS = 360;
const STARTUP_TIMEOUT_MS = 15000;
const MAP_CONTAINER_ID = 'map-container';

function getSplashElements() {
    return {
        splash: document.getElementById('global-splash-screen'),
        status: document.getElementById('global-splash-status'),
        mapContainer: document.getElementById(MAP_CONTAINER_ID)
    };
}

function isGlobeMounted(mapContainer) {
    if (!mapContainer || mapContainer.dataset.renderKey !== 'mounted') return false;
    return Boolean(mapContainer.querySelector('canvas'));
}

function requestInitialGlobeMount() {
    if (typeof window.ensureRouteMapReady === 'function') {
        window.ensureRouteMapReady('map-host');
        return;
    }
    if (typeof window.initMap === 'function') {
        window.initMap();
    }
}

function revealApplication(reason) {
    const { splash } = getSplashElements();
    if (!splash || document.body?.dataset.appReady === 'true') return;

    document.body.dataset.appReady = 'true';
    document.body.dataset.appReadyReason = reason;
    document.body.setAttribute('aria-busy', 'false');
    splash.setAttribute('aria-hidden', 'true');
    splash.classList.add('is-exiting');

    window.setTimeout(() => {
        splash.hidden = true;
    }, SPLASH_EXIT_DELAY_MS);

    window.dispatchEvent(new CustomEvent('seacharter:app-ready', { detail: { reason } }));
}

function startGlobalSplashController() {
    const { splash, status, mapContainer } = getSplashElements();
    if (!splash || !mapContainer) {
        revealApplication('startup-shell-unavailable');
        return;
    }

    let completed = false;
    let mountFrameId = 0;
    let startupTimeoutId = 0;
    let mutationObserver;
    let resizeObserver;

    const cleanup = () => {
        if (mountFrameId) window.cancelAnimationFrame(mountFrameId);
        if (startupTimeoutId) window.clearTimeout(startupTimeoutId);
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        window.removeEventListener('resize', scheduleMount);
        window.removeEventListener('load', scheduleMount);
    };

    const complete = (reason) => {
        if (completed) return;
        completed = true;
        cleanup();
        revealApplication(reason);
    };

    const checkGlobe = () => {
        if (isGlobeMounted(mapContainer)) complete('webgl-mounted');
    };

    const scheduleMount = () => {
        if (completed || mountFrameId) return;
        mountFrameId = window.requestAnimationFrame(() => {
            mountFrameId = 0;
            requestInitialGlobeMount();
            checkGlobe();
        });
    };

    mutationObserver = new MutationObserver(checkGlobe);
    mutationObserver.observe(mapContainer, {
        attributes: true,
        attributeFilter: ['data-render-key'],
        childList: true,
        subtree: true
    });

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleMount);
        resizeObserver.observe(mapContainer);
    }

    window.addEventListener('resize', scheduleMount, { passive: true });
    window.addEventListener('load', scheduleMount, { once: true });

    startupTimeoutId = window.setTimeout(() => {
        if (completed) return;
        if (status) status.textContent = 'Motor disponible en modo seguro';
        console.warn('[Startup] El lienzo WebGL no confirmó su montaje dentro del tiempo esperado.');
        complete('startup-timeout');
    }, STARTUP_TIMEOUT_MS);

    scheduleMount();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGlobalSplashController, { once: true });
} else {
    startGlobalSplashController();
}
