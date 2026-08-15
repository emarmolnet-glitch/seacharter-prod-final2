import { calculateLaytime } from './laytime-engine.mjs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import DashboardExecutive from './src/components/DashboardExecutive.jsx';
import { calculateDynamicEta, calculateLaytimeProjection } from './src/executive-predictive-metrics.mjs';
import { trackingStore } from './src/stores/tracking-store.js';
import { voyageStore, hasOperationalDraft } from './src/stores/voyage-store.js';
import { normalizeAisDestination } from './src/tracking-destination.mjs';
import { mountDatalasticCreditCounter } from './src/components/DatalasticCreditCounter.js';
import { datalasticCreditStore } from './src/stores/datalastic-credit-store.js';

const TRACKING_POLL_INTERVAL = 30_000;
const TRACKING_AIS_POLL_INTERVAL = 30_000;
const TRACKING_MAP_KEY = 'tracking';
let trackingMapLoadPromise = null;
let trackingMapMountFrameId = null;
let trackingMapResizeFrameId = null;
let trackingMapResizeTimerId = null;
let trackingMapLifecycleToken = 0;
let trackingMapVesselRenderSequence = 0;
const CONTRACT_CONTROL_IDS = [
    'tracking-input-ballast',
    'tracking-input-pol',
    'tracking-input-pod',
    'tracking-input-laydays',
    'tracking-input-cancelling',
    'tracking-input-vessel',
    'tracking-input-cargo',
];

const trackingState = {
    flowMode: 'free',
    activeTab: 'gis',
    contractRef: '',
    loading: false,
    pollTimer: null,
    contractLookupTimer: null,
    vesselLookupTimer: null,
    vesselLookupController: null,
    vesselPollTimer: null,
    vesselPollQuery: '',
    mapMounted: false,
    data: null,
    basicVessel: null,
    routeDistance: null,
    routes: { ballast: [], laden: [] },
    laytimeStatements: [],
    laytimeIncidents: [],
    laytimeRequestController: null,
    laytimeRequestRef: '',
    laytimeLoadedRef: '',
    laytimeErrorRef: '',
    laytimeError: '',
    executiveRoot: null,
    activeVoyage: null,
    activeVoyageLoading: false,
    activeVoyageError: '',
    aisConsumptionRequest: null,
};

const contractData = {
    reference: '',
    vessel: { name: '', imo: '', status: '' },
    pol: { name: '', country: '' },
    pod: { name: '', country: '' },
    cargo: { description: '', quantity: '' },
    phase: '',
    lastSync: '',
    laytime: {},
    alerts: [],
};

function escapeTrackingHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function normalizeTrackingRef(value) {
    return String(value || '').trim().toUpperCase().replace(/^REF:\s*/i, '');
}

function formatTrackingNumber(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    const requestedMinimum = Number(options?.minimumFractionDigits);
    const requestedMaximum = Number(options?.maximumFractionDigits);
    const minimumFractionDigits = Number.isInteger(requestedMinimum)
        ? Math.min(20, Math.max(0, requestedMinimum))
        : 0;
    const maximumFractionDigits = Number.isInteger(requestedMaximum)
        ? Math.min(20, Math.max(minimumFractionDigits, requestedMaximum))
        : Math.max(1, minimumFractionDigits);
    return new Intl.NumberFormat('es-ES', {
        ...options,
        minimumFractionDigits,
        maximumFractionDigits,
    }).format(number);
}

function formatTrackingDate(value, includeTime = true) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric',
        ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(date);
}

function formatTrackingTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function toTrackingDateTimeLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function trackingLocalDateToIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asTrackingArray(value) {
    return Array.isArray(value) ? value : [];
}

function hasTrackingVoyageData() {
    return trackingState.flowMode === 'contract' && Boolean(trackingState.activeVoyage || trackingState.data?.contract);
}

function getVoyageDraft() {
    return voyageStore.getState().draft;
}

function hasAuditDraft() {
    return hasOperationalDraft(getVoyageDraft());
}

function normalizeMapPoint(value) {
    if (!value) return null;
    const latitude = Number(value.lat ?? value.latitude ?? (Array.isArray(value) ? value[0] : NaN));
    const longitude = Number(value.lng ?? value.lon ?? value.longitude ?? (Array.isArray(value) ? value[1] : NaN));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { ...value, lat: latitude, lng: longitude, latitude, longitude };
}

function trackingStatusLabel(status) {
    return ({ complete: 'Completada', active: 'En curso', pending: 'Pendiente' })[status] || 'Pendiente';
}

function normalizeTrackingAlertLevel(alert) {
    const level = String(alert?.level || alert?.severity || alert?.status || '').toLowerCase();
    if (['critical', 'danger', 'high'].includes(level)) return 'critical';
    if (['warning', 'warn', 'medium'].includes(level)) return 'warning';
    return 'ok';
}

function renderTrackingAlert(alert) {
    const level = normalizeTrackingAlertLevel(alert);
    const title = alert?.title || alert?.type || alert?.name || 'Aviso operativo';
    const detail = alert?.detail || alert?.message || alert?.description || '';
    return `<article class="tracking-alert" data-level="${escapeTrackingHtml(level)}"><span class="tracking-alert-beacon"></span><div><strong>${escapeTrackingHtml(title)}</strong>${detail ? `<p>${escapeTrackingHtml(detail)}</p>` : ''}</div></article>`;
}

function renderTrackingEvent(event) {
    const occurredAt = event?.occurredAt || event?.occurred_at || event?.createdAt || event?.created_at;
    const description = event?.description || event?.summary || event?.event || 'Evento operativo registrado';
    const phase = Number(event?.phase);
    return `<article class="tracking-event"><time class="tracking-event-time"${occurredAt ? ` datetime="${escapeTrackingHtml(occurredAt)}"` : ''}>${escapeTrackingHtml(formatTrackingTime(occurredAt))}</time><span class="tracking-event-node"></span><div><p class="tracking-event-description">${escapeTrackingHtml(description)}</p>${event?.source ? `<span class="tracking-event-source">${escapeTrackingHtml(event.source)}</span>` : ''}</div>${Number.isFinite(phase) ? `<span class="tracking-event-phase">F${escapeTrackingHtml(phase)}</span>` : ''}</article>`;
}

function metricValue(label, value) {
    if (value === null || value === undefined || value === '') return '—';
    if (/At$|eta|date|time|closed/i.test(label)) return formatTrackingDate(value);
    if (/Mt$|MtDay$|DistanceNm$|Knots$|Usd$/.test(label)) return formatTrackingNumber(value);
    return String(value);
}

function metricLabel(label) {
    const labels = {
        previousPort: 'Puerto previo', eta: 'ETA', cancellingAt: 'Cancelling', tenderedAt: 'NOR tendered', acceptedAt: 'NOR accepted',
        laytimeStartedAt: 'Inicio plancha', loadedMt: 'Cargadas', dischargedMt: 'Descargadas', totalMt: 'Total',
        actualRateMtDay: 'Ritmo real', agreedRateMtDay: 'Ritmo pactado', demurrageUsd: 'Demurrage', portCostsUsd: 'Costes puerto',
        remainingDistanceNm: 'Distancia', averageSpeedKnots: 'Velocidad', destination: 'Destino', closedAt: 'Cierre',
    };
    return labels[label] || label.replace(/([A-Z])/g, ' $1').trim();
}

function metricUnit(label) {
    if (/MtDay$/.test(label)) return ' MT/d';
    if (/Mt$/.test(label)) return ' MT';
    if (/DistanceNm$/.test(label)) return ' NM';
    if (/Knots$/.test(label)) return ' kn';
    if (/Usd$/.test(label)) return ' USD';
    return '';
}

function renderMilestoneMetrics(milestone) {
    const metrics = milestone?.metrics && typeof milestone.metrics === 'object' ? milestone.metrics : {};
    const entries = Object.entries(metrics).filter(([, value]) => value !== null && value !== undefined && value !== '');
    if (!entries.length) return '<div class="tracking-step-empty">Sin hitos registrados</div>';
    return entries.slice(0, 5).map(([label, value]) => `<div class="tracking-step-metric"><span>${escapeTrackingHtml(metricLabel(label))}</span><strong>${escapeTrackingHtml(metricValue(label, value))}${escapeTrackingHtml(metricUnit(label))}</strong></div>`).join('');
}

function getExecutiveContractData() {
    const source = trackingState.data || {};
    const contract = source.contract || {};
    const live = source.live || {};
    const activeVoyage = trackingState.activeVoyage || {};
    const pol = contract.pol || {};
    const pod = contract.pod || {};
    const loadPort = pol.name || pol.id || activeVoyage.loadPort?.name || '';
    const dischargePort = pod.name || pod.id || activeVoyage.dischargePort?.name || '';
    const vesselName = contract.vesselName || activeVoyage.vesselName || '';
    const vesselImo = contract.vesselImo || activeVoyage.imo || '';
    const cargoType = contract.cargoName || activeVoyage.cargoType || '';
    const cargoQty = Number.isFinite(Number(contract.cargoQuantityMt)) ? Number(contract.cargoQuantityMt) : activeVoyage.cargoQty;
    const operationalPhase = live.status || activeVoyage.operationalPhase || '';
    const routeProgressPct = Number.isFinite(Number(live.progressPct)) ? Number(live.progressPct) : activeVoyage.routeProgressPct;
    const liveRemainingDistanceNm = Number(live.remainingDistanceNm);
    const recalculatedDistanceNm = Number(trackingState.routeDistance);
    const remainingDistanceNm = Number.isFinite(liveRemainingDistanceNm) && liveRemainingDistanceNm > 0
        ? liveRemainingDistanceNm
        : Number.isFinite(recalculatedDistanceNm) && recalculatedDistanceNm > 0 ? recalculatedDistanceNm : null;
    const currentSpeedKnots = [
        trackingState.basicVessel?.speedKnots,
        trackingState.basicVessel?.speed,
        live.speedKnots,
        live.averageSpeedKnots,
    ].map(Number).find((value) => Number.isFinite(value) && value > 0) ?? null;
    const liveMetrics = calculateDynamicEta({
        remainingDistanceNm,
        speedKnots: currentSpeedKnots,
        calculatedAt: new Date(),
    });
    const laytimeProjection = calculateLaytimeProjection(trackingState.laytimeStatements, liveMetrics.dynamicEtaAt);
    const hasVoyageData = Boolean(trackingState.activeVoyage || source.contract);
    const voyageAlerts = hasVoyageData ? asTrackingArray(source.alerts || activeVoyage.alerts) : [];
    return {
        ...contractData,
        reference: contract.reference || activeVoyage.reference || trackingState.contractRef || '',
        vessel: {
            ...contractData.vessel,
            name: vesselName,
            imo: vesselImo ? `IMO ${vesselImo}` : '',
        },
        pol: { ...contractData.pol, ...pol, name: loadPort },
        pod: { ...contractData.pod, ...pod, name: dischargePort },
        cargo: {
            ...contractData.cargo,
            description: cargoType,
            quantity: Number.isFinite(Number(cargoQty)) ? `${formatTrackingNumber(cargoQty)} MT` : '',
        },
        phase: live.phase ? `Fase ${live.phase} de 6` : activeVoyage.currentPhase ? `Fase ${activeVoyage.currentPhase} de 6` : '',
        lastSync: source.generatedAt || activeVoyage.updatedAt ? `Sync ${formatTrackingTime(source.generatedAt || activeVoyage.updatedAt)}` : '',
        voyage: hasVoyageData ? {
            reference: contract.reference || activeVoyage.reference || trackingState.contractRef || '',
            vesselName,
            imo: vesselImo,
            cargoType,
            cargoQty,
            cargoUnit: activeVoyage.cargoUnit || '',
            loadPort,
            dischargePort,
            operationalPhase,
            operationalPhaseLabel: activeVoyage.operationalPhaseLabel || '',
            routeProgressPct,
            laydaysStartAt: contract.laydaysStartAt || activeVoyage.laydaysStartAt || null,
            cancellingAt: contract.cancellingAt || activeVoyage.cancellingAt || null,
            live: {
                ...liveMetrics,
                aisUpdatedAt: trackingState.basicVessel?.timestamp || live.aisUpdatedAt || null,
            },
            alerts: voyageAlerts,
        } : null,
        laytime: laytimeProjection || source.laytime || activeVoyage.laytime || {},
        isLoading: trackingState.activeVoyageLoading || trackingState.loading,
        loadError: trackingState.activeVoyageError,
    };
}

function unmountExecutiveDashboard() {
    if (!trackingState.executiveRoot) return;
    trackingState.executiveRoot.unmount();
    trackingState.executiveRoot = null;
}

function renderExecutiveDashboard() {
    if (trackingState.activeTab !== 'executive') {
        unmountExecutiveDashboard();
        return;
    }
    const mount = document.getElementById('tracking-executive-root');
    if (!mount) return;
    trackingState.executiveRoot ||= createRoot(mount);
    trackingState.executiveRoot.render(React.createElement(DashboardExecutive, { contractData: getExecutiveContractData() }));
}

