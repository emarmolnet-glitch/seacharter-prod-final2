import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const serviceSource = await readFile(new URL('../dataBridgeSyncService.js', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../dual-trading-chartering-view.js', import.meta.url), 'utf8');
const overlaySource = await readFile(new URL('../dual-mode-overlay.js', import.meta.url), 'utf8');
const serviceModuleUrl = `data:text/javascript;base64,${Buffer.from(serviceSource).toString('base64')}`;
const {
    buildDataBridgeSyncPayload,
    getDataBridgeSyncDiagnostics,
    syncDualTradingChartering,
} = await import(serviceModuleUrl);

const snapshot = Object.freeze({
    operation: Object.freeze({ syncid: 'sync-123', id: 'RDM/2026-0604' }),
    route: Object.freeze({ loadPort: 'Cartagena', dischargePort: 'Rotterdam' }),
    laycan: Object.freeze({ startDate: '2026-07-20', endDate: '2026-07-25' }),
    cargo: Object.freeze({ tonnage: 18500, toleranceType: 'MOLOO', tolerance: 10 }),
    trading: Object.freeze({ fobPrice: 80, cifPrice: 112 }),
    chartering: Object.freeze({ fairFreight: 24.5 }),
    result: Object.freeze({ netMargin: 7.5 }),
});

test('builds the exact Dual Mode Data Bridge contract', () => {
    assert.deepEqual(buildDataBridgeSyncPayload(snapshot, '2026-07-18T12:00:00.000Z'), {
        operation: {
            syncid: 'sync-123',
            id: 'RDM/2026-0604',
            timestamp: '2026-07-18T12:00:00.000Z',
            status: 'finalized',
            source: 'SeaCharter Core PRO - Dual Mode',
        },
        trading_terms: {
            cargo_qty_mt: 18500,
            tolerance_type: 'MOLOO',
            tolerance_percentage: 10,
            price_fob_usd: 80,
            price_cif_target_usd: 112,
        },
        chartering_terms: {
            load_port: 'Cartagena',
            discharge_port: 'Rotterdam',
            laycan_start: '2026-07-20',
            laycan_end: '2026-07-25',
            fair_freight_usd: 24.5,
        },
        financial_recap: {
            net_margin_usd: 7.5,
            cross_viability: true,
        },
    });
});

test('aborts silently without syncid', async () => {
    let fetchCalls = 0;
    const result = await syncDualTradingChartering(
        { ...snapshot, operation: { id: snapshot.operation.id } },
        { fetchImpl: async () => { fetchCalls += 1; } },
    );

    assert.equal(result, false);
    assert.equal(fetchCalls, 0);
});

test('contains network failures without rejecting the PDF flow', async () => {
    const result = await syncDualTradingChartering(snapshot, {
        fetchImpl: async () => { throw new Error('offline'); },
    });

    assert.equal(result, false);
    assert.equal(getDataBridgeSyncDiagnostics()?.stage, 'post');
    assert.equal(getDataBridgeSyncDiagnostics()?.message, 'offline');
});

test('starts the POST after yielding control to the caller', async () => {
    let postStarted = false;
    const syncResult = syncDualTradingChartering(snapshot, {
        fetchImpl: async () => {
            postStarted = true;
            return { ok: true };
        },
    });

    assert.equal(postStarted, false);
    assert.equal(await syncResult, true);
    assert.equal(postStarted, true);
});

test('ignores the response body and preserves the read-only snapshot', async () => {
    let responseBodyReads = 0;
    const snapshotBeforeSync = structuredClone(snapshot);
    const result = await syncDualTradingChartering(snapshot, {
        fetchImpl: async () => ({
            ok: true,
            json: async () => {
                responseBodyReads += 1;
                return { overwriteLocalState: true };
            },
        }),
    });

    assert.equal(result, true);
    assert.equal(responseBodyReads, 0);
    assert.deepEqual(snapshot, snapshotBeforeSync);
});

test('can be disabled without invoking the network', async () => {
    let fetchCalls = 0;
    const result = await syncDualTradingChartering(snapshot, {
        enabled: false,
        fetchImpl: async () => {
            fetchCalls += 1;
            return { ok: true };
        },
    });

    assert.equal(result, false);
    assert.equal(fetchCalls, 0);
});

test('exports the PDF before launching fire-and-forget sync', () => {
    const pdfCallIndex = viewSource.indexOf('exportCommercialRecapPdf(snapshot);');
    const syncCallIndex = viewSource.indexOf("void import('./dataBridgeSyncService.js')");

    assert.ok(pdfCallIndex >= 0);
    assert.ok(syncCallIndex > pdfCallIndex);
    assert.match(viewSource, /\.catch\(\(\) => false\)/);
});

test('reads export context without adding state setters', () => {
    assert.match(overlaySource, /dualView\.getExportContext\s*=\s*\(\)\s*=>/);
    assert.doesNotMatch(viewSource, /set\s+(?:syncid|operationId|toleranceType)\s*\(/);
});
