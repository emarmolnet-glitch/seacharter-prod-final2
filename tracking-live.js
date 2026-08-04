const TRACKING_POLL_INTERVAL = 30_000;
const TRACKING_AIS_POLL_INTERVAL = 30_000;
const TRACKING_MAP_KEY = 'tracking';

const trackingState = {
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
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, ...options }).format(number);
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

function asTrackingArray(value) {
    return Array.isArray(value) ? value : [];
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

function createTrackingOverlay() {
    if (document.getElementById('tracking-live-overlay')) return;
    const overlay = document.createElement('section');
    overlay.id = 'tracking-live-overlay';
    overlay.className = 'tracking-live-overlay theme-light';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tracking-live-title');
    overlay.innerHTML = `
        <header class="tracking-live-topbar ecosystem-panel">
            <div class="tracking-live-brand">
                <span class="tracking-live-brand-mark"><i class="fa-solid fa-route" aria-hidden="true"></i></span>
                <div><div class="tracking-live-eyebrow">SeaCharter · Maritime control room</div><h1 id="tracking-live-title">Tracking GIS</h1></div>
                <span class="tracking-pro-badge">LIVE</span>
            </div>
            <div class="tracking-live-context"><span class="tracking-live-connection" id="tracking-live-connection">GIS disponible</span><span id="tracking-live-last-sync">Modo ruta libre</span></div>
            <div class="tracking-live-actions">
                <button type="button" class="tracking-live-refresh map-icon-button" id="tracking-live-refresh" aria-label="Actualizar datos"><i class="fa-solid fa-rotate"></i></button>
                <button type="button" class="tracking-live-close map-icon-button" id="tracking-live-close" aria-label="Cerrar tracking"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </header>
        <main class="tracking-live-shell">
            <section class="tracking-map-stage">
                <div class="tracking-map-canvas" id="tracking-globe" aria-label="Globo GIS con ruta marítima y posición AIS"></div>
                <div class="tracking-map-atmosphere" aria-hidden="true"></div>
                <aside class="tracking-input-drawer map-floating-panel route-sync-card ecosystem-panel" id="tracking-input-drawer">
                    <button type="button" class="tracking-drawer-toggle map-icon-button" id="tracking-drawer-toggle" aria-label="Contraer panel de entrada"><i class="fa-solid fa-chevron-left"></i></button>
                    <div class="tracking-drawer-scroll">
                        <div class="tracking-drawer-heading"><span>01 / Voyage input</span><h2>Input geográfico<br>y comercial</h2><p>Calcula libremente la ruta. Vincula un contrato solo cuando necesites AIS y analítica operativa.</p></div>
                        <form id="tracking-live-search-form" class="tracking-contract-search input-group">
                            <label for="tracking-live-contract-ref">Referencia contractual <small>OPCIONAL</small></label>
                            <div><input class="input-gc" id="tracking-live-contract-ref" type="text" autocomplete="off" spellcheck="false" maxlength="80" placeholder="SHM/RSB/2026-XXXX"><button type="submit" class="btn-light-action" aria-label="Buscar contrato"><i class="fa-solid fa-arrow-right"></i></button></div>
                        </form>
                        <div class="tracking-input-grid">
                            <label class="input-group"><span>Puerto previo <small>LASTRE</small></span><input class="input-gc" id="tracking-input-ballast" type="text" placeholder="Puerto de procedencia" autocomplete="off" inputmode="text" spellcheck="false"></label>
                            <label class="input-group"><span>Puerto de carga <small>POL</small></span><input class="input-gc" id="tracking-input-pol" type="text" placeholder="Puerto de carga" autocomplete="off" inputmode="text" spellcheck="false"></label>
                            <label class="input-group"><span>Puerto de descarga <small>POD</small></span><input class="input-gc" id="tracking-input-pod" type="text" placeholder="Puerto de descarga" autocomplete="off" inputmode="text" spellcheck="false"></label>
                            <div class="tracking-field-pair"><label class="input-group"><span>Laydays</span><input class="input-gc" id="tracking-input-laydays" type="date"></label><label class="input-group"><span>Cancelling</span><input class="input-gc" id="tracking-input-cancelling" type="date"></label></div>
                            <label class="input-group"><span>Buque / IMO / MMSI</span><input class="input-gc" id="tracking-input-vessel" type="text" placeholder="Nombre, IMO o MMSI"></label>
                            <label class="input-group"><span>Carga a transportar</span><input class="input-gc" id="tracking-input-cargo" type="text" placeholder="Producto y toneladas"></label>
                        </div>
                        <button type="button" id="tracking-calculate-route" class="tracking-route-button btn-light-action"><i class="fa-solid fa-route"></i><span>Calcular ruta marítima</span></button>
                        <p class="tracking-input-message" id="tracking-input-message">Introduce POL y POD para calcular una ruta sin contrato.</p>
                    </div>
                </aside>
                <div class="tracking-map-hud ecosystem-panel">
                    <span class="tracking-map-hud-label">Ruta activa</span>
                    <strong id="tracking-map-route-label">Ruta libre disponible</strong>
                    <span id="tracking-map-route-distance">Completa POL y POD para calcular</span>
                </div>
                <article class="tracking-ais-card ecosystem-panel" id="tracking-ais-card">
                    <div class="tracking-ais-card-head"><span class="tracking-ais-pulse"></span><span>Posición AIS</span><time id="tracking-ais-time">—</time></div>
                    <strong id="tracking-ais-vessel">Buque sin seleccionar</strong>
                    <span class="tracking-ais-details" id="tracking-ais-details">Introduce IMO o nombre para consultar el maestro.</span>
                    <span id="tracking-ais-position">Lat — · Lon —</span>
                    <span class="tracking-ais-navigation" id="tracking-ais-navigation">Velocidad — · Rumbo —</span>
                </article>
                <aside class="tracking-alerts-panel tracking-alerts-map-panel ecosystem-panel" id="tracking-alerts-panel">
                    <div class="tracking-panel-heading"><div><div class="tracking-panel-kicker">Motor contractual</div><h2 class="tracking-panel-title">Alertas en tiempo real</h2></div><span class="tracking-alert-count" id="tracking-alert-count">0</span></div>
                    <div class="tracking-alert-list" id="tracking-alert-list"><div class="tracking-alerts-empty">Vincula un contrato para activar alertas operativas.</div></div>
                </aside>
                <div class="tracking-map-summary ecosystem-panel" id="tracking-map-summary">
                    <div class="tracking-contract-identity"><span id="tracking-contract-status">ROUTE</span><div><strong id="tracking-contract-ref-label">Ruta sin contrato</strong><small id="tracking-contract-subtitle">El GIS funciona con los datos geográficos</small></div></div>
                    <div class="tracking-metrics" id="tracking-live-metrics"></div>
                </div>
            </section>
            <section class="tracking-analytics" id="tracking-live-content">
                <div class="tracking-state-card ecosystem-panel is-manual"><span class="tracking-state-orbit"><i class="fa-solid fa-route"></i></span><div><h2>Modo Ruta Libre</h2><p>Busca un IMO, MMSI o nombre para visualizar el buque y su posición AIS sin contrato. Define POL y POD solo cuando quieras calcular una ruta; la analítica contractual permanece opcional.</p></div></div>
            </section>
        </main>`;
    document.body.appendChild(overlay);

    document.getElementById('tracking-live-close')?.addEventListener('click', closeTrackingLive);
    document.getElementById('tracking-live-refresh')?.addEventListener('click', () => {
        if (trackingState.contractRef) {
            loadTrackingContract(trackingState.contractRef, true);
        } else {
            const context = getManualTrackingContext();
            if (context.pol && context.pod) void calculateTrackingRoute();
            else renderManualTrackingState();
        }
        const vesselQuery = document.getElementById('tracking-input-vessel')?.value.trim();
        if (vesselQuery) void loadTrackingVessel(vesselQuery, true);
    });
    document.getElementById('tracking-live-search-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadTrackingContract(document.getElementById('tracking-live-contract-ref')?.value);
    });
    document.getElementById('tracking-live-contract-ref')?.addEventListener('input', (event) => {
        window.clearTimeout(trackingState.contractLookupTimer);
        const contractRef = normalizeTrackingRef(event.currentTarget.value);
        if (!contractRef) {
            if (trackingState.contractRef) clearTrackingContract();
            return;
        }
        if (contractRef.length >= 5 && /^[A-Z0-9][A-Z0-9/_-]{2,79}$/.test(contractRef)) {
            trackingState.contractLookupTimer = window.setTimeout(() => loadTrackingContract(contractRef), 650);
        }
    });
    document.getElementById('tracking-calculate-route')?.addEventListener('click', calculateTrackingRoute);
    document.getElementById('tracking-drawer-toggle')?.addEventListener('click', toggleTrackingDrawer);
    ['ballast', 'pol', 'pod'].forEach((field) => document.getElementById(`tracking-input-${field}`)?.addEventListener('change', handleTrackingPortChange));
    ['laydays', 'cancelling', 'cargo'].forEach((field) => document.getElementById(`tracking-input-${field}`)?.addEventListener('change', () => {
        if (!trackingState.data) renderManualTrackingState();
    }));
    const vesselInput = document.getElementById('tracking-input-vessel');
    vesselInput?.addEventListener('input', scheduleTrackingVesselLookup);
    vesselInput?.addEventListener('change', () => loadTrackingVessel(vesselInput.value));
    ['ballast', 'pol', 'pod'].forEach((field) => window.bindUniversalPortAutocomplete?.(document.getElementById(`tracking-input-${field}`)));
}