function setTrackingActiveTab(activeTab) {
    trackingState.activeTab = activeTab === 'executive' ? 'executive' : 'gis';
    const executiveActive = trackingState.activeTab === 'executive';
    document.getElementById('tracking-live-shell')?.classList.toggle('is-gis-active', !executiveActive);
    document.getElementById('tracking-gis-view')?.toggleAttribute('hidden', executiveActive);
    document.getElementById('tracking-executive-view')?.toggleAttribute('hidden', !executiveActive);
    document.querySelectorAll('[data-tracking-tab]').forEach((button) => {
        const selected = button.dataset.trackingTab === trackingState.activeTab;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    const title = document.getElementById('tracking-live-title');
    if (title) title.textContent = executiveActive ? 'Dashboard Ejecutivo & Laytime' : 'Tracking GIS';
    if (executiveActive) renderExecutiveDashboard();
    else {
        unmountExecutiveDashboard();
        if (trackingMapResizeFrameId !== null) window.cancelAnimationFrame(trackingMapResizeFrameId);
        trackingMapResizeFrameId = window.requestAnimationFrame(() => {
            trackingMapResizeFrameId = null;
            window.GlobalFleetGlobe?.resize?.(TRACKING_MAP_KEY);
        });
    }
}

function createTrackingOverlay() {
    if (document.getElementById('tracking-live-overlay')) return;
    const overlay = document.createElement('section');
    overlay.id = 'tracking-live-overlay';
    overlay.className = 'tracking-live-overlay theme-light text-sm';
    overlay.setAttribute('role', 'region');
    overlay.setAttribute('aria-label', 'Tracking GIS y Dashboard Ejecutivo');
    overlay.innerHTML = `
        <div class="tracking-live-topbar ecosystem-panel">
            <div class="tracking-live-context"><span class="tracking-live-connection" id="tracking-live-connection">GIS disponible</span><span id="tracking-live-last-sync">Modo ruta libre</span><span data-tracking-datalastic-credit></span></div>
            <nav class="tracking-live-tabs" role="tablist" aria-label="Vistas del contrato">
                <button type="button" class="tracking-live-tab is-active" role="tab" aria-selected="true" aria-controls="tracking-gis-view" data-tracking-tab="gis"><i class="fa-solid fa-earth-europe" aria-hidden="true"></i><span>Tracking GIS</span></button>
                <button type="button" class="tracking-live-tab" role="tab" aria-selected="false" aria-controls="tracking-executive-view" data-tracking-tab="executive" tabindex="-1"><i class="fa-solid fa-chart-line" aria-hidden="true"></i><span>Dashboard Ejecutivo &amp; Laytime</span></button>
            </nav>
            <div class="tracking-live-actions">
                <button type="button" class="tracking-live-refresh map-icon-button" id="tracking-live-refresh" aria-label="Actualizar datos"><i class="fa-solid fa-rotate"></i></button>
                <button type="button" class="tracking-live-close map-icon-button" id="tracking-live-close" aria-label="Cerrar tracking"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <main class="tracking-live-shell is-gis-active print:h-auto print:min-h-full print:overflow-visible print:block" id="tracking-live-shell">
            <div class="tracking-tab-view print:hidden" id="tracking-gis-view" role="tabpanel">
            <section class="tracking-map-stage">
                <div class="tracking-map-canvas" id="tracking-globe" aria-label="Globo GIS con ruta marítima y posición AIS"></div>
                <div class="tracking-map-atmosphere" aria-hidden="true"></div>
                <aside class="tracking-input-drawer map-floating-panel route-sync-card ecosystem-panel" id="tracking-input-drawer">
                    <button type="button" class="tracking-drawer-toggle map-icon-button" id="tracking-drawer-toggle" aria-label="Contraer panel de entrada"><i class="fa-solid fa-chevron-left"></i></button>
                    <div class="tracking-drawer-scroll">
                        <div class="tracking-drawer-heading"><span>01 / Voyage input</span><h2>Tracking contractual<br>o búsqueda libre</h2><p>Recupera un viaje completo por referencia o localiza directamente un buque mediante telemetría AIS.</p></div>
                        <div class="tracking-flow-status" id="tracking-flow-status" data-mode="free"><span class="tracking-flow-dot"></span><strong>Observación libre</strong><small>Solo posición AIS, sin ruta ni datos comerciales</small></div>
                        <button type="button" id="tracking-free-reset" class="tracking-route-button btn-light-action"><i class="fa-solid fa-location-dot"></i><span>Tracking Libre / Reset</span></button>
                        <form id="tracking-reference-search-form" class="tracking-contract-search input-group">
                            <label for="tracking-live-contract-ref">Referencia contractual <small>PREMIUM</small></label>
                            <div><input class="input-gc" id="tracking-live-contract-ref" type="text" autocomplete="off" spellcheck="false" maxlength="80" placeholder="SHM/RSB/2026-XXXX"><button type="submit" class="btn-light-action" aria-label="Buscar contrato"><i class="fa-solid fa-arrow-right"></i></button></div>
                        </form>
                        <div class="tracking-flow-divider"><span>o</span></div>
                        <form id="tracking-vessel-search-form" class="tracking-contract-search input-group">
                            <label for="tracking-input-vessel">Buque / IMO / MMSI <small>BÁSICO</small></label>
                            <div><input class="input-gc" id="tracking-input-vessel" type="text" autocomplete="off" spellcheck="false" placeholder="Nombre, IMO o MMSI"><button type="submit" class="btn-light-action" aria-label="Buscar buque en telemetría AIS"><i class="fa-solid fa-location-crosshairs"></i></button></div>
                        </form>
                        <div class="tracking-input-grid">
                            <label class="input-group"><span>Puerto previo <small>LASTRE</small></span><input class="input-gc" id="tracking-input-ballast" type="text" placeholder="Puerto de procedencia" autocomplete="off" inputmode="text" spellcheck="false"></label>
                            <label class="input-group"><span>Puerto de carga <small>POL</small></span><input class="input-gc" id="tracking-input-pol" type="text" placeholder="Puerto de carga" autocomplete="off" inputmode="text" spellcheck="false"></label>
                            <label class="input-group"><span>Puerto de descarga <small>POD</small></span><input class="input-gc" id="tracking-input-pod" type="text" placeholder="Puerto de descarga" autocomplete="off" inputmode="text" spellcheck="false"></label>
                            <div class="tracking-field-pair"><label class="input-group"><span>Laydays</span><input class="input-gc" id="tracking-input-laydays" type="date"></label><label class="input-group"><span>Cancelling</span><input class="input-gc" id="tracking-input-cancelling" type="date"></label></div>
                            <label class="input-group"><span>Carga a transportar</span><input class="input-gc" id="tracking-input-cargo" type="text" placeholder="Producto y toneladas"></label>
                        </div>
                        <button type="button" id="tracking-calculate-route" class="tracking-route-button btn-light-action"><i class="fa-solid fa-route"></i><span>Calcular ruta marítima</span></button>
                        <p class="tracking-input-message" id="tracking-input-message">Introduce los datos del viaje para iniciar Tracking.</p>
                    </div>
                </aside>
                <div class="tracking-map-hud ecosystem-panel">
                    <span class="tracking-map-hud-label">Ruta activa</span>
                    <strong id="tracking-map-route-label"></strong>
                    <span id="tracking-map-route-distance"></span>
                </div>
                <article class="tracking-ais-card ecosystem-panel" id="tracking-ais-card" hidden aria-hidden="true">
                    <div class="tracking-ais-card-head"><span class="tracking-ais-pulse"></span><span>Posición AIS</span><time id="tracking-ais-time"></time></div>
                    <strong id="tracking-ais-vessel"></strong>
                    <span class="tracking-ais-details" id="tracking-ais-details"></span>
                    <span id="tracking-ais-position"></span>
                    <span class="tracking-ais-navigation" id="tracking-ais-navigation"></span>
                </article>
                <aside class="tracking-alerts-panel tracking-alerts-map-panel ecosystem-panel" id="tracking-alerts-panel">
                    <div class="tracking-panel-heading"><div><div class="tracking-panel-kicker">Motor contractual</div><h2 class="tracking-panel-title">Alertas en tiempo real</h2></div><span class="tracking-alert-count" id="tracking-alert-count">0</span></div>
                    <div class="tracking-alert-list" id="tracking-alert-list"><div class="tracking-alerts-empty">Vincula un contrato para activar alertas operativas.</div></div>
                </aside>
                <div class="tracking-map-summary ecosystem-panel" id="tracking-map-summary">
                    <div class="tracking-contract-identity"><span id="tracking-contract-status">EMPTY</span><div><strong id="tracking-contract-ref-label">Sin viaje activo</strong><small id="tracking-contract-subtitle">Neon todavía no ha devuelto datos operativos</small></div></div>
                    <div class="tracking-metrics" id="tracking-live-metrics"></div>
                </div>
            </section>
            <section class="tracking-analytics" id="tracking-live-content">
                <div class="tracking-state-card ecosystem-panel is-manual"><span class="tracking-state-orbit"><i class="fa-solid fa-route"></i></span><div><h2>Tracking preparado</h2><p>Introduce una referencia o los datos del viaje para comenzar.</p></div></div>
            </section>
            </div>
            <section class="tracking-tab-view tracking-executive-view print:h-auto print:min-h-full print:overflow-visible print:block" id="tracking-executive-view" role="tabpanel" hidden>
                <div class="print:h-auto print:min-h-full print:overflow-visible print:block" id="tracking-executive-root"></div>
            </section>
        </main>`;
    (document.querySelector('main.app-main') || document.body).appendChild(overlay);
    mountDatalasticCreditCounter(overlay.querySelector('[data-tracking-datalastic-credit]'), {
        rootId: 'tracking-ais-consumption',
        valueId: 'tracking-ais-consumption-count',
        variant: 'tracking',
        showLimit: true,
    });
    const contractInput = document.getElementById('tracking-live-contract-ref');
    if (contractInput) contractInput.value = '';

    document.getElementById('tracking-live-close')?.addEventListener('click', closeTrackingLive);
    document.querySelectorAll('[data-tracking-tab]').forEach((button) => button.addEventListener('click', () => setTrackingActiveTab(button.dataset.trackingTab)));
    document.getElementById('tracking-live-refresh')?.addEventListener('click', () => {
        const vesselQuery = document.getElementById('tracking-input-vessel')?.value.trim();
        if (trackingState.data && trackingState.contractRef) {
            stopLaytimeRequest();
            loadTrackingContract(trackingState.contractRef, true);
        } else if (vesselQuery) {
            void loadTrackingVessel(vesselQuery, true);
        } else {
            const context = getManualTrackingContext();
            if (context.pol && context.pod) void calculateTrackingRoute();
            else renderManualTrackingState();
        }
    });
    document.getElementById('tracking-free-reset')?.addEventListener('click', activateFreeTrackingMode);
    document.getElementById('tracking-reference-search-form')?.addEventListener('submit', onSearchReference);
    document.getElementById('tracking-vessel-search-form')?.addEventListener('submit', onSearchVessel);
    document.getElementById('tracking-live-contract-ref')?.addEventListener('input', (event) => {
        const contractRef = normalizeTrackingRef(event.currentTarget.value);
        if (!contractRef) {
            if (trackingState.contractRef) clearTrackingContract();
        }
    });
    document.getElementById('tracking-calculate-route')?.addEventListener('click', calculateTrackingRoute);
    document.getElementById('tracking-drawer-toggle')?.addEventListener('click', toggleTrackingDrawer);
    ['ballast', 'pol', 'pod'].forEach((field) => document.getElementById(`tracking-input-${field}`)?.addEventListener('change', handleTrackingPortChange));
    ['laydays', 'cancelling', 'cargo'].forEach((field) => document.getElementById(`tracking-input-${field}`)?.addEventListener('change', () => {
        if (!trackingState.data) renderManualTrackingState();
    }));
    ['ballast', 'pol', 'pod'].forEach((field) => window.bindUniversalPortAutocomplete?.(document.getElementById(`tracking-input-${field}`)));
    bindTrackingStoreToGlobe();
}

function onSearchReference(event) {
    event?.preventDefault?.();
    return loadTrackingContract(document.getElementById('tracking-live-contract-ref')?.value);
}

function onSearchVessel(event) {
    event?.preventDefault?.();
    const query = document.getElementById('tracking-input-vessel')?.value;
    if (!trackingState.data) {
        trackingState.contractRef = '';
        const contractInput = document.getElementById('tracking-live-contract-ref');
        if (contractInput) contractInput.value = '';
        trackingStore.getState().clearContract();
        trackingStore.getState().setMode(trackingState.flowMode);
        setTrackingFlowMode(trackingState.flowMode);
    }
    return loadTrackingVessel(query);
}

function handleTrackingPortChange() {
    if (trackingState.flowMode === 'free') return;
    const context = getManualTrackingContext();
    if (!trackingState.data) renderManualTrackingState();
    if (context.pol && context.pod) {
        void calculateTrackingRoute();
        return;
    }
    const message = document.getElementById('tracking-input-message');
    message.textContent = hasTrackingVoyageData()
        ? 'Completa POL y POD del viaje activo para calcular.'
        : 'Esperando viaje activo desde Neon.';
    message.dataset.state = 'neutral';
}

function toggleTrackingDrawer() {
    const drawer = document.getElementById('tracking-input-drawer');
    const collapsed = drawer?.classList.toggle('is-collapsed');
    document.getElementById('tracking-drawer-toggle')?.setAttribute('aria-label', collapsed ? 'Expandir panel de entrada' : 'Contraer panel de entrada');
    if (trackingMapResizeTimerId !== null) window.clearTimeout(trackingMapResizeTimerId);
    trackingMapResizeTimerId = window.setTimeout(() => {
        trackingMapResizeTimerId = null;
        window.GlobalFleetGlobe?.resize?.(TRACKING_MAP_KEY);
    }, 260);
}

async function ensureTrackingMap(lifecycleToken = trackingMapLifecycleToken) {
    if (trackingState.mapMounted) return window.GlobalFleetGlobe?.getInstance?.(TRACKING_MAP_KEY) || null;
    trackingMapLoadPromise ||= import('./src/map-cartography-loader.js')
        .then(({ ensureGlobalFleetGlobeLoaded }) => ensureGlobalFleetGlobeLoaded())
        .catch((error) => {
            trackingMapLoadPromise = null;
            console.error('[Tracking] No se pudo cargar el módulo cartográfico.', error);
            throw error;
        });
    const globeApi = await trackingMapLoadPromise;
    const trackingOverlayOpen = document.getElementById('tracking-live-overlay')?.classList.contains('is-open');
    if (lifecycleToken !== trackingMapLifecycleToken || !trackingOverlayOpen) return null;
    const instance = globeApi.mount?.({ containerId: 'tracking-globe', key: TRACKING_MAP_KEY, vesselsData: [], restoreRouteState: false });
    trackingState.mapMounted = Boolean(instance);
    return instance || null;
}

let trackingStoreUnsubscribe = null;

function bindTrackingStoreToGlobe() {
    if (trackingStoreUnsubscribe) return;
    trackingStoreUnsubscribe = trackingStore.subscribe((state, previousState) => {
        if (state.contractPayload !== previousState.contractPayload && state.contractPayload) {
            syncTrackingMap(state.contractPayload);
        }
        if (state.vessel !== previousState.vessel) {
            trackingState.basicVessel = state.vessel;
            syncBasicVesselMap(Boolean(state.vessel));
            renderExecutiveDashboard();
        }
    });
}

function clearTrackingMapVisuals() {
    ensureTrackingMap();
    trackingState.routes = { ballast: [], laden: [] };
    trackingState.routeDistance = null;
    window.GlobalFleetGlobe?.updateVessels?.([], TRACKING_MAP_KEY);
    window.GlobalFleetGlobe?.setRouteSegments?.({}, TRACKING_MAP_KEY, { focus: false, persist: false }, trackingState.routes);
}

function setInputPort(id, port) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = port?.name || port?.id || '';
    const point = normalizeMapPoint(port);
    if (point) {
        input.dataset.lat = String(point.lat);
        input.dataset.lng = String(point.lng);
    } else {
        delete input.dataset.lat;
        delete input.dataset.lng;
    }
}

function toDateInputValue(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function populateTrackingInputs(data) {
    const contract = data.contract || {};
    setInputPort('tracking-input-ballast', contract.previousPort);
    setInputPort('tracking-input-pol', contract.pol);
    setInputPort('tracking-input-pod', contract.pod);
    document.getElementById('tracking-input-laydays').value = toDateInputValue(contract.laydaysStartAt);
    document.getElementById('tracking-input-cancelling').value = toDateInputValue(contract.cancellingAt);
    document.getElementById('tracking-input-vessel').value = [contract.vesselName, contract.vesselImo && `IMO ${contract.vesselImo}`].filter(Boolean).join(' · ');
    document.getElementById('tracking-input-cargo').value = [contract.cargoName, Number.isFinite(Number(contract.cargoQuantityMt)) && `${formatTrackingNumber(contract.cargoQuantityMt)} MT`].filter(Boolean).join(' · ');
    setContractFieldsReadOnly(true);
    setTrackingFlowMode('contract');
}

function populateActiveVoyageInputs(voyage) {
    document.getElementById('tracking-live-contract-ref').value = voyage?.reference || '';
    setInputPort('tracking-input-ballast', null);
    setInputPort('tracking-input-pol', voyage?.loadPort);
    setInputPort('tracking-input-pod', voyage?.dischargePort);
    document.getElementById('tracking-input-laydays').value = toDateInputValue(voyage?.laydaysStartAt);
    document.getElementById('tracking-input-cancelling').value = toDateInputValue(voyage?.cancellingAt);
    document.getElementById('tracking-input-vessel').value = [voyage?.vesselName, voyage?.imo && `IMO ${voyage.imo}`].filter(Boolean).join(' · ');
    document.getElementById('tracking-input-cargo').value = [voyage?.cargoType, Number.isFinite(Number(voyage?.cargoQty)) && `${formatTrackingNumber(voyage.cargoQty)} ${voyage?.cargoUnit || 'MT'}`].filter(Boolean).join(' · ');
    setContractFieldsReadOnly(Boolean(voyage));
}

function populateDraftVoyageInputs(draft = getVoyageDraft()) {
    document.getElementById('tracking-live-contract-ref').value = '';
    setInputPort('tracking-input-ballast', null);
    setInputPort('tracking-input-pol', draft?.pol);
    setInputPort('tracking-input-pod', draft?.pod);
    document.getElementById('tracking-input-laydays').value = toDateInputValue(draft?.laycan?.laydays);
    document.getElementById('tracking-input-cancelling').value = toDateInputValue(draft?.laycan?.cancelling);
    document.getElementById('tracking-input-vessel').value = draft?.vessel?.imo || '';
    document.getElementById('tracking-input-cargo').value = [draft?.cargo?.description, draft?.cargo?.quantityMt && `${formatTrackingNumber(draft.cargo.quantityMt)} MT`].filter(Boolean).join(' · ');
    setContractFieldsReadOnly(false);
}

function setTrackingFlowMode(mode = 'idle') {
    trackingState.flowMode = mode;
    trackingStore.getState().setMode(mode);
    const status = document.getElementById('tracking-flow-status');
    const drawer = document.getElementById('tracking-input-drawer');
    if (status) {
        status.dataset.mode = mode;
        status.querySelector('strong').textContent = mode === 'contract' ? 'Ejecución contractual' : mode === 'audit' ? 'Auditoría pre-fixture' : 'Observación libre';
        status.querySelector('small').textContent = mode === 'contract'
            ? 'Campos dictados por la referencia contractual'
            : mode === 'audit'
                ? 'Lastre real: posición viva → POL del DraftVoyage'
                : 'Solo posición AIS, sin ruta ni datos comerciales';
    }
    if (drawer) drawer.dataset.flow = mode;
    const routeButton = document.getElementById('tracking-calculate-route');
    const routeButtonLabel = routeButton?.querySelector('span');
    if (routeButton) routeButton.disabled = mode === 'free';
    if (routeButtonLabel) routeButtonLabel.textContent = mode === 'audit' ? 'Calcular lastre real' : mode === 'contract' ? 'Actualizar ruta contractual' : 'Ruta desactivada en modo libre';
}

function setContractFieldsReadOnly(isReadOnly) {
    CONTRACT_CONTROL_IDS.forEach((id) => {
        const control = document.getElementById(id);
        if (!control) return;
        control.readOnly = isReadOnly;
        control.setAttribute('aria-readonly', String(isReadOnly));
        control.classList.toggle('is-contract-locked', isReadOnly);
    });
    const routeButton = document.getElementById('tracking-calculate-route');
    if (routeButton) routeButton.disabled = isReadOnly;
}

function setTrackingFormLoading(isLoading) {
    const drawer = document.getElementById('tracking-input-drawer');
    drawer?.setAttribute('aria-busy', String(isLoading));
    [
        'tracking-live-contract-ref',
        'tracking-input-ballast',
        'tracking-input-pol',
        'tracking-input-pod',
        'tracking-input-laydays',
        'tracking-input-cancelling',
        'tracking-input-vessel',
        'tracking-input-cargo',
        'tracking-calculate-route',
    ].forEach((id) => {
        const control = document.getElementById(id);
        if (control) control.disabled = isLoading;
    });
    document.querySelectorAll('#tracking-reference-search-form button[type="submit"], #tracking-vessel-search-form button[type="submit"]').forEach((button) => {
        button.disabled = isLoading;
    });
    if (!isLoading) setContractFieldsReadOnly(Boolean(trackingState.data));
}

function getInputPort(field) {
    const input = document.getElementById(`tracking-input-${field}`);
    if (!input) return null;
    let source = {
        name: input.value,
        lat: Number(input.dataset.lat ?? input.dataset.selectedLatitude),
        lng: Number(input.dataset.lng ?? input.dataset.selectedLongitude),
    };
    if (!Number.isFinite(source.lat) || !Number.isFinite(source.lng)) {
        const found = typeof window.findPortData === 'function' ? window.findPortData(input.value) : null;
        source = { ...found, name: input.value || found?.name };
    }
    const point = normalizeMapPoint(source);
    if (point) {
        input.dataset.lat = String(point.lat);
        input.dataset.lng = String(point.lng);
    }
    return point;
}

async function resolveTrackingPort(value) {
    const name = String(value || '').trim();
    if (!name) return null;
    const localPort = typeof window.findPortData === 'function' ? window.findPortData(name) : null;
    const localPoint = normalizeMapPoint(localPort && { ...localPort, name });
    if (localPoint) return localPoint;
    if (typeof window.searchNominatimPortSuggestions !== 'function') return null;
    const suggestions = await window.searchNominatimPortSuggestions(name, { limit: 1 });
    const result = suggestions?.[0];
    return normalizeMapPoint(result && {
        name: result.label || name,
        lat: result.lat,
        lon: result.lon,
    });
}

async function applyBasicAisDestination(rawDestination) {
    if (hasTrackingVoyageData()) return null;
    const destination = normalizeAisDestination(rawDestination);
    if (!destination) return null;
    const podInput = document.getElementById('tracking-input-pod');
    if (!podInput) return null;
    podInput.value = destination.name;
    if (destination.locode) podInput.dataset.locode = destination.locode;
    else delete podInput.dataset.locode;
    const point = await resolveTrackingPort(destination.searchQuery);
    if (!point) return null;
    setInputPort('tracking-input-pod', { ...point, name: destination.name });
    if (destination.locode) podInput.dataset.locode = destination.locode;
    return { ...point, name: destination.name, locode: destination.locode };
}

async function calculateEphemeralTrackingRoute(origin, destination, options = {}) {
    const response = await fetch('/api/route', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            coordinates: [
                [origin.lng, origin.lat],
                [destination.lng, destination.lat],
            ],
            coordinateOrder: 'lonLat',
        }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success || !Array.isArray(payload.coordinates) || payload.coordinates.length < 3) {
        throw new Error('El motor marítimo no devolvió una polilínea navegable por agua.');
    }
    const isBallastAudit = options.routeKind === 'ballast';
    const result = {
        portBallast: isBallastAudit ? `POS - ${origin.name}` : '',
        pol: isBallastAudit ? `POL - ${destination.name}` : origin.name,
        pod: isBallastAudit ? '' : destination.name,
        coordinates: isBallastAudit
            ? {
                ballast: { ...origin, name: `POS - ${origin.name}` },
                pol: { ...destination, name: `POL - ${destination.name}` },
                pod: null,
            }
            : { ballast: null, pol: origin, pod: destination },
        routes: isBallastAudit
            ? { ballast: { ...payload, distance: Number(payload.distance || 0) }, laden: null }
            : { ballast: null, laden: { ...payload, distance: Number(payload.distance || 0) } },
        distBallast: isBallastAudit ? Number(payload.distance || 0) : 0,
        distLaden: isBallastAudit ? 0 : Number(payload.distance || 0),
        totalMiles: Number(payload.distance || 0),
    };
    trackingState.routes = result.routes;
    trackingState.routeDistance = result.totalMiles;
    window.GlobalFleetGlobe?.setRouteResult?.(result, TRACKING_MAP_KEY, { focus: options.focus !== false, persist: false });
    document.getElementById('tracking-map-route-label').textContent = `${origin.name} → ${destination.name}`;
    document.getElementById('tracking-map-route-distance').textContent = `${formatTrackingNumber(result.totalMiles, { maximumFractionDigits: 0 })} NM · ${isBallastAudit ? 'lastre auditado' : 'ruta efímera'}`;
    renderManualTrackingState(result.totalMiles);
    return result;
}

async function requestTrackingMaritimeLeg(origin, destination) {
    console.log('Coordinates:', { origin, destination });
    const response = await fetch('/api/route', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            origin: { name: origin.name, lat: origin.lat, lon: origin.lng },
            destination: { name: destination.name, lat: destination.lat, lon: destination.lng },
        }),
    });
    const payload = await response.json().catch(() => ({}));
    console.log('Routing Response:', payload);
    const distance = Number(payload?.distance);
    const routeGeometry = asTrackingArray(payload?.coordinates);
    if (!response.ok || !payload?.success || !Number.isFinite(distance) || distance <= 0 || routeGeometry.length < 3) {
        throw new Error('El motor marítimo no devolvió distancia y geometría navegable válidas.');
    }
    return { ...payload, distance, coordinates: routeGeometry };
}

