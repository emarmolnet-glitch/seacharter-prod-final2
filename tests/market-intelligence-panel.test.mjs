import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MARKET_INTELLIGENCE_DEFAULTS,
    evaluateMarketOffer,
    normalizeMarketIntelligenceData,
} from '../market-intelligence-panel.mjs';

const market = {
    fleteCalculado: 42.5,
    spot: 34.22,
    coa: 24.5,
    backhaul: 18,
};

test('classifies the upper Backhaul threshold inclusively', () => {
    assert.equal(evaluateMarketOffer({ ...market, ofertaCliente: 20 }).zone, 'backhaul');
});

test('classifies the upper COA threshold inclusively', () => {
    assert.equal(evaluateMarketOffer({ ...market, ofertaCliente: 26.5 }).zone, 'coa');
});

test('classifies offers above the COA threshold as Spot', () => {
    assert.equal(evaluateMarketOffer({ ...market, ofertaCliente: 26.51 }).zone, 'spot');
});

test('keeps the audit pending until the client enters an offer', () => {
    assert.equal(evaluateMarketOffer({ ofertaCliente: null }).zone, 'pending');
});

test('normalizes formatted rate strings without mutating the source object', () => {
    const source = { ...market, ofertaCliente: '$19.00' };
    const normalized = normalizeMarketIntelligenceData(source);

    assert.equal(normalized.ofertaCliente, 19);
    assert.equal(source.ofertaCliente, '$19.00');
    assert.ok(Object.isFrozen(normalized));
});

test('starts calculated and market values at zero without a client offer', () => {
    assert.deepEqual(MARKET_INTELLIGENCE_DEFAULTS, {
        fleteCalculado: 0,
        ofertaCliente: null,
        spot: 0,
        coa: 0,
        backhaul: 0,
    });
});

test('keeps zero-value references reactive once an offer is entered', () => {
    assert.equal(evaluateMarketOffer({ ofertaCliente: 1 }).zone, 'backhaul');
    assert.equal(evaluateMarketOffer({ ofertaCliente: 3 }).zone, 'spot');
});

test('accepts legacy market key aliases without changing the public contract', () => {
    const normalized = normalizeMarketIntelligenceData({
        mercadoSpot: 34.22,
        mercadoCOA: 24.5,
        mercadoBackhaul: 18,
    });

    assert.equal(normalized.spot, 34.22);
    assert.equal(normalized.coa, 24.5);
    assert.equal(normalized.backhaul, 18);
});
