(function initializeAisStreamDraftBridge(global) {
    'use strict';

    function getMapLoader() {
        return global.MapLoader && typeof global.MapLoader === 'object' ? global.MapLoader : null;
    }

    const bridge = Object.freeze({
        isReady() {
            return Boolean(getMapLoader());
        },
        start(options) {
            const loader = getMapLoader();
            if (!loader) return { started: false, reason: 'map-loader-unavailable' };
            if (typeof loader.startPersistentAisStream === 'function') {
                return loader.startPersistentAisStream(options || {});
            }
            if (typeof loader.startAisProxyPolling === 'function') {
                return loader.startAisProxyPolling(options || {});
            }
            return { started: false, reason: 'ais-connection-unavailable' };
        },
        stop() {
            const loader = getMapLoader();
            if (loader && typeof loader.stopAisProxyPolling === 'function') {
                return loader.stopAisProxyPolling();
            }
            return { stopped: true, reason: 'ais-connection-inactive' };
        },
        getBoundingBoxes() {
            const loader = getMapLoader();
            return loader && typeof loader.obtenerBoundingBoxesActuales === 'function'
                ? loader.obtenerBoundingBoxesActuales()
                : [];
        }
    });

    global.AisStreamDraft = bridge;
    global.dispatchEvent(new CustomEvent('aisstream-draft:ready', {
        detail: { path: '/aisstream-draft.js', ready: bridge.isReady() }
    }));
})(window);