async function calculateContractualTrackingRoute(context) {
    const aisPosition = getBasicVesselPosition();
    const [contractBallast, pol, pod] = await Promise.all([
        context.ballast ? (getInputPort('ballast') || resolveTrackingPort(context.ballast)) : null,
        getInputPort('pol') || resolveTrackingPort(context.pol),
        getInputPort('pod') || resolveTrackingPort(context.pod),
    ]);
    const ballast = aisPosition
        ? {
            ...aisPosition,
            name: trackingState.basicVessel?.name || context.vessel || 'Posición AIS',
            source: 'ais',
        }
        : contractBallast;
    console.log('Coordinates:', { ballast, pol, pod });
    if (!pol || !pod || (!aisPosition && context.ballast && !contractBallast)) {
        const unresolved = [!aisPosition && context.ballast && !contractBallast ? 'LASTRE' : '', !pol ? 'POL' : '', !pod ? 'POD' : ''].filter(Boolean);
        throw new Error(`No se localizaron coordenadas válidas para: ${unresolved.join(', ')}.`);
    }

    const [ballastRoute, ladenRoute] = await Promise.all([
        ballast ? requestTrackingMaritimeLeg(ballast, pol) : null,
        requestTrackingMaritimeLeg(pol, pod),
    ]);
    const distBallast = ballastRoute ? Number(ballastRoute.distance) : 0;
    const distLaden = Number(ladenRoute.distance);
    return {
        portBallast: ballast?.name || '',
        pol: pol.name || context.pol,
        pod: pod.name || context.pod,
        coordinates: { ballast, pol, pod },
        routes: { ballast: ballastRoute, laden: ladenRoute },
        distBallast,
        distLaden,
        totalMiles: distBallast + distLaden,
        routeGeometry: ladenRoute.coordinates,
        success: true,
    };
}

