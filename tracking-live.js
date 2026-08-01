const TRACKING_POLL_INTERVAL = 30_000;

const trackingState = {
    contractRef: '',
    data: null,
    pollTimer: null,
    loading: false,
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
    return String(value || '').trim().replace(/^REF:\s*/i, '').toUpperCase();
}

function formatTrackingNumber(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, ...options }).format(number);
}

function formatTrackingDate(value, includeTime = true) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZoneName: includeTime ? 'short' : undefined,
    }).format(date);
}

function formatTrackingTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

function normalizeTrackingAlertLevel(alert) {
    const level = String(alert?.level || alert?.severity || alert?.status || '').trim().toLowerCase();
    if (['critical', 'danger', 'error', 'high'].includes(level)) return 'critical';
    if (['warning', 'warn', 'medium'].includes(level)) return 'warning';
    return level === 'ok' ? 'ok' : 'warning';
}

function renderTrackingAlert(alert) {
    const level = normalizeTrackingAlertLevel(alert);
    const title = alert?.title || alert?.summary || alert?.eventType || alert?.event_type || 'Alerta operativa';
    const detail = alert?.detail || alert?.description || alert?.message || '';
    return `<article class="tracking-alert" data-level="${escapeTrackingHtml(level)}"><div><strong>${escapeTrackingHtml(title)}</strong>${detail ? `<p>${escapeTrackingHtml(detail)}</p>` : ''}</div></article>`;
}

function renderTrackingEvent(event) {
    const occurredAt = event?.occurredAt || event?.occurred_at || event?.timestamp || event?.createdAt || event?.created_at;
    const description = event?.description || event?.summary || event?.detail || event?.message || 'Evento operativo registrado';
    const phase = Number(event?.phase);
    const isoDate = occurredAt && !Number.isNaN(new Date(occurredAt).getTime()) ? new Date(occurredAt).toISOString() : '';
    return `<article class="tracking-event"><time class="tracking-event-time"${isoDate ? ` datetime="${escapeTrackingHtml(isoDate)}"` : ''}>${escapeTrackingHtml(formatTrackingTime(occurredAt))}</time><p class="tracking-event-description">${escapeTrackingHtml(description)}</p>${Number.isFinite(phase) ? `<span class="tracking-event-phase">F${escapeTrackingHtml(phase)}</span>` : ''}</article>`;
}

function trackingStatusLabel(status) {
    return ({ complete: 'Completada', active: 'En curso', pending: 'Pendiente' })[status] || status;
}

