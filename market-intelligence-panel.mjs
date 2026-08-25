const PANEL_ID = 'market-intelligence-panel';
const UPDATE_EVENT = 'seacharter:market-intelligence-update';
const DATA_KEYS = Object.freeze(['fleteCalculado', 'ofertaCliente', 'spot', 'coa', 'backhaul']);
const DATA_ALIASES = Object.freeze({
    mercadoSpot: 'spot',
    mercadoCOA: 'coa',
    mercadoBackhaul: 'backhaul',
});
const TEMPORARY_MARKET_FACTORS = Object.freeze({
    spot: 0.95,
    coa: 0.75,
    backhaul: 0.55,
});

export const MARKET_INTELLIGENCE_DEFAULTS = Object.freeze({
    fleteCalculado: 0,
    ofertaCliente: null,
    spot: 0,
    coa: 0,
    backhaul: 0,
});

function toRate(value) {
    const parsed = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toCanonicalPatch(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.entries(source).reduce((patch, [sourceKey, sourceValue]) => {
        const key = DATA_ALIASES[sourceKey] || sourceKey;
        if (DATA_KEYS.includes(key)) patch[key] = toRate(sourceValue);
        return patch;
    }, {});
}

export function normalizeMarketIntelligenceData(value) {
    return Object.freeze({ ...MARKET_INTELLIGENCE_DEFAULTS, ...toCanonicalPatch(value) });
}

export function calculateTemporaryMarketReferences(fleteCalculado) {
    const freight = toRate(fleteCalculado) ?? 0;
    return Object.freeze(Object.fromEntries(
        Object.entries(TEMPORARY_MARKET_FACTORS).map(([key, factor]) => [
            key,
            Math.round((freight * factor + Number.EPSILON) * 100) / 100,
        ]),
    ));
}

export function evaluateMarketOffer(value) {
    const data = normalizeMarketIntelligenceData(value);
    if (data.ofertaCliente === null || data.backhaul === null || data.coa === null) {
        return Object.freeze({ zone: 'pending', ...data });
    }
    if (data.ofertaCliente <= data.backhaul + 2) {
        return Object.freeze({ zone: 'backhaul', ...data });
    }
    if (data.ofertaCliente <= data.coa + 2) {
        return Object.freeze({ zone: 'coa', ...data });
    }
    return Object.freeze({ zone: 'spot', ...data });
}

function formatRate(value) {
    return value === null
        ? '-'
        : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function readInputRate(id) {
    if (typeof document === 'undefined') return null;
    const input = document.getElementById(id);
    return input instanceof HTMLInputElement ? toRate(input.value) : null;
}

function readPageSnapshot() {
    const aisRates = typeof window !== 'undefined' ? window.aisMarketFreightRates : null;
    return {
        fleteCalculado: readInputRate('freight-sell'),
        spot: toRate(aisRates?.standard),
    };
}

function withoutNullValues(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null));
}

function mergeData(current, update) {
    return Object.freeze({ ...current, ...toCanonicalPatch(update) });
}

function setText(root, selector, text) {
    const element = root.querySelector(selector);
    if (element) element.textContent = text;
}

function renderRates(root, data) {
    DATA_KEYS.forEach((key) => {
        root.querySelectorAll(`[data-mi-value="${key}"]`).forEach((element) => {
            element.textContent = formatRate(data[key]);
        });
    });
}

function renderOfferInput(root, data) {
    const input = root.querySelector('[data-mi-offer-input]');
    if (!(input instanceof HTMLInputElement) || document.activeElement === input) return;
    input.value = data.ofertaCliente === null ? '' : String(data.ofertaCliente);
}

function renderDelta(root, data) {
    const delta = data.fleteCalculado !== null && data.ofertaCliente !== null
        ? data.fleteCalculado - data.ofertaCliente
        : null;
    setText(root, '[data-mi-delta-value]', delta === null ? '-' : `${delta >= 0 ? '+' : '-'}$${Math.abs(delta).toFixed(2)} /MT`);
    setText(
        root,
        '[data-mi-delta-caption]',
        delta === null
            ? 'Esperando oferta'
            : delta >= 0
                ? 'Diferencia sobre la oferta del cliente'
                : 'La oferta supera el flete calculado',
    );
}

function renderRadar(root, data) {
    const values = DATA_KEYS.map((key) => data[key]).filter((value) => value !== null);
    const scaleMax = values.length ? Math.max(...values, 1) * 1.12 : null;
    const marker = root.querySelector('[data-mi-marker="fleteCalculado"]');

    setText(root, '[data-mi-scale]', scaleMax === null ? 'Escala pendiente' : `$0 — $${scaleMax.toFixed(2)} /MT`);
    if (!marker) return;

    const hasPosition = data.fleteCalculado !== null && scaleMax !== null;
    marker.classList.toggle('hidden', !hasPosition);
    if (hasPosition) {
        marker.style.left = `${Math.min(100, Math.max(0, (data.fleteCalculado / scaleMax) * 100))}%`;
        marker.title = `Flete calculado: ${formatRate(data.fleteCalculado)} /MT`;
    }
}