function syncTrackingRouteStores(result) {
    const totalDistance = Number(result?.totalMiles || 0);
    if (!Number.isFinite(totalDistance) || totalDistance <= 0 || !result?.routes?.laden) {
        throw new Error('La ruta calculada no contiene millas marítimas utilizables.');
    }
    trackingState.routes = result.routes;
    trackingState.routeDistance = totalDistance;
    trackingStore.getState().setOperationalMetrics?.({
        totalDistanceNm: totalDistance,
        ballastDistanceNm: Number(result.distBallast || 0),
        ladenDistanceNm: Number(result.distLaden || 0),
        aisSpeedKnots: Number(trackingState.basicVessel?.speedKnots || trackingState.basicVessel?.speed || 0) || null,
        aisUpdatedAt: trackingState.basicVessel?.timestamp || trackingState.basicVessel?.positionUpdatedAt || null,
    });
    window.SeaCharterStore?.set?.({
        portBallast: result.portBallast,
        pol: result.pol,
        pod: result.pod,
        polCoordinates: result.coordinates?.pol,
        podCoordinates: result.coordinates?.pod,
        distBallast: Number(result.distBallast || 0),
        distLaden: Number(result.distLaden || 0),
        totalMiles: totalDistance,
        distanceNm: totalDistance,
        routeGeometry: result,
    }, { force: true, source: 'tracking-route-refresh' });
    voyageStore.getState().applyTrackingRoute?.({
        distanceNm: totalDistance,
        routeGeometry: result,
        ballastDistanceNm: result.distBallast,
        lastreCoordinates: result.routes?.ballast?.coordinates,
    });
    renderExecutiveDashboard();
}

function hydrateDraftBallastRoute() {
    const draft = getVoyageDraft();
    const coordinates = Array.isArray(draft?.lastreCoordinates) ? draft.lastreCoordinates : [];
    if (trackingState.flowMode !== 'audit' || coordinates.length < 3) return false;
    const origin = normalizeMapPoint(coordinates[0]);
    const destination = normalizeMapPoint(coordinates[coordinates.length - 1]);
    if (!origin || !destination) return false;
    const distance = Number(draft?.ballastDistanceNm || 0);
    const vesselName = draft?.vessel?.name || 'Buque';
    const polName = draft?.pol?.name || 'POL';
    const result = {
        portBallast: `POS - ${vesselName}`,
        pol: `POL - ${polName}`,
        pod: '',
        coordinates: {
            ballast: { ...origin, name: `POS - ${vesselName}` },
            pol: { ...destination, name: `POL - ${polName}` },
            pod: null,
        },
        routes: {
            ballast: { coordinates, distance },
            laden: null,
        },
        distBallast: distance,
        distLaden: 0,
        totalMiles: distance,
    };
    trackingState.routes = result.routes;
    trackingState.routeDistance = distance;
    window.GlobalFleetGlobe?.setRouteResult?.(result, TRACKING_MAP_KEY, { focus: true, persist: false });
    document.getElementById('tracking-map-route-label').textContent = `${vesselName} → ${polName}`;
    document.getElementById('tracking-map-route-distance').textContent = `${formatTrackingNumber(distance, { maximumFractionDigits: 0 })} NM · lastre auditado`;
    return true;
}

async function calculateTrackingRoute(options = {}) {
    ensureTrackingMap();
    const context = getManualTrackingContext();
    const message = document.getElementById('tracking-input-message');
    const button = document.getElementById('tracking-calculate-route');
    const vesselPosition = getBasicVesselPosition();
    if (trackingState.flowMode === 'free') {
        message.textContent = 'Tracking Libre solo geolocaliza la posición viva del buque.';
        message.dataset.state = 'neutral';
        return;
    }
    if (trackingState.flowMode === 'audit') {
        const pol = getInputPort('pol') || await resolveTrackingPort(context.pol);
        if (!vesselPosition || !pol) {
            message.textContent = !vesselPosition ? 'Localiza un IMO para calcular el lastre real.' : 'El POL del DraftVoyage no tiene coordenadas válidas.';
            message.dataset.state = 'warning';
            return;
        }
        button?.classList.add('is-loading');
        message.textContent = 'Calculando lastre real desde la posición viva hasta POL…';
        message.dataset.state = 'loading';
        try {
            const result = await calculateEphemeralTrackingRoute({ ...vesselPosition, name: trackingState.basicVessel?.name || 'Posición viva' }, pol, { ...options, routeKind: 'ballast' });
            voyageStore.getState().applyTrackingAudit({
                ballastDistanceNm: result.distBallast,
                lastreCoordinates: result.routes?.ballast?.coordinates,
                vessel: trackingState.basicVessel,
            });
            message.textContent = `Lastre auditado: ${formatTrackingNumber(result.distBallast, { maximumFractionDigits: 0 })} NM hasta ${pol.name}. Datos devueltos al DraftVoyage.`;
            message.dataset.state = 'success';
            return result;
        } catch (error) {
            message.textContent = error?.message || 'No fue posible calcular el lastre real.';
            message.dataset.state = 'error';
            return;
        } finally {
            button?.classList.remove('is-loading');
        }
    }
    const pod = getInputPort('pod') || await resolveTrackingPort(context.pod);
    const useEphemeralRoute = !hasTrackingVoyageData() && vesselPosition && pod;
    if (!useEphemeralRoute && (!context.pol || !context.pod)) {
        message.textContent = vesselPosition
            ? 'Introduce o resuelve el Puerto de Descarga (POD).'
            : 'Introduce Puerto de Carga (POL) y Puerto de Descarga (POD).';
        message.dataset.state = 'error';
        return;
    }
    button?.classList.add('is-loading');
    message.textContent = 'Calculando corredores marítimos…';
    message.dataset.state = 'loading';
    try {
        if (useEphemeralRoute) {
            const vesselName = trackingState.basicVessel?.name || context.vessel || 'Posición actual del buque';
            const origin = { ...vesselPosition, name: vesselName };
            const result = await calculateEphemeralTrackingRoute(origin, pod, options);
            message.textContent = `POD resuelto y ruta efímera dibujada hasta ${result.pod}.`;
            message.dataset.state = 'success';
            return result;
        }
        let result;
        try {
            result = await calculateContractualTrackingRoute(context);
        } catch (routeError) {
            if (typeof window.calculateVoyageRouteService !== 'function') throw routeError;
            result = await window.calculateVoyageRouteService({
                portBallast: context.ballast,
                pol: context.pol,
                pod: context.pod,
                geocode: true,
            });
            const fallbackRoutes = [result?.routes?.ballast, result?.routes?.laden].filter(Boolean);
            const hasNavigableGeometry = fallbackRoutes.every((route) => route?.success !== false && asTrackingArray(route?.coordinates).length >= 3);
            if (!hasNavigableGeometry) throw routeError;
        }
        if (!result?.coordinates?.pol || !result?.coordinates?.pod || !result?.routes?.laden) {
            throw new Error(result?.errors?.length ? `No se localizaron: ${result.errors.join(', ')}.` : 'No fue posible localizar POL y POD.');
        }
        syncTrackingRouteStores(result);
        window.GlobalFleetGlobe?.setRouteResult?.(result, TRACKING_MAP_KEY, { focus: true, persist: false });
        const totalDistance = Number(result.totalMiles || 0);
        setInputPort('tracking-input-ballast', result.coordinates.ballast && { ...result.coordinates.ballast, name: result.portBallast });
        setInputPort('tracking-input-pol', { ...result.coordinates.pol, name: result.pol });
        setInputPort('tracking-input-pod', { ...result.coordinates.pod, name: result.pod });
        document.getElementById('tracking-map-route-label').textContent = result.pol && result.pod ? `${result.pol} → ${result.pod}` : '';
        document.getElementById('tracking-map-route-distance').textContent = `${formatTrackingNumber(totalDistance, { maximumFractionDigits: 0 })} NM · lastre + laden`;
        if (!trackingState.data) renderManualTrackingState(totalDistance);
        message.textContent = trackingState.data ? 'Ruta contractual, Dashboard y estado compartido actualizados.' : 'Ruta manual calculada y sincronizada con el estado compartido.';
        message.dataset.state = 'success';
        return result;
    } catch (error) {
        message.textContent = error?.message || 'Error al calcular la ruta.';
        message.dataset.state = 'error';
        if (options.throwOnError) throw error;
    } finally {
        button?.classList.remove('is-loading');
    }
}

function getManualTrackingContext() {
    return {
        ballast: document.getElementById('tracking-input-ballast')?.value.trim() || '',
        pol: document.getElementById('tracking-input-pol')?.value.trim() || '',
        pod: document.getElementById('tracking-input-pod')?.value.trim() || '',
        laydays: document.getElementById('tracking-input-laydays')?.value || '',
        cancelling: document.getElementById('tracking-input-cancelling')?.value || '',
        vessel: document.getElementById('tracking-input-vessel')?.value.trim() || '',
        cargo: document.getElementById('tracking-input-cargo')?.value.trim() || '',
    };
}

function getBasicVesselPosition() {
    return normalizeMapPoint(trackingState.basicVessel?.position || trackingState.basicVessel);
}

function basicVesselNavigation(vessel = trackingState.basicVessel) {
    if (!vessel) return '';
    const speed = vessel.speedKnots === null || vessel.speedKnots === undefined || vessel.speedKnots === '' ? null : Number(vessel.speedKnots);
    const course = vessel.course === null || vessel.course === undefined || vessel.course === '' ? null : Number(vessel.course);
    const heading = vessel.heading === null || vessel.heading === undefined || vessel.heading === '' ? null : Number(vessel.heading);
    return [
        Number.isFinite(speed) ? `Velocidad ${formatTrackingNumber(speed)} kn` : '',
        Number.isFinite(course) ? `COG ${formatTrackingNumber(course, { maximumFractionDigits: 0 })}°` : '',
        Number.isFinite(heading) ? `Heading ${formatTrackingNumber(heading, { maximumFractionDigits: 0 })}°` : '',
    ].filter(Boolean).join(' · ');
}

function syncBasicVesselMap(focus = false) {
    const vessel = trackingState.basicVessel;
    const position = getBasicVesselPosition();
    if (!position && trackingState.data) return;
    const mapVessel = position ? {
        ...vessel,
        name: vessel.name,
        vesselName: vessel.name,
        imo: vessel.imo,
        mmsi: vessel.mmsi,
        lat: position.lat,
        lng: position.lng,
        latitude: position.lat,
        longitude: position.lng,
        speedOverGround: vessel.speedKnots,
        courseOverGround: vessel.course,
        heading: vessel.heading,
    } : null;
    replaceTrackingMapVessels(mapVessel ? [mapVessel] : [], focus ? mapVessel : null);
}

function replaceTrackingMapVessels(vessels, focusedVessel = null) {
    const renderSequence = ++trackingMapVesselRenderSequence;
    void ensureTrackingMap().then((instance) => {
        if (!instance || renderSequence !== trackingMapVesselRenderSequence) return;
        window.GlobalFleetGlobe?.updateVessels?.([], TRACKING_MAP_KEY);
        window.GlobalFleetGlobe?.updateVessels?.(vessels, TRACKING_MAP_KEY);
        if (focusedVessel) window.GlobalFleetGlobe?.focusActiveVessel?.(focusedVessel, TRACKING_MAP_KEY);
    });
}

function hydrateTrackingFromActiveVessel(activeVessel, focus = false) {
    if (!hasTrackingVoyageData()) return false;
    if (!activeVessel || typeof activeVessel !== 'object') return false;
    const normalized = typeof window.normalizeVesselSelectionPayload === 'function'
        ? window.normalizeVesselSelectionPayload(activeVessel)
        : {
            imo: activeVessel.imo || null,
            mmsi: activeVessel.mmsi || null,
            name: activeVessel.name || activeVessel.vesselName || activeVessel.vessel || null,
            lat: Number(activeVessel.lat ?? activeVessel.latitude),
            lon: Number(activeVessel.lon ?? activeVessel.lng ?? activeVessel.longitude),
        };
    if (!normalized.name && !normalized.imo && !normalized.mmsi) return false;
    const hasPosition = Number.isFinite(normalized.lat) && Number.isFinite(normalized.lon);
    trackingState.basicVessel = {
        ...activeVessel,
        name: normalized.name || activeVessel.vesselName || 'Buque seleccionado',
        imo: normalized.imo,
        mmsi: normalized.mmsi,
        position: hasPosition
            ? { lat: normalized.lat, lng: normalized.lon, latitude: normalized.lat, longitude: normalized.lon }
            : normalizeMapPoint(activeVessel.position),
        positionSource: activeVessel.positionSource || activeVessel.source || 'shared_selection',
    };
    const input = document.getElementById('tracking-input-vessel');
    if (input) input.value = trackingState.basicVessel.name || trackingState.basicVessel.mmsi || trackingState.basicVessel.imo || '';
    syncBasicVesselMap(focus);
    if (!trackingState.data) renderManualTrackingState();
    return true;
}

function setTrackingAisCardVisibility(visible) {
    const card = document.getElementById('tracking-ais-card');
    if (!card) return;
    card.hidden = !visible;
    card.setAttribute('aria-hidden', String(!visible));
}