function createTrackingOverlay() {
    if (document.getElementById('tracking-live-overlay')) return;
    const overlay = document.createElement('section');
    overlay.id = 'tracking-live-overlay';
    overlay.className = 'tracking-live-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tracking-live-title');
    overlay.innerHTML = `
        <header class="tracking-live-topbar">
            <div class="tracking-live-brand">
                <span class="tracking-live-brand-mark"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i></span>
                <div>
                    <div class="tracking-live-eyebrow">Operational control room · Premium</div>
                    <h1 class="tracking-live-title" id="tracking-live-title">Tracking Live <span class="tracking-pro-badge">PRO</span></h1>
                </div>
            </div>
            <form class="tracking-live-search" id="tracking-live-search-form">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input id="tracking-live-contract-ref" type="text" autocomplete="off" spellcheck="false" maxlength="85" placeholder="REF: SHM/RSB/2026-XXXX-BTC" aria-label="Referencia del contrato">
                <button type="submit">Consultar</button>
            </form>
            <div class="tracking-live-actions">
                <span class="tracking-live-connection">AIS + Neon</span>
                <button type="button" class="tracking-live-refresh" id="tracking-live-refresh" title="Actualizar seguimiento" aria-label="Actualizar seguimiento"><i class="fa-solid fa-rotate"></i></button>
                <button type="button" class="tracking-live-close" id="tracking-live-close" title="Cerrar Tracking Live" aria-label="Cerrar Tracking Live"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </header>
        <main class="tracking-live-shell">
            <div class="tracking-live-content" id="tracking-live-content"></div>
        </main>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#tracking-live-close')?.addEventListener('click', closeTrackingLive);
    overlay.querySelector('#tracking-live-refresh')?.addEventListener('click', () => loadTrackingContract(trackingState.contractRef, true));
    overlay.querySelector('#tracking-live-search-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = overlay.querySelector('#tracking-live-contract-ref');
        loadTrackingContract(input?.value || '');
    });
    renderTrackingEmpty();
}

function renderTrackingEmpty() {
    const content = document.getElementById('tracking-live-content');
    if (!content) return;
    content.innerHTML = `
        <div class="tracking-live-empty">
            <div class="tracking-state-card">
                <i class="fa-solid fa-satellite-dish" aria-hidden="true"></i>
                <h2>Localiza un expediente operativo</h2>
                <p>Introduce la referencia de la Charter Party para cruzar hitos contractuales, posición AIS, geofencing a 3 NM, plancha y rendimiento portuario.</p>
            </div>
        </div>
    `;
}

function renderTrackingLoading() {
    const content = document.getElementById('tracking-live-content');
    if (!content) return;
    content.innerHTML = `
        <div class="tracking-live-loading" aria-live="polite" aria-label="Cargando seguimiento">
            <div class="tracking-skeleton-grid">
                <div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div><div class="tracking-skeleton"></div>
            </div>
        </div>
    `;
}

function renderTrackingError(message) {
    const content = document.getElementById('tracking-live-content');
    if (!content) return;
    content.innerHTML = `
        <div class="tracking-live-error" role="alert">
            <div class="tracking-state-card">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <h2>Seguimiento no disponible</h2>
                <p>${escapeTrackingHtml(message)}</p>
            </div>
        </div>
    `;
}

function metricRow(label, value) {
    return `<div class="tracking-step-metric"><span>${escapeTrackingHtml(label)}</span><strong>${escapeTrackingHtml(value)}</strong></div>`;
}

function renderMilestoneMetrics(milestone) {
    const metrics = milestone.metrics || {};
    switch (milestone.phase) {
        case 1:
            return [metricRow('Distancia POL', `${formatTrackingNumber(metrics.distanceNm)} NM`), metricRow('Geofence', '3 NM'), metricRow('ETA', formatTrackingDate(metrics.eta)), metricRow('Cancelling', formatTrackingDate(metrics.cancellingAt))].join('');
        case 2:
            return [metricRow('NOR tendido', formatTrackingDate(metrics.tenderedAt)), metricRow('NOR aceptado', formatTrackingDate(metrics.acceptedAt)), metricRow('Inicio plancha', formatTrackingDate(metrics.laytimeStartedAt))].join('');
        case 3:
            return [metricRow('Cargado', `${formatTrackingNumber(metrics.loadedMt)} / ${formatTrackingNumber(metrics.totalMt)} MT`), metricRow('Ritmo real', `${formatTrackingNumber(metrics.actualRateMtDay)} MT/d`), metricRow('Ritmo CP', `${formatTrackingNumber(metrics.agreedRateMtDay)} MT/d`), metricRow('Demurrage', `USD ${formatTrackingNumber(metrics.demurrageUsd)}`)].join('');
        case 4:
            return [metricRow('Distancia pendiente', `${formatTrackingNumber(metrics.remainingDistanceNm)} NM`), metricRow('Velocidad media', `${formatTrackingNumber(metrics.averageSpeedKnots)} kn`), metricRow('ETA dinámico', formatTrackingDate(metrics.eta))].join('');
        case 5:
            return [metricRow('Distancia POD', `${formatTrackingNumber(metrics.distanceNm)} NM`), metricRow('Geofence', '3 NM'), metricRow('NOR tendido', formatTrackingDate(metrics.tenderedAt)), metricRow('NOR aceptado', formatTrackingDate(metrics.acceptedAt))].join('');
        case 6:
            return [metricRow('Descargado', `${formatTrackingNumber(metrics.dischargedMt)} / ${formatTrackingNumber(metrics.totalMt)} MT`), metricRow('Ritmo real', `${formatTrackingNumber(metrics.actualRateMtDay)} MT/d`), metricRow('PDAs', `USD ${formatTrackingNumber(metrics.portCostsUsd)}`), metricRow('Archivo', formatTrackingDate(metrics.closedAt))].join('');
        default:
            return '';
    }
}

function renderTrackingDashboard(data) {
    const content = document.getElementById('tracking-live-content');
    if (!content) return;
    const contract = data.contract || {};
    const live = data.live || {};
    const pol = contract.pol || {};
    const pod = contract.pod || {};
    const totalDistance = Number(live.remainingDistanceNm);
    const progress = Number.isFinite(totalDistance) ? Math.min(92, Math.max(8, (Number(live.phase || 1) - 1) / 5 * 100)) : 8;
    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    const milestones = Array.isArray(data.milestones) ? data.milestones : [];
    const timeline = Array.isArray(data.timeline) ? data.timeline : [];
    const position = live.position ? `${formatTrackingNumber(live.position.latitude, { maximumFractionDigits: 4 })}, ${formatTrackingNumber(live.position.longitude, { maximumFractionDigits: 4 })}` : 'Sin posición';

    content.innerHTML = `
        <section class="tracking-hero">
            <article class="tracking-voyage-card">
                <div class="tracking-voyage-heading">
                    <div>
                        <div class="tracking-panel-kicker">Expediente operativo · Fase ${escapeTrackingHtml(live.phase || 1)}/6</div>
                        <h2 class="tracking-contract-ref">${escapeTrackingHtml(contract.reference || trackingState.contractRef)}</h2>
                        <div class="tracking-vessel-name">${escapeTrackingHtml(contract.vesselName || 'Buque por confirmar')} · MMSI ${escapeTrackingHtml(contract.vesselMmsi || '—')} · ${escapeTrackingHtml(contract.cargoName || 'Carga no especificada')}</div>
                    </div>
                    <span class="tracking-live-chip">Live audit</span>
                </div>
                <div class="tracking-route">
                    <div class="tracking-port"><span class="tracking-port-code">${escapeTrackingHtml(pol.id || 'POL')}</span><span class="tracking-port-name">${escapeTrackingHtml(pol.name || 'Puerto de carga')}</span></div>
                    <div class="tracking-route-line" style="--route-progress: ${progress}%"><span class="tracking-route-progress"></span><span class="tracking-route-vessel"><i class="fa-solid fa-ship"></i></span></div>
                    <div class="tracking-port"><span class="tracking-port-code">${escapeTrackingHtml(pod.id || 'POD')}</span><span class="tracking-port-name">${escapeTrackingHtml(pod.name || 'Puerto de descarga')}</span></div>
                </div>
                <div class="tracking-metrics">
                    <div class="tracking-metric"><span class="tracking-metric-label">Posición AIS</span><strong class="tracking-metric-value">${escapeTrackingHtml(position)}</strong></div>
                    <div class="tracking-metric"><span class="tracking-metric-label">Distancia pendiente</span><strong class="tracking-metric-value">${formatTrackingNumber(live.remainingDistanceNm)} NM</strong></div>
                    <div class="tracking-metric"><span class="tracking-metric-label">Velocidad media</span><strong class="tracking-metric-value">${formatTrackingNumber(live.averageSpeedKnots)} kn</strong></div>
                    <div class="tracking-metric"><span class="tracking-metric-label">ETA dinámico</span><strong class="tracking-metric-value">${escapeTrackingHtml(formatTrackingDate(live.eta))}</strong></div>
                </div>
            </article>
            <aside class="tracking-alerts-panel">
                <div class="tracking-panel-heading"><div><div class="tracking-panel-kicker">Motor contractual</div><h2 class="tracking-panel-title">Alertas en tiempo real</h2></div><span class="tracking-alert-count${alerts.length ? ' has-alerts' : ''}" aria-label="${escapeTrackingHtml(`${alerts.length} alertas activas`)}">${escapeTrackingHtml(alerts.length)}</span></div>
                <div class="tracking-alert-list">
                    ${alerts.length ? alerts.map(renderTrackingAlert).join('') : '<div class="tracking-alerts-empty">Sin alertas activas en este momento.</div>'}
                </div>
            </aside>
        </section>
        <section class="tracking-operations-grid">
            <article class="tracking-stepper-panel">
                <div class="tracking-panel-heading"><div><div class="tracking-panel-kicker">POL → POD</div><h2 class="tracking-panel-title">Trazabilidad de punta a punta</h2></div><span class="tracking-panel-kicker">Actualizado ${escapeTrackingHtml(formatTrackingDate(data.generatedAt))}</span></div>
                <div class="tracking-stepper">
                    ${milestones.map((milestone) => `<article class="tracking-step" data-status="${escapeTrackingHtml(milestone.status)}"><span class="tracking-step-number">0${escapeTrackingHtml(milestone.phase)}</span><span class="tracking-step-status">${escapeTrackingHtml(trackingStatusLabel(milestone.status))}</span><h3>${escapeTrackingHtml(milestone.title)}</h3><div class="tracking-step-metrics">${renderMilestoneMetrics(milestone)}</div></article>`).join('')}
                </div>
            </article>
            <aside class="tracking-timeline-panel">
                <div class="tracking-panel-heading"><div><div class="tracking-panel-kicker">Audit trail</div><h2 class="tracking-panel-title">Últimos eventos</h2></div></div>
                <div class="tracking-timeline">
                    ${timeline.length ? timeline.map(renderTrackingEvent).join('') : '<div class="tracking-timeline-empty">Los eventos de geofence, NOR, carga, travesía y descarga aparecerán aquí conforme sean registrados.</div>'}
                </div>
            </aside>
        </section>
    `;
}

async function loadTrackingContract(rawRef, silent = false) {
    if (trackingState.loading) return;
    const contractRef = normalizeTrackingRef(rawRef || trackingState.contractRef);
    if (!/^[A-Z0-9][A-Z0-9/_-]{7,79}$/.test(contractRef)) {
        renderTrackingError('Usa una referencia válida, por ejemplo: REF: SHM/RSB/2026-XXXX-BTC.');
        return;
    }

    trackingState.contractRef = contractRef;
    trackingState.loading = true;
    const refreshButton = document.getElementById('tracking-live-refresh');
    refreshButton?.classList.add('is-spinning');
    if (!silent) renderTrackingLoading();

    try {
        const response = await fetch(`/api/v1/voyage/tracking/${encodeURIComponent(contractRef)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No fue posible recuperar el expediente.');
        trackingState.data = payload;
        renderTrackingDashboard(payload);
        window.clearTimeout(trackingState.pollTimer);
        trackingState.pollTimer = window.setTimeout(() => loadTrackingContract(contractRef, true), TRACKING_POLL_INTERVAL);
    } catch (error) {
        if (!silent || !trackingState.data) renderTrackingError(error instanceof Error ? error.message : 'Error de conexión con el seguimiento operativo.');
    } finally {
        trackingState.loading = false;
        refreshButton?.classList.remove('is-spinning');
    }
}

function openTrackingLive() {
    createTrackingOverlay();
    const overlay = document.getElementById('tracking-live-overlay');
    const input = document.getElementById('tracking-live-contract-ref');
    const quickRef = document.getElementById('quick-ref')?.value || '';
    overlay?.classList.add('is-open');
    document.body.classList.add('tracking-live-open');
    if (input && !input.value) input.value = /^REF:\s*SHM\//i.test(quickRef) ? quickRef : '';
    window.setTimeout(() => input?.focus(), 80);
}

function closeTrackingLive() {
    document.getElementById('tracking-live-overlay')?.classList.remove('is-open');
    document.body.classList.remove('tracking-live-open');
    window.clearTimeout(trackingState.pollTimer);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('tracking-live-overlay')?.classList.contains('is-open')) closeTrackingLive();
});

window.openTrackingLive = openTrackingLive;
window.closeTrackingLive = closeTrackingLive;

createTrackingOverlay();
