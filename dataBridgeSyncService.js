const DATA_BRIDGE_SYNC_ENDPOINT = '/api/databridge-dual-sync';
let lastSyncFailure = null;

function readValue(value) {
    return value ?? '';
}

function readSyncId(rawData) {
    const syncid = rawData?.operation?.syncid;
    if (syncid === null || syncid === undefined) return '';
    return String(syncid).trim();
}

function recordSyncFailure(stage, error) {
    try {
        lastSyncFailure = Object.freeze({
            stage,
            message: error instanceof Error ? error.message : String(error ?? 'Unknown sync failure'),
            timestamp: new Date().toISOString(),
        });
    } catch {
        lastSyncFailure = null;
    }
}

export function getDataBridgeSyncDiagnostics() {
    return lastSyncFailure ? { ...lastSyncFailure } : null;
}

export function buildDataBridgeSyncPayload(rawData = {}, timestamp = new Date().toISOString()) {
    const operation = rawData.operation ?? {};
    const cargo = rawData.cargo ?? {};
    const trading = rawData.trading ?? {};
    const route = rawData.route ?? {};
    const laycan = rawData.laycan ?? {};
    const chartering = rawData.chartering ?? {};
    const result = rawData.result ?? {};

    return {
        operation: {
            syncid: readSyncId(rawData),
            id: readValue(operation.id),
            timestamp,
            status: 'finalized',
            source: 'SeaCharter Core PRO - Dual Mode',
        },
        trading_terms: {
            cargo_qty_mt: readValue(cargo.tonnage),
            tolerance_type: readValue(cargo.toleranceType),
            tolerance_percentage: readValue(cargo.tolerance),
            price_fob_usd: readValue(trading.fobPrice),
            price_cif_target_usd: readValue(trading.cifPrice),
        },
        chartering_terms: {
            load_port: readValue(route.loadPort),
            discharge_port: readValue(route.dischargePort),
            laycan_start: readValue(laycan.startDate),
            laycan_end: readValue(laycan.endDate),
            fair_freight_usd: readValue(chartering.fairFreight),
        },
        financial_recap: {
            net_margin_usd: readValue(result.netMargin),
            cross_viability: true,
        },
    };
}

export async function syncDualTradingChartering(rawData = {}, options = {}) {
    const syncid = readSyncId(rawData);
    if (!syncid || options.enabled === false) return false;

    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const timestamp = typeof options.timestamp === 'string'
        ? options.timestamp
        : new Date().toISOString();

    try {
        if (typeof fetchImpl !== 'function') return false;
        await Promise.resolve();
        const response = await fetchImpl(DATA_BRIDGE_SYNC_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildDataBridgeSyncPayload(rawData, timestamp)),
            keepalive: true,
        });
        return response?.ok === true;
    } catch (error) {
        recordSyncFailure('post', error);
        return false;
    }
}