function renderBasicVesselCard() {
    const hasVesselContext = hasTrackingVoyageData() || Boolean(trackingState.basicVessel);
    setTrackingAisCardVisibility(hasVesselContext);
    if (!hasVesselContext) {
        document.getElementById('tracking-ais-vessel').textContent = '';
        document.getElementById('tracking-ais-details').textContent = '';
        document.getElementById('tracking-ais-position').textContent = '';
        document.getElementById('tracking-ais-navigation').textContent = '';
        document.getElementById('tracking-ais-time').textContent = '';
        return;
    }
    const vessel = trackingState.basicVessel;
    const activeVoyage = trackingState.activeVoyage || {};
    const position = getBasicVesselPosition();
    const vesselName = vessel?.name || activeVoyage.vesselName || getManualTrackingContext().vessel || 'Sin buque';
    const vesselDetails = [
        vessel?.imo || activeVoyage.imo ? `IMO ${vessel?.imo || activeVoyage.imo}` : '',
        vessel?.mmsi || activeVoyage.mmsi ? `MMSI ${vessel?.mmsi || activeVoyage.mmsi}` : '',
        vessel?.vesselType || '',
    ].filter(Boolean).join(' · ');
    document.getElementById('tracking-ais-vessel').textContent = vesselName;
    document.getElementById('tracking-ais-details').textContent = vesselDetails;
    document.getElementById('tracking-ais-position').textContent = [
        position ? `Lat ${formatTrackingNumber(position.lat, { minimumFractionDigits: 3 })} · Lon ${formatTrackingNumber(position.lng, { minimumFractionDigits: 3 })}` : '',
        vessel?.destination ? `Destino AIS: ${vessel.destination}` : '',
    ].filter(Boolean).join(' · ');
    document.getElementById('tracking-ais-navigation').textContent = vessel ? basicVesselNavigation(vessel) : '';
    document.getElementById('tracking-ais-time').textContent = vessel?.positionUpdatedAt ? formatTrackingTime(vessel.positionUpdatedAt) : '';
}

function stopTrackingVesselPolling() {
    window.clearInterval(trackingState.vesselPollTimer);
    trackingState.vesselPollTimer = null;
    trackingState.vesselPollQuery = '';
}

function normalizeTrackingVesselQuery(value) {
    const normalized = String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^(?:NOVI\b[\s:|/_-]*)+/i, '')
        .trim();
    const identifierMatch = normalized.match(/^(?:IMO|MMSI)?[\s:#/_-]*([\d\s.-]+)$/i);
    if (!identifierMatch) return normalized;
    const digits = identifierMatch[1].replace(/\D/g, '');
    return digits.length === 7 || digits.length === 9 ? digits : normalized;
}

function getTrackingVesselImo(vessel, fallback = '') {
    const candidates = [vessel?.imo, vessel?.imoNumber, fallback];
    for (const candidate of candidates) {
        const digits = String(candidate || '').replace(/\D/g, '');
        if (digits.length === 7) return digits;
    }
    return '';
}

function mergeCoordinatorTelemetry(vessel, telemetry, meta) {
    if (!vessel || !telemetry) return vessel;
    const position = {
        ...(normalizeMapPoint(vessel.position) || {}),
        lat: telemetry.latitude,
        lng: telemetry.longitude,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
    };
    return {
        ...vessel,
        name: telemetry.name || vessel.name,
        imo: telemetry.imo || vessel.imo,
        mmsi: telemetry.mmsi || vessel.mmsi,
        flag: telemetry.flag || vessel.flag,
        vesselType: telemetry.vesselType || vessel.vesselType,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        lat: telemetry.latitude,
        lng: telemetry.longitude,
        lon: telemetry.longitude,
        position,
        speedKnots: telemetry.speedKnots,
        speedOverGround: telemetry.speedKnots,
        course: telemetry.courseDegrees,
        courseOverGround: telemetry.courseDegrees,
        heading: telemetry.headingDegrees,
        navigationStatus: telemetry.navigationStatus || vessel.navigationStatus,
        destination: telemetry.destination || vessel.destination,
        timestamp: telemetry.positionTimestamp || meta?.fetchedAt || vessel.timestamp,
        positionUpdatedAt: telemetry.positionTimestamp || meta?.fetchedAt || vessel.positionUpdatedAt,
        aisCacheStatus: meta?.cacheStatus || null,
    };
}

async function refreshAisConsumptionMonitor() {
    const widget = document.getElementById('tracking-ais-consumption');
    if (!widget) return null;
    if (trackingState.aisConsumptionRequest) return trackingState.aisConsumptionRequest;
    trackingState.aisConsumptionRequest = (async () => {
        try {
            return await datalasticCreditStore.getState().refresh();
        } finally {
            trackingState.aisConsumptionRequest = null;
        }
    })();
    return trackingState.aisConsumptionRequest;
}

function startAisConsumptionMonitor() {
    void refreshAisConsumptionMonitor();
}

window.addEventListener('ais:consumption-updated', () => {
    if (document.getElementById('tracking-live-overlay')?.classList.contains('is-open')) {
        void refreshAisConsumptionMonitor();
    }
});

async function fetchCoordinatorLivePosition(vessel, fallbackQuery, signal) {
    const imo = getTrackingVesselImo(vessel, fallbackQuery);
    if (!imo) return vessel;
    const response = await fetch(`/api/internal/ais/live-position?imo=${encodeURIComponent(imo)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'No fue posible recuperar la posición AIS coordinada.');
    }
    const latitude = Number(payload.data.latitude);
    const longitude = Number(payload.data.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('La respuesta AIS no contiene coordenadas válidas.');
    }
    void refreshAisConsumptionMonitor();
    return mergeCoordinatorTelemetry(vessel, { ...payload.data, latitude, longitude }, payload.meta);
}

function syncCoordinatorPositionState(vessel) {
    const position = normalizeMapPoint(vessel?.position || vessel);
    if (!position) return;
    trackingState.basicVessel = { ...vessel, position };
    if (trackingState.data) {
        trackingState.data = {
            ...trackingState.data,
            live: {
                ...trackingState.data.live,
                position,
                aisUpdatedAt: vessel.positionUpdatedAt || vessel.timestamp || trackingState.data.live?.aisUpdatedAt,
                averageSpeedKnots: vessel.speedKnots ?? trackingState.data.live?.averageSpeedKnots,
            },
        };
    }
}

function startTrackingVesselPolling(query) {
    const normalizedQuery = normalizeTrackingVesselQuery(query);
    if (!normalizedQuery) return;
    if (trackingState.vesselPollTimer && trackingState.vesselPollQuery === normalizedQuery) return;
    stopTrackingVesselPolling();
    trackingState.vesselPollQuery = normalizedQuery;
    trackingState.vesselPollTimer = window.setInterval(() => loadTrackingVessel(normalizedQuery, true), TRACKING_AIS_POLL_INTERVAL);
}

function scheduleTrackingVesselLookup(event) {
    window.clearTimeout(trackingState.vesselLookupTimer);
    const query = normalizeTrackingVesselQuery(event?.currentTarget?.value);
    if (!query) {
        trackingState.vesselLookupController?.abort();
        stopTrackingVesselPolling();
        trackingState.basicVessel = null;
        syncBasicVesselMap();
        if (!trackingState.data) renderManualTrackingState();
        return;
    }
    stopTrackingVesselPolling();
    if (query.length < 2) return;
    trackingState.vesselLookupTimer = window.setTimeout(() => loadTrackingVessel(query), 550);
}

async function loadTrackingVessel(rawQuery, silent = false) {
    const query = normalizeTrackingVesselQuery(rawQuery);
    if (query.length < 2) {
        const message = document.getElementById('tracking-input-message');
        message.textContent = 'Introduce un nombre, IMO o MMSI para buscar en telemetría AIS.';
        message.dataset.state = 'warning';
        return;
    }
    const input = document.getElementById('tracking-input-vessel');
    if (input && input.value !== query && !silent) input.value = query;
    window.clearTimeout(trackingState.vesselLookupTimer);
    trackingState.vesselLookupController?.abort();
    const controller = new AbortController();
    trackingState.vesselLookupController = controller;
    trackingStore.getState().beginVesselSearch();
    if (!silent) {
        document.getElementById('tracking-ais-vessel').textContent = query;
        document.getElementById('tracking-ais-details').textContent = 'Resolviendo identidad y telemetría AIS coordinada…';
        document.getElementById('tracking-ais-position').textContent = 'Buscando posición disponible';
        document.getElementById('tracking-ais-navigation').textContent = 'Sincronizando velocidad y rumbo…';
        document.getElementById('tracking-ais-time').textContent = 'Sync';
    }

    try {
        const response = await fetch(`/api/v1/vessel/live-profile?q=${encodeURIComponent(query)}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'No se encontró el buque solicitado.');
        }
        if (payload.found === false || !payload.vessel) {
            stopTrackingVesselPolling();
            trackingState.basicVessel = null;
            trackingStore.getState().failVesselSearch(payload.message || 'No se encontró el buque solicitado.');
            if (!trackingState.data) {
                syncBasicVesselMap();
                renderManualTrackingState();
            }
            document.getElementById('tracking-ais-vessel').textContent = query;
            document.getElementById('tracking-ais-details').textContent = payload.message || 'No se encontró una coincidencia. Revisa el nombre, IMO o MMSI.';
            document.getElementById('tracking-ais-position').textContent = '';
            document.getElementById('tracking-ais-navigation').textContent = '';
            document.getElementById('tracking-ais-time').textContent = '';
            return;
        }
        const coordinatedVessel = await fetchCoordinatorLivePosition(payload.vessel, query, controller.signal);
        syncCoordinatorPositionState(coordinatedVessel);
        trackingStore.getState().setVessel(trackingState.basicVessel);
        if (input && coordinatedVessel.name) input.value = coordinatedVessel.name;
        startTrackingVesselPolling(coordinatedVessel.imo || coordinatedVessel.mmsi || coordinatedVessel.name || query);
        syncBasicVesselMap(!silent);
        if (!trackingState.data) {
            setTrackingFlowMode(trackingState.flowMode === 'audit' ? 'audit' : 'free');
            renderManualTrackingState();
            if (trackingState.flowMode === 'audit' && getBasicVesselPosition()) await calculateTrackingRoute({ focus: !silent });
        } else {
            renderTrackingMapChrome(trackingState.data);
            renderTrackingAnalytics(trackingState.data);
            renderExecutiveDashboard();
            if (getBasicVesselPosition()) {
                const routeMessage = document.getElementById('tracking-input-message');
                const previousMessage = routeMessage?.textContent || '';
                const previousState = routeMessage?.dataset.state || '';
                await calculateTrackingRoute({ focus: !silent });
                if (silent && routeMessage) {
                    routeMessage.textContent = previousMessage;
                    routeMessage.dataset.state = previousState;
                }
            }
        }
        if (!silent) {
            const message = document.getElementById('tracking-input-message');
            if (trackingState.flowMode === 'audit' && trackingState.routeDistance !== null) {
                message.textContent = 'Buque localizado y lastre real devuelto al DraftVoyage.';
            } else message.textContent = 'Buque localizado y centrado en el mapa. Tracking Libre no calcula rutas.';
            message.dataset.state = 'success';
        }
    } catch (error) {
        if (error?.name === 'AbortError') return;
        if (silent && trackingState.basicVessel) return;
        stopTrackingVesselPolling();
        trackingState.basicVessel = null;
        trackingStore.getState().failVesselSearch(error?.message || 'No fue posible consultar el buque.');
        if (!trackingState.data) syncBasicVesselMap();
        document.getElementById('tracking-ais-vessel').textContent = query;
        document.getElementById('tracking-ais-details').textContent = error?.message || 'No fue posible consultar el buque.';
        document.getElementById('tracking-ais-position').textContent = '';
        document.getElementById('tracking-ais-navigation').textContent = '';
        document.getElementById('tracking-ais-time').textContent = '';
    } finally {
        if (trackingState.vesselLookupController === controller) trackingState.vesselLookupController = null;
    }
}

function renderManualTrackingState(totalDistance = trackingState.routeDistance) {
    const hasVoyageData = hasTrackingVoyageData();
    const auditMode = trackingState.flowMode === 'audit';
    const auditDistance = Number(totalDistance ?? getVoyageDraft()?.ballastDistanceNm);
    const aisSpeed = Number(trackingState.basicVessel?.speedKnots ?? trackingState.basicVessel?.speed);
    const context = getManualTrackingContext();
    const hasRoutePorts = hasVoyageData && Boolean(context.pol && context.pod);
    const hasDistance = (hasVoyageData || auditMode) && Number.isFinite(auditDistance) && auditDistance > 0;
    const routeLabel = hasRoutePorts ? `${context.pol} → ${context.pod}` : '';
    const routeDistance = hasDistance
        ? `${formatTrackingNumber(auditDistance, { maximumFractionDigits: 0 })} NM · ruta estimada`
        : '';

    if (!hasVoyageData && !trackingState.basicVessel) {
        clearTrackingMapVisuals();
    }

    document.getElementById('tracking-live-connection').textContent = 'GIS disponible';
    document.getElementById('tracking-live-last-sync').textContent = hasVoyageData ? 'Viaje activo' : auditMode ? 'DraftVoyage activo' : trackingState.basicVessel ? 'AIS coordinado activo' : 'Tracking Libre';
    document.getElementById('tracking-map-route-label').textContent = routeLabel;
    document.getElementById('tracking-map-route-distance').textContent = routeDistance;
    renderBasicVesselCard();
    document.getElementById('tracking-contract-status').textContent = hasVoyageData ? 'CONTRACT' : auditMode ? 'PRE-FIXTURE' : trackingState.basicVessel ? 'FREE AIS' : 'FREE';
    document.getElementById('tracking-contract-ref-label').textContent = hasVoyageData ? (trackingState.activeVoyage?.reference || 'Viaje sin referencia') : auditMode ? 'DraftVoyage sin referencia' : trackingState.basicVessel?.name || 'Observación libre';
    document.getElementById('tracking-contract-subtitle').textContent = hasVoyageData
        ? [context.vessel || 'Buque por definir', context.cargo || 'Carga por definir'].join(' · ')
        : auditMode ? 'Auditoría de lastre previa al fixture' : 'Busca un buque o vincula una referencia contractual';
    document.getElementById('tracking-live-metrics').innerHTML = `
        <div class="tracking-metric"><span>Modo operativo</span><strong>${hasVoyageData ? 'Contrato' : auditMode ? 'Pre-Fixture' : 'Libre'}</strong></div>
        <div class="tracking-metric"><span>Distancia estimada</span><strong>${hasDistance ? `${formatTrackingNumber(auditDistance, { maximumFractionDigits: 0 })} <small>NM</small>` : '—'}</strong></div>
        <div class="tracking-metric"><span>Buque</span><strong>${escapeTrackingHtml(trackingState.basicVessel?.name || context.vessel || '—')}</strong></div>
        <div class="tracking-metric"><span>Velocidad AIS</span><strong>${Number.isFinite(aisSpeed) ? `${formatTrackingNumber(aisSpeed)} <small>kn</small>` : '—'}</strong></div>`;
    const count = document.getElementById('tracking-alert-count');
    count.textContent = '0';
    count.classList.remove('has-alerts');
    document.getElementById('tracking-alert-list').innerHTML = '<div class="tracking-alerts-empty">Vincula un contrato para activar alertas operativas.</div>';
    document.getElementById('tracking-live-content').innerHTML = `
        <div class="tracking-state-card ecosystem-panel is-manual"><span class="tracking-state-orbit"><i class="fa-solid fa-route"></i></span><div><h2>${hasVoyageData ? 'Viaje Activo' : auditMode ? 'Auditoría Pre-Fixture' : trackingState.basicVessel ? 'Tracking Libre' : 'Observación Libre'}</h2><p>${hasRoutePorts ? `La navegación ${escapeTrackingHtml(routeLabel)} utiliza los datos del contrato recuperado.` : auditMode ? 'El DraftVoyage aporta POL, POD, Laycan y carga; el IMO activa únicamente el cálculo de lastre real hasta POL.' : trackingState.basicVessel ? `La caché AIS coordinada centra el mapa en ${escapeTrackingHtml(trackingState.basicVessel.name || 'el buque')} sin rutas ni datos comerciales.` : 'Introduce un IMO para geolocalizar un buque o carga una referencia contractual válida.'}</p></div></div>`;
}

