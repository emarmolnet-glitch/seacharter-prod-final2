const consumptionEntries = [];

function normalizeCredits(value, meta = {}) {
    if (value !== undefined && value !== null && value !== '') {
        const explicitCredits = Number(value);
        if (Number.isFinite(explicitCredits)) return Math.max(0, explicitCredits);
    }
    return String(meta?.cacheStatus || '').toUpperCase() === 'MISS' ? 1 : 0;
}

function record({ module, action, meta = {}, creditsConsumed } = {}) {
    const credits = normalizeCredits(creditsConsumed, meta);
    if (credits <= 0) return null;

    const entry = Object.freeze({
        module: String(module || 'Core PRO'),
        action: String(action || 'Consulta API'),
        credits,
        cacheStatus: String(meta?.cacheStatus || '').toUpperCase() || null,
        recordedAt: new Date().toISOString(),
    });
    consumptionEntries.push(entry);
    console.info(`Crédito Datalastic consumido por [${entry.module}]: [${entry.action}]`);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('datalastic:consumption-log', { detail: entry }));
    }
    return entry;
}

function getEntries() {
    return consumptionEntries.slice();
}

if (typeof window !== 'undefined') {
    window.DatalasticConsumptionLog = Object.freeze({
        getEntries,
        record,
        recordFromMeta: record,
    });
}

export { getEntries, record };