function handleTrackingPortChange() {
    const context = getManualTrackingContext();
    if (!trackingState.data) renderManualTrackingState();
    if (context.pol && context.pod) {
        void calculateTrackingRoute();
        return;
    }
    const message = document.getElementById('tracking-input-message');
    message.textContent = 'Modo Ruta Libre · completa POL y POD para calcular.';
    message.dataset.state = 'neutral';
}

function toggleTrackingDrawer() {
    const drawer = document.getElementById('tracking-input-drawer');
    const collapsed = drawer?.classList.toggle('is-collapsed');
    document.getElementById('tracking-drawer-toggle')?.setAttribute('aria-label', collapsed ? 'Expandir panel de entrada' : 'Contraer panel de entrada');
    window.setTimeout(() => window.GlobalFleetGlobe?.resize?.(TRACKING_MAP_KEY), 260);
}

function ensureTrackingMap() {
    if (trackingState.mapMounted || !window.GlobalFleetGlobe?.mount) return;
    const instance = window.GlobalFleetGlobe.mount({ containerId: 'tracking-globe', key: TRACKING_MAP_KEY, vesselsData: [], restoreRouteState: false });
    trackingState.mapMounted = Boolean(instance);
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

async function calculateTrackingRoute() {
    ensureTrackingMap();
    const context = getManualTrackingContext();
    const message = document.getElementById('tracking-input-message');
    const button = document.getElementById('tracking-calculate-route');
    if (!context.pol || !context.pod) {
        message.textContent = 'Introduce Puerto de Carga (POL) y Puerto de Descarga (POD).';
        message.dataset.state = 'error';
        return;
    }
    if (typeof window.calculateVoyageRouteService !== 'function') {
        message.textContent = 'El motor geográfico todavía no está disponible. Vuelve a intentarlo en unos segundos.';
        message.dataset.state = 'warning';
        return;
    }
    button?.classList.add('is-loading');
    message.textContent = 'Calculando corredores marítimos…';
    message.dataset.state = 'loading';
    try {
        const result = await window.calculateVoyageRouteService({
            portBallast: context.ballast,
            pol: context.pol,
            pod: context.pod,
            geocode: true,
        });
        if (!result?.coordinates?.pol || !result?.coordinates?.pod || !result?.routes?.laden) {
            throw new Error(result?.errors?.length ? `No se localizaron: ${result.errors.join(', ')}.` : 'No fue posible localizar POL y POD.');
        }
        trackingState.routes = result.routes;
        window.GlobalFleetGlobe?.setRouteResult?.(result, TRACKING_MAP_KEY, { focus: true, persist: false });
        const totalDistance = Number(result.totalMiles || 0);
        trackingState.routeDistance = totalDistance;
        setInputPort('tracking-input-ballast', result.coordinates.ballast && { ...result.coordinates.ballast, name: result.portBallast });
        setInputPort('tracking-input-pol', { ...result.coordinates.pol, name: result.pol });
        setInputPort('tracking-input-pod', { ...result.coordinates.pod, name: result.pod });
        document.getElementById('tracking-map-route-label').textContent = `${result.pol || 'POL'} → ${result.pod || 'POD'}`;
        document.getElementById('tracking-map-route-distance').textContent = `${formatTrackingNumber(totalDistance, { maximumFractionDigits: 0 })} NM · lastre + laden`;
        if (!trackingState.data) renderManualTrackingState(totalDistance);
        message.textContent = trackingState.data ? 'Ruta actualizada; la analítica contractual continúa vinculada.' : 'Modo Ruta Libre · ruta calculada con el motor geográfico de MAPA.';
        message.dataset.state = 'success';
    } catch (error) {
        message.textContent = error?.message || 'Error al calcular la ruta.';
        message.dataset.state = 'error';
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
    return normalizeMapPoint(trackingState.basicVessel?.position);
}

function basicVesselDetails(vessel = trackingState.basicVessel) {
    if (!vessel) return 'Introduce IMO, MMSI o nombre para consultar OpenShips.';
    return [
        vessel.imo && `IMO ${vessel.imo}`,
        vessel.mmsi && `MMSI ${vessel.mmsi}`,
        vessel.vesselType,
        vessel.flag,
        vessel.positionSource,
    ].filter(Boolean).join(' · ') || 'Ficha básica disponible';
}

function basicVesselNavigation(vessel = trackingState.basicVessel) {
    if (!vessel) return 'Velocidad — · Rumbo —';
    const speed = vessel.speedKnots === null || vessel.speedKnots === undefined || vessel.speedKnots === '' ? null : Number(vessel.speedKnots);
    const course = vessel.course === null || vessel.course === undefined || vessel.course === '' ? null : Number(vessel.course);
    const heading = vessel.heading === null || vessel.heading === undefined || vessel.heading === '' ? null : Number(vessel.heading);
    return [
        `Velocidad ${Number.isFinite(speed) ? `${formatTrackingNumber(speed)} kn` : '—'}`,
        `COG ${Number.isFinite(course) ? `${formatTrackingNumber(course, { maximumFractionDigits: 0 })}°` : '—'}`,
        `Heading ${Number.isFinite(heading) ? `${formatTrackingNumber(heading, { maximumFractionDigits: 0 })}°` : '—'}`,
    ].join(' · ');
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
    window.GlobalFleetGlobe?.updateVessels?.(mapVessel ? [mapVessel] : [], TRACKING_MAP_KEY);
    if (focus && mapVessel) window.GlobalFleetGlobe?.focusActiveVessel?.(mapVessel, TRACKING_MAP_KEY);
}

function hydrateTrackingFromActiveVessel(activeVessel, focus = false) {
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

function renderBasicVesselCard() {
    const vessel = trackingState.basicVessel;
    const position = getBasicVesselPosition();
    document.getElementById('tracking-ais-vessel').textContent = vessel?.name || getManualTrackingContext().vessel || 'Buque sin seleccionar';
    document.getElementById('tracking-ais-details').textContent = basicVesselDetails(vessel);
    document.getElementById('tracking-ais-position').textContent = position
        ? `Lat ${formatTrackingNumber(position.lat, { minimumFractionDigits: 3 })} · Lon ${formatTrackingNumber(position.lng, { minimumFractionDigits: 3 })}`
        : (vessel ? 'Ficha encontrada · posición AIS no disponible' : 'Introduce IMO, MMSI o nombre para consultar AIS');
    document.getElementById('tracking-ais-navigation').textContent = basicVesselNavigation(vessel);
    document.getElementById('tracking-ais-time').textContent = vessel?.positionUpdatedAt ? formatTrackingTime(vessel.positionUpdatedAt) : '—';
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
    if (query.length < 2) return;
    const input = document.getElementById('tracking-input-vessel');
    if (input && input.value !== query && !silent) input.value = query;
    window.clearTimeout(trackingState.vesselLookupTimer);
    trackingState.vesselLookupController?.abort();
    const controller = new AbortController();
    trackingState.vesselLookupController = controller;
    if (!silent) {
        document.getElementById('tracking-ais-vessel').textContent = query;
        document.getElementById('tracking-ais-details').textContent = 'Consultando OpenShips y maestro de buques…';
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
            if (!trackingState.data) {
                syncBasicVesselMap();
                renderManualTrackingState();
            }
            document.getElementById('tracking-ais-vessel').textContent = query;
            document.getElementById('tracking-ais-details').textContent = payload.message || 'No se encontró una coincidencia. Revisa el nombre, IMO o MMSI.';
            document.getElementById('tracking-ais-position').textContent = 'Sin posición AIS disponible';
            document.getElementById('tracking-ais-navigation').textContent = 'Velocidad — · Rumbo —';
            document.getElementById('tracking-ais-time').textContent = '—';
            return;
        }
        trackingState.basicVessel = payload.vessel;
        if (input && payload.vessel.name) input.value = payload.vessel.name;
        startTrackingVesselPolling(payload.vessel.mmsi || payload.vessel.imo || payload.vessel.name || query);
        syncBasicVesselMap(!silent);
        if (!trackingState.data) {
            renderManualTrackingState();
        } else {
            renderBasicVesselCard();
        }
    } catch (error) {
        if (error?.name === 'AbortError') return;
        if (silent && trackingState.basicVessel) return;
        stopTrackingVesselPolling();
        trackingState.basicVessel = null;
        if (!trackingState.data) syncBasicVesselMap();
        document.getElementById('tracking-ais-vessel').textContent = query;
        document.getElementById('tracking-ais-details').textContent = error?.message || 'No fue posible consultar el buque.';
        document.getElementById('tracking-ais-position').textContent = 'Sin posición AIS disponible';
        document.getElementById('tracking-ais-navigation').textContent = 'Velocidad — · Rumbo —';
        document.getElementById('tracking-ais-time').textContent = '—';
    } finally {
        if (trackingState.vesselLookupController === controller) trackingState.vesselLookupController = null;
    }
}

function renderManualTrackingState(totalDistance = trackingState.routeDistance) {
    const context = getManualTrackingContext();
    const hasRoutePorts = Boolean(context.pol && context.pod);
    const hasDistance = totalDistance !== null && Number.isFinite(Number(totalDistance));
    const routeLabel = hasRoutePorts ? `${context.pol} → ${context.pod}` : 'Ruta libre disponible';
    const routeDistance = hasDistance
        ? `${formatTrackingNumber(totalDistance, { maximumFractionDigits: 0 })} NM · ruta estimada`
        : 'Completa POL y POD para calcular';

    document.getElementById('tracking-live-connection').textContent = 'GIS disponible';
    document.getElementById('tracking-live-last-sync').textContent = 'Modo ruta libre';
    document.getElementById('tracking-map-route-label').textContent = routeLabel;
    document.getElementById('tracking-map-route-distance').textContent = routeDistance;
    renderBasicVesselCard();
    document.getElementById('tracking-contract-status').textContent = 'ROUTE';
    document.getElementById('tracking-contract-ref-label').textContent = 'Ruta sin contrato';
    document.getElementById('tracking-contract-subtitle').textContent = [context.vessel || 'Buque por definir', context.cargo || 'Carga por definir'].join(' · ');
    document.getElementById('tracking-live-metrics').innerHTML = `
        <div class="tracking-metric"><span>Modo operativo</span><strong>Ruta libre</strong></div>
        <div class="tracking-metric"><span>Distancia estimada</span><strong>${hasDistance ? `${formatTrackingNumber(totalDistance, { maximumFractionDigits: 0 })} <small>NM</small>` : '—'}</strong></div>
        <div class="tracking-metric"><span>Buque</span><strong>${escapeTrackingHtml(trackingState.basicVessel?.name || context.vessel || '—')}</strong></div>
        <div class="tracking-metric"><span>Velocidad AIS</span><strong>${trackingState.basicVessel?.speedKnots !== null && trackingState.basicVessel?.speedKnots !== undefined ? `${formatTrackingNumber(trackingState.basicVessel.speedKnots)} <small>kn</small>` : '—'}</strong></div>`;
    const count = document.getElementById('tracking-alert-count');
    count.textContent = '0';
    count.classList.remove('has-alerts');
    document.getElementById('tracking-alert-list').innerHTML = '<div class="tracking-alerts-empty">Vincula un contrato para activar alertas operativas.</div>';
    document.getElementById('tracking-live-content').innerHTML = `
        <div class="tracking-state-card ecosystem-panel is-manual"><span class="tracking-state-orbit"><i class="fa-solid fa-route"></i></span><div><h2>Modo Ruta Libre</h2><p>${hasRoutePorts ? `La navegación ${escapeTrackingHtml(routeLabel)} y la consulta básica del buque funcionan sin contrato. Vincula una referencia únicamente para alertas, trazabilidad y Asset Trail.` : 'Define POL y POD y busca un IMO o nombre para visualizar ruta, ficha del buque y posición AIS. La analítica contractual permanece opcional.'}</p></div></div>`;
}

function clearTrackingContract(message = 'Modo ruta libre activo. El contrato es opcional.') {
    trackingState.contractRef = '';
    trackingState.data = null;
    window.clearInterval(trackingState.pollTimer);
    trackingState.pollTimer = null;
    syncBasicVesselMap();
    const contractInput = document.getElementById('tracking-live-contract-ref');
    if (contractInput) contractInput.value = '';
    renderManualTrackingState();
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
    window.GlobalFleetGlobe?.updateVessels?.(vessel, TRACKING_MAP_KEY);
    window.GlobalFleetGlobe?.setRouteSegments?.(ports, TRACKING_MAP_KEY, { ballastPortName: ports.ballast?.name || '', focus: true, persist: false }, trackingState.routes);
    if (position && !trackingState.routes.laden.length) window.GlobalFleetGlobe?.focusCoordinates?.(position.lat, position.lng, TRACKING_MAP_KEY, 1.35);
}

function renderTrackingMapChrome(data) {
    const contract = data.contract || {};
    const live = data.live || {};
    const alerts = asTrackingArray(data.alerts);
    const position = normalizeMapPoint(live.position);
    const pol = contract.pol || {};
    const pod = contract.pod || {};
    document.getElementById('tracking-map-route-label').textContent = `${pol.name || pol.id || 'POL'} → ${pod.name || pod.id || 'POD'}`;
    document.getElementById('tracking-map-route-distance').textContent = `${formatTrackingNumber(live.remainingDistanceNm)} NM pendientes · Fase ${live.phase || contract.phase || '—'}/6`;
    document.getElementById('tracking-ais-vessel').textContent = contract.vesselName || 'Buque por confirmar';
    document.getElementById('tracking-ais-details').textContent = [contract.vesselImo && `IMO ${contract.vesselImo}`, contract.vesselMmsi && `MMSI ${contract.vesselMmsi}`].filter(Boolean).join(' · ') || 'Buque vinculado al contrato';
    document.getElementById('tracking-ais-position').textContent = position ? `Lat ${formatTrackingNumber(position.lat, { minimumFractionDigits: 3 })} · Lon ${formatTrackingNumber(position.lng, { minimumFractionDigits: 3 })}` : 'Posición AIS no disponible';
    document.getElementById('tracking-ais-navigation').textContent = `Velocidad ${Number.isFinite(Number(live.averageSpeedKnots)) ? `${formatTrackingNumber(live.averageSpeedKnots)} kn` : '—'} · Rumbo pendiente de OpenShips`;
    document.getElementById('tracking-ais-time').textContent = formatTrackingTime(live.aisUpdatedAt);
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
        <section class="tracking-asset-panel ecosystem-panel">
            <div class="tracking-section-heading"><div><span>03 / Auditable record</span><h2>Asset Trail</h2></div><p>Últimos eventos operativos · actualizado ${escapeTrackingHtml(formatTrackingDate(data.generatedAt))}</p></div>
            <div class="tracking-timeline">${timeline.length ? timeline.map(renderTrackingEvent).join('') : '<div class="tracking-timeline-empty">Los eventos de geofence, NOR, carga, travesía y descarga aparecerán aquí conforme sean registrados.</div>'}</div>
        </section>`;
}

function renderTrackingLoading() {
    document.getElementById('tracking-live-content').innerHTML = `<div class="tracking-skeleton-grid"><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton tracking-skeleton-wide"></div></div>`;
    const message = document.getElementById('tracking-input-message');
    message.textContent = 'Sincronizando contrato, AIS y eventos…';
    message.dataset.state = 'loading';
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
        inputMessage.textContent = 'La referencia no es válida. Puedes continuar calculando la ruta sin contrato.';
        inputMessage.dataset.state = 'warning';
        return;
    }
    trackingState.contractRef = contractRef;
    trackingState.loading = true;
    document.getElementById('tracking-live-contract-ref').value = contractRef;
    document.getElementById('tracking-live-refresh')?.classList.add('is-spinning');
    if (!silent) renderTrackingLoading();
    try {
        const response = await fetch(`/api/v1/voyage/tracking/${encodeURIComponent(contractRef)}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || 'No fue posible recuperar el seguimiento operativo.');
        trackingState.data = payload;
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
        trackingState.routeDistance = null;
        populateTrackingInputs(payload);
        syncTrackingMap(payload);
        renderTrackingMapChrome(payload);
        renderTrackingAnalytics(payload);
        const vesselQuery = payload.contract?.vesselMmsi || payload.contract?.vesselImo || payload.contract?.vesselName;
        if (vesselQuery) void loadTrackingVessel(vesselQuery, true);
        document.getElementById('tracking-live-last-sync').textContent = `Sync ${formatTrackingTime(payload.generatedAt)}`;
        const message = document.getElementById('tracking-input-message');
        message.textContent = 'Contrato, ruta y analítica sincronizados.';
        message.dataset.state = 'success';
        window.clearInterval(trackingState.pollTimer);
        trackingState.pollTimer = window.setInterval(() => loadTrackingContract(contractRef, true), TRACKING_POLL_INTERVAL);
    } catch (error) {
        if (silent && trackingState.data) {
            const inputMessage = document.getElementById('tracking-input-message');
            inputMessage.textContent = 'No se pudo actualizar el contrato; se mantienen los últimos datos disponibles.';
            inputMessage.dataset.state = 'warning';
        } else {
            clearTrackingContract(`${error?.message || 'No fue posible recuperar el seguimiento operativo.'} Puedes continuar en modo ruta libre.`);
        }
    } finally {
        trackingState.loading = false;
        document.getElementById('tracking-live-refresh')?.classList.remove('is-spinning');
    }
}

function openTrackingLive(contractRef = '') {
    createTrackingOverlay();
    const overlay = document.getElementById('tracking-live-overlay');
    overlay?.classList.add('is-open');
    document.body.classList.add('tracking-live-open');
    window.requestAnimationFrame(() => {
        ensureTrackingMap();
        const activeVessel = window.GlobalStore?.activeVessel || window.activeVessel;
        hydrateTrackingFromActiveVessel(activeVessel, true);
        window.GlobalFleetGlobe?.resize?.(TRACKING_MAP_KEY);
    });
    document.dispatchEvent(new CustomEvent('tracking-live:open'));
    const normalized = normalizeTrackingRef(contractRef);
    if (normalized) loadTrackingContract(normalized);
    else {
        clearTrackingContract();
        document.getElementById('tracking-input-pol')?.focus();
    }
}

window.addEventListener('vessel-selection:changed', (event) => {
    const activeVessel = event?.detail?.activeVessel || window.GlobalStore?.activeVessel || window.activeVessel;
    const trackingOpen = document.getElementById('tracking-live-overlay')?.classList.contains('is-open');
    hydrateTrackingFromActiveVessel(activeVessel, trackingOpen);
});

function closeTrackingLive() {
    document.getElementById('tracking-live-overlay')?.classList.remove('is-open');
    document.body.classList.remove('tracking-live-open');
    window.clearTimeout(trackingState.contractLookupTimer);
    trackingState.contractLookupTimer = null;
    window.clearTimeout(trackingState.vesselLookupTimer);
    trackingState.vesselLookupTimer = null;
    trackingState.vesselLookupController?.abort();
    trackingState.vesselLookupController = null;
    stopTrackingVesselPolling();
    window.clearInterval(trackingState.pollTimer);
    trackingState.pollTimer = null;
    document.dispatchEvent(new CustomEvent('tracking-live:close'));
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('tracking-live-overlay')?.classList.contains('is-open')) closeTrackingLive();
});

window.openTrackingLive = openTrackingLive;
window.closeTrackingLive = closeTrackingLive;

createTrackingOverlay();