function clearTrackingContract(message = 'Sin viaje activo. Esperando datos desde Neon.') {
    stopLaytimeRequest({ clearStatements: true });
    trackingState.contractRef = '';
    trackingState.data = null;
    trackingState.activeVoyage = null;
    trackingState.laytimeIncidents = [];
    trackingState.basicVessel = null;
    trackingStore.getState().reset();
    window.clearInterval(trackingState.pollTimer);
    trackingState.pollTimer = null;
    clearTrackingMapVisuals();
    const contractInput = document.getElementById('tracking-live-contract-ref');
    if (contractInput) contractInput.value = '';
    if (hasAuditDraft()) populateDraftVoyageInputs();
    else populateActiveVoyageInputs(null);
    setContractFieldsReadOnly(false);
    setTrackingFlowMode(hasAuditDraft() ? 'audit' : 'free');
    renderManualTrackingState();
    renderExecutiveDashboard();
    const inputMessage = document.getElementById('tracking-input-message');
    inputMessage.textContent = message;
    inputMessage.dataset.state = 'neutral';
}

function syncTrackingMap(data) {
    ensureTrackingMap();
    const route = data.route || {};
    const ports = route.ports || {};
    const position = normalizeMapPoint(data.live?.position);
    const vessel = position ? [{
        ...position,
        name: data.contract?.vesselName,
        vesselName: data.contract?.vesselName,
        imo: data.contract?.vesselImo,
        mmsi: data.contract?.vesselMmsi,
        destination: data.contract?.pod?.name,
    }] : [];
    trackingState.routes = { ballast: asTrackingArray(route.ballast), laden: asTrackingArray(route.laden) };
    replaceTrackingMapVessels(vessel, position ? vessel[0] : null);
    window.GlobalFleetGlobe?.setRouteSegments?.(ports, TRACKING_MAP_KEY, { ballastPortName: ports.ballast?.name || '', focus: true, persist: false }, trackingState.routes);
    if (position && !trackingState.routes.laden.length) window.GlobalFleetGlobe?.focusCoordinates?.(position.lat, position.lng, TRACKING_MAP_KEY, 1.35);
}

function renderTrackingMapChrome(data) {
    const contract = data.contract || {};
    const live = data.live || {};
    const laytimeAlerts = trackingState.laytimeStatements
        .filter((statement) => statement?.calculation?.status === 'ON_DEMURRAGE' || asTrackingArray(statement?.calculation?.missingCritical).length)
        .map((statement) => statement.calculation.status === 'ON_DEMURRAGE'
            ? { level: 'critical', title: `${statement.operation === 'LOAD' ? 'POL' : 'POD'} ON DEMURRAGE`, detail: `USD ${formatTrackingNumber(statement.calculation.demurrageUsd, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} acumulados. Balance ${statement.calculation.balanceLabel}.` }
            : { level: 'warning', title: `Plancha ${statement.operation === 'LOAD' ? 'POL' : 'POD'} incompleta`, detail: `Faltan: ${asTrackingArray(statement.calculation.missingCritical).join(', ')}` });
    const alerts = [...asTrackingArray(data.alerts), ...laytimeAlerts];
    const position = normalizeMapPoint(live.position);
    const pol = contract.pol || {};
    const pod = contract.pod || {};
    const routeOrigin = pol.name || pol.id || '';
    const routeDestination = pod.name || pod.id || '';
    const remainingDistanceNm = Number(live.remainingDistanceNm);
    const vesselName = contract.vesselName || trackingState.activeVoyage?.vesselName || 'Sin buque';
    const vesselDetails = [
        contract.vesselImo && `IMO ${contract.vesselImo}`,
        contract.vesselMmsi && `MMSI ${contract.vesselMmsi}`,
    ].filter(Boolean).join(' · ');
    const speedKnots = Number(live.averageSpeedKnots ?? live.speedKnots);
    const course = Number(live.courseOverGround ?? live.course ?? live.heading);
    const navigation = [
        Number.isFinite(speedKnots) ? `Velocidad ${formatTrackingNumber(speedKnots)} kn` : '',
        Number.isFinite(course) ? `Rumbo ${formatTrackingNumber(course, { maximumFractionDigits: 0 })}°` : '',
    ].filter(Boolean).join(' · ');
    setTrackingAisCardVisibility(hasTrackingVoyageData());
    document.getElementById('tracking-map-route-label').textContent = routeOrigin && routeDestination ? `${routeOrigin} → ${routeDestination}` : '';
    document.getElementById('tracking-map-route-distance').textContent = Number.isFinite(remainingDistanceNm)
        ? `${formatTrackingNumber(remainingDistanceNm)} NM pendientes${live.phase || contract.phase ? ` · Fase ${live.phase || contract.phase}/6` : ''}`
        : '';
    document.getElementById('tracking-ais-vessel').textContent = vesselName;
    document.getElementById('tracking-ais-details').textContent = vesselDetails;
    document.getElementById('tracking-ais-position').textContent = position ? `Lat ${formatTrackingNumber(position.lat, { minimumFractionDigits: 3 })} · Lon ${formatTrackingNumber(position.lng, { minimumFractionDigits: 3 })}` : '';
    document.getElementById('tracking-ais-navigation').textContent = navigation;
    document.getElementById('tracking-ais-time').textContent = live.aisUpdatedAt ? formatTrackingTime(live.aisUpdatedAt) : '';
    document.getElementById('tracking-contract-status').textContent = String(contract.status || live.status || 'ACTIVE').replaceAll('_', ' ');
    document.getElementById('tracking-contract-ref-label').textContent = contract.reference || trackingState.contractRef;
    document.getElementById('tracking-contract-subtitle').textContent = `${contract.vesselName || 'Buque por confirmar'} · ${contract.cargoName || 'Carga no especificada'}`;
    document.getElementById('tracking-live-metrics').innerHTML = `
        <div class="tracking-metric"><span>Posición AIS</span><strong>${position ? `${formatTrackingNumber(position.lat)}, ${formatTrackingNumber(position.lng)}` : '—'}</strong></div>
        <div class="tracking-metric"><span>Distancia pendiente</span><strong>${formatTrackingNumber(live.remainingDistanceNm)} <small>NM</small></strong></div>
        <div class="tracking-metric"><span>Velocidad media</span><strong>${formatTrackingNumber(live.averageSpeedKnots)} <small>kn</small></strong></div>
        <div class="tracking-metric"><span>ETA dinámico</span><strong>${escapeTrackingHtml(formatTrackingDate(live.eta))}</strong></div>`;
    const count = document.getElementById('tracking-alert-count');
    count.textContent = String(alerts.length);
    count.classList.toggle('has-alerts', Boolean(alerts.length));
    document.getElementById('tracking-alert-list').innerHTML = alerts.length ? alerts.map(renderTrackingAlert).join('') : '<div class="tracking-alerts-empty">Sin alertas activas en este momento.</div>';
}

function renderTrackingAnalytics(data) {
    const milestones = asTrackingArray(data.milestones);
    const timeline = asTrackingArray(data.timeline);
    const live = data.live || {};
    document.getElementById('tracking-live-content').innerHTML = `
        <section class="tracking-traceability-panel ecosystem-panel">
            <div class="tracking-section-heading"><div><span>02 / Operational trace</span><h2>Trazabilidad de punta a punta</h2></div><div class="tracking-phase-chip">Fase activa <strong>${escapeTrackingHtml(live.phase || '—')}</strong> / 6</div></div>
            <div class="tracking-stepper">
                ${milestones.map((milestone) => `<article class="tracking-step ecosystem-panel" data-status="${escapeTrackingHtml(milestone.status)}"><div class="tracking-step-head"><span class="tracking-step-number">0${escapeTrackingHtml(milestone.phase)}</span><span class="tracking-step-status">${escapeTrackingHtml(trackingStatusLabel(milestone.status))}</span></div><h3>${escapeTrackingHtml(milestone.title)}</h3><div class="tracking-step-metrics">${renderMilestoneMetrics(milestone)}</div></article>`).join('')}
            </div>
        </section>
        <section class="tracking-laytime-panel ecosystem-panel">
            <div class="tracking-section-heading"><div><span>03 / Laytime desk</span><h2>Plancha y demoras</h2></div><p>Cálculo contractual por segundos · SHINC/SHEX · Weather Permitting</p></div>
            <div id="tracking-laytime-workspace" class="tracking-laytime-workspace"><div class="tracking-laytime-loading">Cargando estado de plancha…</div></div>
        </section>
        <section class="tracking-asset-panel ecosystem-panel">
            <div class="tracking-section-heading"><div><span>04 / Auditable record</span><h2>Asset Trail</h2></div><p>Últimos eventos operativos · actualizado ${escapeTrackingHtml(formatTrackingDate(data.generatedAt))}</p></div>
            <div class="tracking-timeline">${timeline.length ? timeline.map(renderTrackingEvent).join('') : '<div class="tracking-timeline-empty">Los eventos de geofence, NOR, carga, travesía y descarga aparecerán aquí conforme sean registrados.</div>'}</div>
        </section>`;
    void ensureLaytimeStatements(data);
}

function laytimeStatementFor(operation) {
    return trackingState.laytimeStatements.find((statement) => statement.operation === operation) || null;
}

function laytimeDefaultValue(data, operation, key) {
    const statement = laytimeStatementFor(operation);
    if (statement?.[key] !== null && statement?.[key] !== undefined) return statement[key];
    const contract = data?.contract || {};
    const commercial = contract.commercial || {};
    const isLoad = operation === 'LOAD';
    const defaults = {
        quantityMt: contract.cargoQuantityMt || '',
        rateMtDay: isLoad ? commercial.loadingRateMtDay : commercial.dischargeRateMtDay,
        allowedHours: '',
        laytimeRule: commercial.laytimeRule || commercial.laytimeTerms || 'SHINC',
        weatherPermitting: commercial.weatherPermitting !== false,
        onceOnDemurrage: true,
        commencementDelayMinutes: commercial.commencementDelayMinutes || 0,
        portTimeZone: '',
        demurrageRateUsdDay: commercial.demurrageRateUsdDay || commercial.demurrageRate || data?.live?.demurrageRateUsdDay || '',
        norTenderedAt: isLoad ? data?.milestones?.[1]?.metrics?.tenderedAt : data?.milestones?.[4]?.metrics?.tenderedAt,
        norAcceptedAt: isLoad ? data?.milestones?.[1]?.metrics?.acceptedAt : data?.milestones?.[4]?.metrics?.acceptedAt,
        laytimeCommencedAt: isLoad ? data?.milestones?.[1]?.metrics?.laytimeStartedAt : '',
        operationStartedAt: '',
        operationCompletedAt: isLoad ? data?.milestones?.[3]?.metrics?.completedAt : data?.milestones?.[5]?.metrics?.closedAt,
        statementAsOfAt: new Date().toISOString(),
    };
    return defaults[key];
}

function renderLaytimeIncident(incident, index) {
    return `<article class="tracking-laytime-incident"><div><strong>${escapeTrackingHtml(incident.reason || 'Incidencia operativa')}</strong><span>${escapeTrackingHtml(incident.category || 'OPERATIONAL')} · factor ${formatTrackingNumber(incident.countingFactor ?? 0, { maximumFractionDigits: 2 })}</span></div><time>${escapeTrackingHtml(formatTrackingDate(incident.startAt))} → ${escapeTrackingHtml(formatTrackingDate(incident.endAt))}</time><button type="button" data-laytime-remove-incident="${index}" aria-label="Eliminar incidencia"><i class="fa-solid fa-xmark"></i></button></article>`;
}

function refreshLaytimeIncidentList() {
    const target = document.getElementById('tracking-laytime-incidents');
    if (!target) return;
    target.innerHTML = trackingState.laytimeIncidents.length
        ? trackingState.laytimeIncidents.map(renderLaytimeIncident).join('')
        : '<p>Sin periodos excluibles registrados.</p>';
    target.querySelectorAll('[data-laytime-remove-incident]').forEach((button) => button.addEventListener('click', () => {
        trackingState.laytimeIncidents.splice(Number(button.dataset.laytimeRemoveIncident), 1);
        refreshLaytimeIncidentList();
        previewLaytime();
    }));
}

