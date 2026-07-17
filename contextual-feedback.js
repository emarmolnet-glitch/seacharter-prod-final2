(function initializeContextualFeedback(globalObject) {
    'use strict';

    const STORAGE_PREFIX = 'banner-hidden-';
    const TOAST_DURATION_MS = 5000;
    const MODULE_GUIDES = Object.freeze({
        map: 'Define la ruta: Marca coordenadas POL (Carga) y POD (Descarga).',
        estimator: 'Introduce costes, consumo (VLSFO/HFO) y tiempos de puerto.',
        gencon: 'Configura cláusulas GENCON 94: define términos de laytime y demurrage.',
        auditor: 'Ejecuta la auditoría para detectar riesgos y deficiencias (PSC).',
        ais: 'Visualiza la flota en tiempo real para oportunidades de posicionamiento.',
        matching: 'Paso 1: Audita. Paso 2: Revisa resultados y exporta a Data Bridge.',
    });
    let activeToast = null;
    let activeToastTimer = null;
    let moduleViewObserver = null;

    function hasMatchingAudit(context = globalObject) {
        const results = context && context.lastMatchingEngineResults;
        return Array.isArray(results) && results.length > 0;
    }

    function canExportMatching(context = globalObject) {
        return hasMatchingAudit(context)
            ? { allowed: true, message: 'Enviado a Data Bridge.' }
            : { allowed: false, message: 'Acción incorrecta: Ejecuta la auditoría antes de exportar.' };
    }

    function isGuideClosed(moduleId, storage = globalObject.localStorage) {
        if (!storage) return false;
        try {
            return storage.getItem(`${STORAGE_PREFIX}${moduleId}`) === 'true';
        } catch (error) {
            return false;
        }
    }

    function closeGuide(moduleId, storage = globalObject.localStorage) {
        if (!storage) return;
        try {
            storage.setItem(`${STORAGE_PREFIX}${moduleId}`, 'true');
        } catch (error) {
        }
    }

    function ensureToastRegion(documentObject) {
        let region = documentObject.getElementById('contextual-toast-region');
        if (region) return region;
        region = documentObject.createElement('div');
        region.id = 'contextual-toast-region';
        region.className = 'contextual-toast-region';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        documentObject.body.appendChild(region);
        return region;
    }

    function notify(message, variant = 'success', documentObject = globalObject.document) {
        if (!documentObject || !message) return null;
        const region = ensureToastRegion(documentObject);
        const toast = documentObject.createElement('div');
        const iconClass = variant === 'warning'
            ? 'fa-triangle-exclamation'
            : variant === 'error'
                ? 'fa-circle-exclamation'
                : 'fa-circle-check';
        toast.className = 'contextual-toast';
        toast.dataset.variant = variant;
        toast.setAttribute('role', 'status');
        toast.innerHTML = `<i class="fa-solid ${iconClass} contextual-toast__icon" aria-hidden="true"></i><span></span>`;
        toast.querySelector('span').textContent = message;
        if (activeToastTimer) globalObject.clearTimeout(activeToastTimer);
        if (activeToast) activeToast.remove();
        region.replaceChildren(toast);
        activeToast = toast;
        const showToast = () => toast.classList.add('is-visible');
        if (typeof globalObject.requestAnimationFrame === 'function') globalObject.requestAnimationFrame(showToast);
        else showToast();
        activeToastTimer = globalObject.setTimeout(() => {
            toast.remove();
            if (activeToast === toast) activeToast = null;
            activeToastTimer = null;
        }, TOAST_DURATION_MS);
        return toast;
    }

    function getCurrentModule(documentObject) {
        const activeView = documentObject.querySelector('.view-section.active-block, .view-section.active-flex');
        return activeView?.id?.replace('view-', '') || 'map';
    }

    function renderModuleHelpBanner(moduleId, documentObject = globalObject.document) {
        if (!documentObject) return null;
        const banner = documentObject.getElementById('module-help-banner');
        if (!banner) return null;
        const message = MODULE_GUIDES[moduleId];
        banner.dataset.currentModule = moduleId;
        if (!message || isGuideClosed(moduleId)) {
            banner.hidden = true;
            banner.setAttribute('aria-hidden', 'true');
            return banner;
        }
        banner.querySelector('.contextual-guide-banner__text').textContent = message;
        banner.hidden = false;
        banner.setAttribute('aria-hidden', 'false');
        return banner;
    }

    function bindModuleHelpBanner(documentObject) {
        const banner = documentObject.getElementById('module-help-banner');
        if (!banner || banner.dataset.bound === 'true') return;
        banner.querySelector('.contextual-guide-banner__close')?.addEventListener('click', () => {
            const currentModule = banner.dataset.currentModule || getCurrentModule(documentObject);
            closeGuide(currentModule);
            banner.hidden = true;
            banner.setAttribute('aria-hidden', 'true');
        });
        banner.dataset.bound = 'true';
    }

    function observeCurrentModule(documentObject) {
        if (moduleViewObserver || typeof globalObject.MutationObserver !== 'function') return;
        const views = Array.from(documentObject.querySelectorAll('.view-section'));
        moduleViewObserver = new globalObject.MutationObserver(() => {
            renderModuleHelpBanner(getCurrentModule(documentObject), documentObject);
        });
        views.forEach((view) => moduleViewObserver.observe(view, { attributes: true, attributeFilter: ['class'] }));
    }

    function hasMissingFinancialData(documentObject) {
        const cargoQuantity = Number(documentObject.getElementById('cargo-qty')?.value || 0);
        const freightRate = Number(documentObject.getElementById('freight-rate')?.value || 0);
        const lumpSum = Number(documentObject.getElementById('lumpsum-override')?.value || 0);
        return !(cargoQuantity > 0 && (freightRate > 0 || lumpSum > 0));
    }

    function bindContextualActions(documentObject) {
        let calculatorTimer = null;
        let genconTimer = null;
        let lastRouteSignature = '';

        function announceRouteWhenReady(target) {
            if (target.matches('#map-port-pol, #map-port-pod, #port-pol, #port-pod')) {
                const pol = documentObject.getElementById('map-port-pol')?.value.trim()
                    || documentObject.getElementById('port-pol')?.value.trim()
                    || '';
                const pod = documentObject.getElementById('map-port-pod')?.value.trim()
                    || documentObject.getElementById('port-pod')?.value.trim()
                    || '';
                const signature = `${pol}|${pod}`;
                if (pol && pod && signature !== lastRouteSignature) {
                    lastRouteSignature = signature;
                    notify('Ruta definida correctamente.');
                }
            }
        }

        function announceModuleUpdate(target) {
            if (target.closest('#view-estimator') && target.matches('input, select, textarea')) {
                globalObject.clearTimeout(calculatorTimer);
                calculatorTimer = globalObject.setTimeout(() => notify('Estimación actualizada.'), 650);
            }
            if (target.closest('#view-gencon') && target.matches('input, select, textarea')) {
                globalObject.clearTimeout(genconTimer);
                genconTimer = globalObject.setTimeout(() => notify('Contrato actualizado.'), 650);
            }
        }

        documentObject.addEventListener('change', (event) => {
            const target = event.target;
            if (!(target instanceof globalObject.Element)) return;
            announceRouteWhenReady(target);
            announceModuleUpdate(target);
        });

        documentObject.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof globalObject.Element)) return;
            announceRouteWhenReady(target);
            announceModuleUpdate(target);
        });

        documentObject.getElementById('analyzeBtn')?.addEventListener('click', () => {
            if (hasMissingFinancialData(documentObject)) {
                notify('Faltan datos financieros.', 'warning');
            }
        }, true);

        documentObject.querySelectorAll('[data-module-id="ais"]').forEach((button) => {
            button.addEventListener('click', () => {
                globalObject.setTimeout(() => notify('Mapa cargado.'), 350);
            });
        });
    }

    function mountMatchingGatekeeper(documentObject) {
        const actionDock = documentObject.getElementById('matching-action-dock');
        if (!actionDock || documentObject.getElementById('contextual-export-databridge')) return;
        const button = documentObject.createElement('button');
        button.id = 'contextual-export-databridge';
        button.type = 'button';
        button.className = 'contextual-export-button';
        button.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Enviar a Data Bridge';
        button.addEventListener('click', () => requestMatchingExport());
        actionDock.appendChild(button);
    }

    async function requestMatchingExport(context = globalObject) {
        const gate = canExportMatching(context);
        if (!gate.allowed) {
            notify(gate.message, 'warning');
            return false;
        }
        if (typeof context.generateFrozenReport !== 'function') {
            notify('No se pudo iniciar el envío a Data Bridge.', 'error');
            return false;
        }
        await context.generateFrozenReport();
        notify(gate.message);
        return true;
    }

    function initializeBrowserLayer(documentObject) {
        bindModuleHelpBanner(documentObject);
        renderModuleHelpBanner(getCurrentModule(documentObject), documentObject);
        observeCurrentModule(documentObject);
        bindContextualActions(documentObject);
        mountMatchingGatekeeper(documentObject);
    }

    const api = Object.freeze({
        MODULE_GUIDES,
        STORAGE_PREFIX,
        TOAST_DURATION_MS,
        canExportMatching,
        hasMatchingAudit,
        isGuideClosed,
        closeGuide,
        getCurrentModule,
        hasMissingFinancialData,
        notify,
        renderModuleHelpBanner,
        requestMatchingExport,
    });

    globalObject.SeaCharterFeedback = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (globalObject.document) initializeBrowserLayer(globalObject.document);
}(typeof window !== 'undefined' ? window : globalThis));