function renderAlert(root, audit) {
    root.querySelectorAll('[data-mi-alert-state]').forEach((element) => {
        element.classList.toggle('hidden', element.dataset.miAlertState !== audit.zone);
    });
}

export function createMarketIntelligencePanel(root, initialData = MARKET_INTELLIGENCE_DEFAULTS) {
    if (!(root instanceof HTMLElement)) return null;
    const initialPatch = toCanonicalPatch(initialData);
    let data = mergeData(MARKET_INTELLIGENCE_DEFAULTS, initialPatch);
    const explicitMarketKeys = new Set(
        Object.keys(TEMPORARY_MARKET_FACTORS).filter((key) => initialPatch[key] > 0),
    );
    const initialTemporaryReferences = calculateTemporaryMarketReferences(initialPatch.fleteCalculado);
    Object.keys(TEMPORARY_MARKET_FACTORS).forEach((key) => {
        if (!explicitMarketKeys.has(key)) data = mergeData(data, { [key]: initialTemporaryReferences[key] });
    });

    const render = () => {
        const audit = evaluateMarketOffer(data);
        root.dataset.auditZone = audit.zone;
        renderRates(root, data);
        renderOfferInput(root, data);
        renderDelta(root, data);
        renderRadar(root, data);
        renderAlert(root, audit);
        return audit;
    };

    const update = (nextData) => {
        const patch = toCanonicalPatch(nextData);
        Object.keys(TEMPORARY_MARKET_FACTORS).forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
            if (patch[key] > 0) explicitMarketKeys.add(key);
            else explicitMarketKeys.delete(key);
        });
        if (Object.prototype.hasOwnProperty.call(patch, 'fleteCalculado')) {
            const temporaryReferences = calculateTemporaryMarketReferences(patch.fleteCalculado);
            Object.keys(TEMPORARY_MARKET_FACTORS).forEach((key) => {
                if (!explicitMarketKeys.has(key)) patch[key] = temporaryReferences[key];
            });
        }
        data = mergeData(data, patch);
        return render();
    };

    render();
    return Object.freeze({
        update,
        getData: () => Object.freeze({ ...data }),
        syncFromPage: () => update(withoutNullValues(readPageSnapshot())),
    });
}

async function mountPanel() {
    const root = document.getElementById(PANEL_ID);
    if (!root || root.dataset.mounted === 'true') return;
    root.dataset.mounted = 'true';

    const configuredData = window.SeaCharterMarketIntelligenceData;
    const pageSnapshot = readPageSnapshot();
    
    // 1. Inicializamos el panel con lo que haya
    const controller = createMarketIntelligencePanel(root, {
        ...MARKET_INTELLIGENCE_DEFAULTS,
        ...(configuredData && typeof configuredData === 'object' ? configuredData : {}),
        fleteCalculado: pageSnapshot.fleteCalculado,
        ...(pageSnapshot.spot !== null ? { spot: pageSnapshot.spot } : {}),
    });
    if (!controller) return;

    window.SeaCharterMarketIntelligencePanel = controller;

    // 2. ¡NUEVO! Consultamos directamente a Neon (/api/market/latest) para traer el TCE Spot real
    try {
        const response = await fetch('/api/market/latest', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        const record = payload?.data || payload;

        if (record) {
            // Detectamos qué tipo de buque está activo en Core PRO para elegir su TCE Spot correspondiente
            const vesselType = (document.getElementById('vessel-badge')?.textContent || '').toLowerCase();
            let activeTceSpot = Number(record.handysize_tc) || 18712; // Fallback Handy

            if (vesselType.includes('cape')) activeTceSpot = Number(record.capesize_tc) || 39437;
            else if (vesselType.includes('panamax') || vesselType.includes('kamsar')) activeTceSpot = Number(record.panamax_tc) || 19146;
            else if (vesselType.includes('supra') || vesselType.includes('ultra')) activeTceSpot = Number(record.supramax_tc) || 17178;

            // Actualizamos el panel de inteligencia con el valor real de la base de datos
            controller.update({
                spot: activeTceSpot,
                coa: Math.round(activeTceSpot * 0.75),      // Aplicando factor COA
                backhaul: Math.round(activeTceSpot * 0.55)  // Aplicando factor Backhaul
            });
        }
    } catch (err) {
        console.warn('[Market Intelligence] No se pudo sincronizar el Spot desde Neon, usando valores locales.', err);
    }

    const offerInput = root.querySelector('[data-mi-offer-input]');
    offerInput?.addEventListener('input', () => {
        controller.update({ ofertaCliente: offerInput.value === '' ? null : offerInput.value });
    }, { passive: true });
    
    window.addEventListener(UPDATE_EVENT, (event) => controller.update(event.detail));
    window.addEventListener('AIS_MARKET_RATES_UPDATED', (event) => {
        controller.update({ spot: event.detail?.standard });
    });
    
    const syncCalculatedFreight = () => {
        controller.update({ fleteCalculado: readInputRate('freight-sell') });
    };
    
    document.addEventListener('input', syncCalculatedFreight, { passive: true });
    document.addEventListener('change', syncCalculatedFreight, { passive: true });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
    else mountPanel();
}