function collectLaytimeForm() {
    const form = document.getElementById('tracking-laytime-form');
    if (!form) return null;
    const data = new FormData(form);
    return {
        operation: String(data.get('operation') || 'LOAD'),
        quantityMt: Number(data.get('quantityMt')),
        rateMtDay: data.get('rateMtDay') ? Number(data.get('rateMtDay')) : null,
        allowedHours: data.get('allowedHours') ? Number(data.get('allowedHours')) : null,
        laytimeRule: String(data.get('laytimeRule') || 'SHINC'),
        weatherPermitting: data.get('weatherPermitting') === 'on',
        onceOnDemurrage: data.get('onceOnDemurrage') === 'on',
        commencementDelayMinutes: Number(data.get('commencementDelayMinutes') || 0),
        portTimeZone: String(data.get('portTimeZone') || ''),
        demurrageRateUsdDay: Number(data.get('demurrageRateUsdDay')),
        norTenderedAt: trackingLocalDateToIso(data.get('norTenderedAt')),
        norAcceptedAt: trackingLocalDateToIso(data.get('norAcceptedAt')),
        laytimeCommencedAt: trackingLocalDateToIso(data.get('laytimeCommencedAt')),
        operationStartedAt: trackingLocalDateToIso(data.get('operationStartedAt')),
        operationCompletedAt: trackingLocalDateToIso(data.get('operationCompletedAt')),
        statementAsOfAt: trackingLocalDateToIso(data.get('statementAsOfAt')) || new Date().toISOString(),
        incidents: trackingState.laytimeIncidents,
    };
}

function renderLaytimeResult(calculation) {
    const target = document.getElementById('tracking-laytime-result');
    if (!target) return;
    const missing = asTrackingArray(calculation?.missingCritical);
    const demurrage = Number(calculation?.demurrageUsd || 0);
    target.dataset.status = calculation?.status || 'INCOMPLETE';
    target.innerHTML = `
        <div class="tracking-laytime-status"><span>${escapeTrackingHtml(String(calculation?.status || 'INCOMPLETE').replaceAll('_', ' '))}</span><strong>${demurrage > 0 ? `USD ${formatTrackingNumber(demurrage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Sin demora devengada'}</strong></div>
        <div class="tracking-laytime-kpis"><div><span>Allowed</span><strong>${escapeTrackingHtml(calculation?.allowedLabel || '—')}</strong></div><div><span>Used</span><strong>${escapeTrackingHtml(calculation?.usedLabel || '—')}</strong></div><div><span>Balance</span><strong>${escapeTrackingHtml(calculation?.balanceLabel || '—')}</strong></div><div><span>Excluido</span><strong>${escapeTrackingHtml(calculation?.excludedLabel || '—')}</strong></div></div>
        ${calculation?.demurrageStartedAt ? `<p class="tracking-laytime-executive is-critical"><strong>ON DEMURRAGE:</strong> reloj de demora desde ${escapeTrackingHtml(formatTrackingDate(calculation.demurrageStartedAt))}. Coste acumulado pro rata USD ${formatTrackingNumber(demurrage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.</p>` : '<p class="tracking-laytime-executive">La operación permanece dentro de la plancha permitida con el balance indicado.</p>'}
        ${missing.length ? `<div class="tracking-laytime-missing"><strong>Datos críticos pendientes</strong><span>${missing.map((item) => escapeTrackingHtml(item.replaceAll('_', ' '))).join(' · ')}</span></div>` : ''}`;
}

function previewLaytime() {
    const payload = collectLaytimeForm();
    if (!payload) return;
    renderLaytimeResult(calculateLaytime({ ...payload, asOfAt: payload.statementAsOfAt }));
}

function renderLaytimeWorkspace(data, operation = 'LOAD') {
    const workspace = document.getElementById('tracking-laytime-workspace');
    if (!workspace) return;
    const statement = laytimeStatementFor(operation);
    trackingState.laytimeIncidents = asTrackingArray(statement?.incidents).map((incident) => ({ ...incident }));
    const value = (key) => laytimeDefaultValue(data, operation, key);
    workspace.innerHTML = `
        <form id="tracking-laytime-form" class="tracking-laytime-form">
            <div class="tracking-laytime-fields">
                <label><span>Operación</span><select name="operation"><option value="LOAD" ${operation === 'LOAD' ? 'selected' : ''}>Carga / POL</option><option value="DISCHARGE" ${operation === 'DISCHARGE' ? 'selected' : ''}>Descarga / POD</option></select></label>
                <label><span>Tonelaje MT</span><input name="quantityMt" type="number" min="0.001" step="0.001" value="${escapeTrackingHtml(value('quantityMt'))}" required></label>
                <label><span>Tasa MT/día</span><input name="rateMtDay" type="number" min="0" step="0.01" value="${escapeTrackingHtml(value('rateMtDay') || '')}" placeholder="Base contractual"></label>
                <label><span>Allowed hours</span><input name="allowedHours" type="number" min="0" step="0.001" value="${escapeTrackingHtml(value('allowedHours') || '')}" placeholder="Opcional"></label>
                <label><span>Régimen</span><select name="laytimeRule"><option value="SHINC" ${String(value('laytimeRule')).toUpperCase().includes('SHEX') ? '' : 'selected'}>SHINC</option><option value="SHEX" ${String(value('laytimeRule')).toUpperCase().includes('SHEX') ? 'selected' : ''}>SHEX</option></select></label>
                <label><span>Demurrage USD/día</span><input name="demurrageRateUsdDay" type="number" min="0" step="0.01" value="${escapeTrackingHtml(value('demurrageRateUsdDay') || '')}" required></label>
                <label><span>Delay tras NOR (min)</span><input name="commencementDelayMinutes" type="number" min="0" step="1" value="${escapeTrackingHtml(value('commencementDelayMinutes') || 0)}"></label>
                <label><span>Zona horaria puerto</span><input name="portTimeZone" type="text" value="${escapeTrackingHtml(value('portTimeZone') || '')}" placeholder="Europe/Madrid para SHEX"></label>
                <label><span>NOR tendered</span><input name="norTenderedAt" type="datetime-local" value="${toTrackingDateTimeLocal(value('norTenderedAt'))}"></label>
                <label><span>NOR accepted</span><input name="norAcceptedAt" type="datetime-local" value="${toTrackingDateTimeLocal(value('norAcceptedAt'))}"></label>
                <label><span>Laytime commenced</span><input name="laytimeCommencedAt" type="datetime-local" value="${toTrackingDateTimeLocal(value('laytimeCommencedAt'))}"></label>
                <label><span>Operación iniciada</span><input name="operationStartedAt" type="datetime-local" value="${toTrackingDateTimeLocal(value('operationStartedAt'))}"></label>
                <label><span>Operación finalizada</span><input name="operationCompletedAt" type="datetime-local" value="${toTrackingDateTimeLocal(value('operationCompletedAt'))}"></label>
                <label><span>Statement as of</span><input name="statementAsOfAt" type="datetime-local" value="${toTrackingDateTimeLocal(value('statementAsOfAt'))}" required></label>
            </div>
            <div class="tracking-laytime-switches"><label><input name="weatherPermitting" type="checkbox" ${value('weatherPermitting') !== false ? 'checked' : ''}> Weather Permitting</label><label><input name="onceOnDemurrage" type="checkbox" ${value('onceOnDemurrage') !== false ? 'checked' : ''}> Once on demurrage, always on demurrage</label></div>
            <div class="tracking-laytime-incident-entry"><div><label><span>Incidencia</span><input id="tracking-incident-reason" type="text" placeholder="Lluvia, avería de cinta, falta de camiones…"></label><label><span>Categoría</span><select id="tracking-incident-category"><option value="OPERATIONAL">Operativa</option><option value="WEATHER">Weather</option><option value="HOLIDAY">Holiday</option><option value="VESSEL">Vessel</option></select></label><label><span>Desde</span><input id="tracking-incident-start" type="datetime-local"></label><label><span>Hasta</span><input id="tracking-incident-end" type="datetime-local"></label><label><span>Factor</span><select id="tracking-incident-factor"><option value="0">0% cuenta</option><option value="0.5">50% cuenta</option><option value="1">100% cuenta</option></select></label></div><button id="tracking-add-incident" type="button"><i class="fa-solid fa-plus"></i> Añadir incidencia</button></div>
            <div id="tracking-laytime-incidents" class="tracking-laytime-incidents">${trackingState.laytimeIncidents.length ? trackingState.laytimeIncidents.map(renderLaytimeIncident).join('') : '<p>Sin periodos excluibles registrados.</p>'}</div>
            <div id="tracking-laytime-result" class="tracking-laytime-result"></div>
            <div class="tracking-laytime-actions"><span id="tracking-laytime-message">${statement ? `Última liquidación guardada ${escapeTrackingHtml(formatTrackingDate(statement.updatedAt))}` : 'Liquidación aún no guardada.'}</span><button type="submit"><i class="fa-solid fa-floppy-disk"></i> Calcular y guardar</button></div>
        </form>`;
    const form = document.getElementById('tracking-laytime-form');
    form?.addEventListener('input', previewLaytime);
    form?.querySelector('[name="operation"]')?.addEventListener('change', (event) => renderLaytimeWorkspace(data, event.currentTarget.value));
    document.getElementById('tracking-add-incident')?.addEventListener('click', () => {
        const reason = document.getElementById('tracking-incident-reason')?.value.trim();
        const category = document.getElementById('tracking-incident-category')?.value;
        const startAt = document.getElementById('tracking-incident-start')?.value;
        const endAt = document.getElementById('tracking-incident-end')?.value;
        const countingFactor = Number(document.getElementById('tracking-incident-factor')?.value || 0);
        if (!reason || !startAt || !endAt || new Date(endAt) <= new Date(startAt)) {
            document.getElementById('tracking-laytime-message').textContent = 'Completa una incidencia con periodo cronológico válido.';
            return;
        }
        trackingState.laytimeIncidents.push({ id: crypto.randomUUID?.() || `incident-${Date.now()}`, reason, category, startAt: trackingLocalDateToIso(startAt), endAt: trackingLocalDateToIso(endAt), countingFactor });
        refreshLaytimeIncidentList();
        previewLaytime();
    });
    refreshLaytimeIncidentList();
    form?.addEventListener('submit', (event) => saveLaytimeStatement(event, data));
    renderLaytimeResult(statement?.calculation || calculateLaytime(collectLaytimeForm()));
}

function stopLaytimeRequest({ clearStatements = false } = {}) {
    trackingState.laytimeRequestController?.abort();
    trackingState.laytimeRequestController = null;
    trackingState.laytimeRequestRef = '';
    trackingState.laytimeLoadedRef = '';
    trackingState.laytimeErrorRef = '';
    trackingState.laytimeError = '';
    if (clearStatements) trackingState.laytimeStatements = [];
}

function renderLaytimeRequestError(message) {
    const workspace = document.getElementById('tracking-laytime-workspace');
    if (workspace) workspace.innerHTML = `<div class="tracking-laytime-error">${escapeTrackingHtml(message || 'No fue posible recuperar la plancha.')}</div>`;
}

async function ensureLaytimeStatements(data) {
    const contractRef = normalizeTrackingRef(trackingState.contractRef);
    if (!contractRef || !/^[A-Z0-9][A-Z0-9/_-]{2,79}$/.test(contractRef)) return;

    if (trackingState.laytimeErrorRef === contractRef) {
        renderLaytimeRequestError(trackingState.laytimeError);
        return;
    }
    if (trackingState.laytimeLoadedRef === contractRef) {
        renderLaytimeWorkspace(data, laytimeStatementFor('LOAD') ? 'LOAD' : laytimeStatementFor('DISCHARGE') ? 'DISCHARGE' : 'LOAD');
        return;
    }
    if (trackingState.laytimeRequestRef === contractRef) return;

    trackingState.laytimeRequestController?.abort();
    const controller = new AbortController();
    trackingState.laytimeRequestController = controller;
    trackingState.laytimeRequestRef = contractRef;
    try {
        const response = await fetch(`/api/v1/voyage/laytime/${encodeURIComponent(contractRef)}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || 'No fue posible recuperar la plancha.');
        if (normalizeTrackingRef(trackingState.contractRef) !== contractRef) return;
        trackingState.laytimeStatements = asTrackingArray(payload.statements);
        trackingState.laytimeLoadedRef = contractRef;
        trackingState.laytimeErrorRef = '';
        trackingState.laytimeError = '';
        renderTrackingMapChrome(data);
        renderExecutiveDashboard();
        renderLaytimeWorkspace(data, laytimeStatementFor('LOAD') ? 'LOAD' : laytimeStatementFor('DISCHARGE') ? 'DISCHARGE' : 'LOAD');
    } catch (error) {
        if (error?.name === 'AbortError' || normalizeTrackingRef(trackingState.contractRef) !== contractRef) return;
        trackingState.laytimeErrorRef = contractRef;
        trackingState.laytimeError = error?.message || 'No fue posible recuperar la plancha.';
        renderLaytimeRequestError(trackingState.laytimeError);
    } finally {
        if (trackingState.laytimeRequestController === controller) {
            trackingState.laytimeRequestController = null;
            trackingState.laytimeRequestRef = '';
        }
    }
}

async function saveLaytimeStatement(event, data) {
    event.preventDefault();
    const payload = collectLaytimeForm();
    const message = document.getElementById('tracking-laytime-message');
    if (!payload || !trackingState.contractRef) return;
    message.textContent = 'Calculando y guardando liquidación…';
    try {
        const response = await fetch(`/api/v1/voyage/laytime/${encodeURIComponent(trackingState.contractRef)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'No fue posible guardar la plancha.');
        const index = trackingState.laytimeStatements.findIndex((statement) => statement.operation === result.statement.operation);
        if (index >= 0) trackingState.laytimeStatements[index] = result.statement;
        else trackingState.laytimeStatements.push(result.statement);
        trackingState.laytimeLoadedRef = normalizeTrackingRef(trackingState.contractRef);
        trackingState.laytimeErrorRef = '';
        trackingState.laytimeError = '';
        renderTrackingMapChrome(data);
        renderExecutiveDashboard();
        renderLaytimeWorkspace(data, result.statement.operation);
        document.getElementById('tracking-laytime-message').textContent = 'Liquidación guardada y coste de demora actualizado.';
    } catch (error) {
        message.textContent = error?.message || 'No fue posible guardar la plancha.';
    }
}

function renderTrackingLoading() {
    document.getElementById('tracking-live-content').innerHTML = `<div class="tracking-skeleton-grid"><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton tracking-skeleton-wide"></div></div>`;
    const message = document.getElementById('tracking-input-message');
    message.textContent = 'Sincronizando contrato, AIS y eventos…';
    message.dataset.state = 'loading';
}

async function loadActiveVoyage() {
    if (trackingState.activeVoyageLoading) return;
    stopLaytimeRequest({ clearStatements: true });
    trackingState.activeVoyageLoading = true;
    trackingState.activeVoyageError = '';
    trackingState.activeVoyage = null;
    trackingState.data = null;
    trackingState.basicVessel = null;
    clearTrackingMapVisuals();
    populateActiveVoyageInputs(null);
    setTrackingFormLoading(true);
    renderExecutiveDashboard();
    const message = document.getElementById('tracking-input-message');
    message.textContent = 'Cargando viaje activo desde Neon…';
    message.dataset.state = 'loading';

    try {
        const response = await fetch('/api/voyage/active', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.voyage) throw new Error(payload.error || 'No fue posible cargar el viaje activo.');

        trackingState.activeVoyage = payload.voyage;
        trackingState.contractRef = normalizeTrackingRef(payload.voyage.reference);
        populateActiveVoyageInputs(payload.voyage);
        trackingState.basicVessel = {
            name: payload.voyage.vesselName,
            imo: payload.voyage.imo,
            mmsi: payload.voyage.mmsi,
            destination: payload.voyage.dischargePort?.name,
            positionSource: 'voyages_tracking',
        };
        renderExecutiveDashboard();

        if (trackingState.contractRef) {
            await loadTrackingContract(trackingState.contractRef);
        } else {
            renderManualTrackingState();
            const pol = getInputPort('pol');
            const pod = getInputPort('pod');
            if (pol && pod) void calculateTrackingRoute();
        }
    } catch (error) {
        trackingState.activeVoyage = null;
        trackingState.basicVessel = null;
        clearTrackingMapVisuals();
        trackingState.activeVoyageError = error?.message || 'No fue posible cargar el viaje activo.';
        populateActiveVoyageInputs(null);
        clearTrackingContract(trackingState.activeVoyageError);
        const inputMessage = document.getElementById('tracking-input-message');
        inputMessage.textContent = trackingState.activeVoyageError;
        inputMessage.dataset.state = 'warning';
    } finally {
        trackingState.activeVoyageLoading = false;
        setTrackingFormLoading(false);
        renderExecutiveDashboard();
    }
}

async function loadTrackingContract(rawRef, silent = false) {
    if (trackingState.loading) return;
    const contractRef = normalizeTrackingRef(rawRef ?? trackingState.contractRef);
    if (!contractRef) {
        clearTrackingContract();
        const pol = getInputPort('pol');
        const pod = getInputPort('pod');
        if (pol && pod) calculateTrackingRoute();
        return;
    }
    if (!/^[A-Z0-9][A-Z0-9/_-]{2,79}$/.test(contractRef)) {
        const inputMessage = document.getElementById('tracking-input-message');
        inputMessage.textContent = hasTrackingVoyageData()
            ? 'La referencia no es válida. Se conservan los datos del viaje activo.'
            : 'La referencia no es válida y no hay un viaje activo en Neon.';
        inputMessage.dataset.state = 'warning';
        return;
    }
    if (normalizeTrackingRef(trackingState.contractRef) !== contractRef) {
        stopLaytimeRequest({ clearStatements: true });
        trackingState.laytimeIncidents = [];
    }
    trackingState.contractRef = contractRef;
    trackingState.activeVoyageError = '';
    const referenceManager = window.ContractReference || window.ContractRefManager;
    referenceManager?.setActiveContractRef?.(contractRef) || window.setActiveContractRef?.(contractRef);
    trackingState.loading = true;
    trackingStore.getState().beginReferenceSearch();
    setTrackingFormLoading(true);
    renderExecutiveDashboard();
    document.getElementById('tracking-live-contract-ref').value = contractRef;
    document.getElementById('tracking-live-refresh')?.classList.add('is-spinning');
    if (!silent) renderTrackingLoading();
    try {
        const response = await fetch(`/api/v1/voyage/tracking/${encodeURIComponent(contractRef)}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || 'No fue posible recuperar el seguimiento operativo.');
        trackingState.data = payload;
        trackingState.activeVoyage = {
            reference: payload.contract?.reference || contractRef,
            vesselName: payload.contract?.vesselName || '',
            imo: payload.contract?.vesselImo || '',
            mmsi: payload.contract?.vesselMmsi || '',
            cargoType: payload.contract?.cargoName || '',
            cargoQty: payload.contract?.cargoQuantityMt,
            cargoUnit: 'MT',
            loadPort: payload.contract?.pol || null,
            dischargePort: payload.contract?.pod || null,
            laydaysStartAt: payload.contract?.laydaysStartAt || null,
            cancellingAt: payload.contract?.cancellingAt || null,
            operationalPhase: payload.live?.status || '',
            currentPhase: payload.live?.phase || null,
            routeProgressPct: payload.live?.progressPct,
            updatedAt: payload.generatedAt || null,
        };
        trackingState.basicVessel = {
            name: payload.contract?.vesselName,
            imo: payload.contract?.vesselImo,
            mmsi: payload.contract?.vesselMmsi,
            position: payload.live?.position,
            positionUpdatedAt: payload.live?.aisUpdatedAt,
            speedKnots: payload.live?.averageSpeedKnots,
            destination: payload.contract?.pod?.name,
            positionSource: 'contract_tracking',
        };
        trackingStore.getState().setOperationalMetrics?.({
            aisSpeedKnots: Number(payload.live?.averageSpeedKnots) > 0 ? Number(payload.live.averageSpeedKnots) : null,
            aisUpdatedAt: payload.live?.aisUpdatedAt || null,
        });
        trackingState.routeDistance = null;
        populateTrackingInputs(payload);
        trackingStore.getState().hydrateContract(payload);
        renderTrackingMapChrome(payload);
        renderTrackingAnalytics(payload);
        renderExecutiveDashboard();
        let routeError = null;
        if (payload.contract?.pol && payload.contract?.pod) {
            try {
                await calculateTrackingRoute({ focus: !silent, throwOnError: true });
            } catch (error) {
                routeError = error;
            }
        }
        const vesselQuery = payload.contract?.vesselMmsi || payload.contract?.vesselImo || payload.contract?.vesselName;
        if (vesselQuery) void loadTrackingVessel(vesselQuery, true);
        document.getElementById('tracking-live-last-sync').textContent = `Sync ${formatTrackingTime(payload.generatedAt)}`;
        const message = document.getElementById('tracking-input-message');
        message.textContent = routeError?.message || 'Contrato, ruta y analítica sincronizados.';
        message.dataset.state = routeError ? 'error' : 'success';
        window.clearInterval(trackingState.pollTimer);
        trackingState.pollTimer = window.setInterval(() => loadTrackingContract(contractRef, true), TRACKING_POLL_INTERVAL);
    } catch (error) {
        trackingStore.getState().failReferenceSearch(error?.message || 'No fue posible recuperar el contrato.');
        if (silent && trackingState.data) {
            const inputMessage = document.getElementById('tracking-input-message');
            inputMessage.textContent = 'No se pudo actualizar el contrato; se mantienen los últimos datos disponibles.';
            inputMessage.dataset.state = 'warning';
        } else {
            trackingState.data = null;
            setContractFieldsReadOnly(false);
            if (hasAuditDraft()) {
                populateDraftVoyageInputs();
                setTrackingFlowMode('audit');
            } else {
                setTrackingFlowMode('free');
            }
            window.clearInterval(trackingState.pollTimer);
            trackingState.pollTimer = null;
            renderManualTrackingState();
            const contractInput = document.getElementById('tracking-live-contract-ref');
            if (contractInput) contractInput.value = contractRef;
            const inputMessage = document.getElementById('tracking-input-message');
            inputMessage.textContent = `${error?.message || 'No fue posible recuperar el seguimiento operativo.'} La referencia se conserva para reintentar.`;
            inputMessage.dataset.state = 'warning';
        }
    } finally {
        trackingState.loading = false;
        setTrackingFormLoading(trackingState.activeVoyageLoading);
        renderExecutiveDashboard();
        document.getElementById('tracking-live-refresh')?.classList.remove('is-spinning');
    }
}

function resetTrackingViewState({ mode = 'free' } = {}) {
    window.clearTimeout(trackingState.contractLookupTimer);
    trackingState.contractLookupTimer = null;
    window.clearTimeout(trackingState.vesselLookupTimer);
    trackingState.vesselLookupTimer = null;
    trackingState.vesselLookupController?.abort();
    trackingState.vesselLookupController = null;
    window.clearInterval(trackingState.pollTimer);
    trackingState.pollTimer = null;
    stopTrackingVesselPolling();
    stopLaytimeRequest({ clearStatements: true });
    trackingState.activeTab = 'gis';
    trackingState.contractRef = '';
    trackingState.loading = false;
    trackingState.data = null;
    trackingState.basicVessel = null;
    trackingState.routeDistance = null;
    trackingState.routes = { ballast: [], laden: [] };
    trackingState.laytimeIncidents = [];
    trackingState.activeVoyage = null;
    trackingState.activeVoyageLoading = false;
    trackingState.activeVoyageError = '';
    trackingStore.getState().resetSession();
    if (mode === 'audit' && hasAuditDraft()) populateDraftVoyageInputs();
    else populateActiveVoyageInputs(null);
    const contractInput = document.getElementById('tracking-live-contract-ref');
    if (contractInput) contractInput.value = '';
    setTrackingFormLoading(false);
    setContractFieldsReadOnly(false);
    setTrackingFlowMode(mode === 'audit' && hasAuditDraft() ? 'audit' : 'free');
    renderManualTrackingState();
    const inputMessage = document.getElementById('tracking-input-message');
    if (inputMessage) {
        inputMessage.textContent = trackingState.flowMode === 'audit'
            ? 'DraftVoyage cargado. Introduce el IMO para auditar el lastre real.'
            : 'Tracking Libre activo. Introduce un IMO para geolocalizar el buque.';
        inputMessage.dataset.state = 'neutral';
    }
    renderExecutiveDashboard();
}

function openTrackingLive() {
    createTrackingOverlay();
    resetTrackingViewState({ mode: hasAuditDraft() ? 'audit' : 'free' });
    const overlay = document.getElementById('tracking-live-overlay');
    overlay?.classList.add('is-open');
    trackingStore.getState().setOverlayOpen(true);
    setTrackingActiveTab(trackingState.activeTab);
    document.body.classList.add('tracking-live-open');
    startAisConsumptionMonitor();
    const lifecycleToken = ++trackingMapLifecycleToken;
    if (trackingMapMountFrameId !== null) window.cancelAnimationFrame(trackingMapMountFrameId);
    trackingMapMountFrameId = window.requestAnimationFrame(async () => {
        trackingMapMountFrameId = null;
        let instance = null;
        try {
            instance = await ensureTrackingMap(lifecycleToken);
        } catch (_) {
            return;
        }
        if (!instance || lifecycleToken !== trackingMapLifecycleToken) return;
        hydrateDraftBallastRoute();
        window.GlobalFleetGlobe?.resize?.(TRACKING_MAP_KEY);
    });
    document.dispatchEvent(new CustomEvent('tracking-live:open'));
}

function activateFreeTrackingMode() {
    resetTrackingViewState({ mode: 'free' });
    clearTrackingMapVisuals();
}

window.addEventListener('vessel-selection:changed', (event) => {
    const activeVessel = event?.detail?.activeVessel || window.GlobalStore?.activeVessel || window.activeVessel;
    const trackingOpen = document.getElementById('tracking-live-overlay')?.classList.contains('is-open');
    if (!trackingOpen || trackingState.activeVoyageLoading || trackingState.loading || trackingState.data) return;
    hydrateTrackingFromActiveVessel(activeVessel, true);
});

function closeTrackingLive(options = {}) {
    const restoreNavigation = options?.restoreNavigation !== false;
    document.getElementById('tracking-live-overlay')?.classList.remove('is-open');
    trackingStore.getState().setOverlayOpen(false);
    document.body.classList.remove('tracking-live-open');
    trackingMapLifecycleToken += 1;
    if (trackingMapMountFrameId !== null) window.cancelAnimationFrame(trackingMapMountFrameId);
    trackingMapMountFrameId = null;
    if (trackingMapResizeFrameId !== null) window.cancelAnimationFrame(trackingMapResizeFrameId);
    trackingMapResizeFrameId = null;
    if (trackingMapResizeTimerId !== null) window.clearTimeout(trackingMapResizeTimerId);
    trackingMapResizeTimerId = null;
    window.GlobalFleetGlobe?.destroy?.(TRACKING_MAP_KEY);
    trackingState.mapMounted = false;
    resetTrackingViewState();
    document.dispatchEvent(new CustomEvent('tracking-live:close', { detail: { restoreNavigation } }));
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('tracking-live-overlay')?.classList.contains('is-open')) closeTrackingLive();
});

window.openTrackingLive = openTrackingLive;
window.closeTrackingLive = closeTrackingLive;

createTrackingOverlay();
