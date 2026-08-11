import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'parse5';

import {
    MARKET_INTELLIGENCE_DEFAULTS,
    calculateTemporaryMarketReferences,
    evaluateMarketOffer,
    normalizeMarketIntelligenceData,
} from '../market-intelligence-panel.mjs';

const [panelSource, indexSource] = await Promise.all([
    readFile(new URL('../market-intelligence-panel.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

const market = {
    fleteCalculado: 42.5,
    spot: 34.22,
    coa: 24.5,
    backhaul: 18,
};

function getAttribute(node, name) {
    return node?.attrs?.find((attribute) => attribute.name === name)?.value || '';
}

function hasClass(node, className) {
    return getAttribute(node, 'class').split(/\s+/).includes(className);
}

function findElement(node, predicate) {
    if (predicate(node)) return node;
    for (const child of node?.childNodes || []) {
        const match = findElement(child, predicate);
        if (match) return match;
    }
    return null;
}

function closestElement(node, predicate) {
    let current = node;
    while (current) {
        if (predicate(current)) return current;
        current = current.parentNode;
    }
    return null;
}

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

test('derives temporary market references from the calculated freight', () => {
    assert.deepEqual(calculateTemporaryMarketReferences(36), {
        spot: 34.2,
        coa: 27,
        backhaul: 19.8,
    });
});

test('passes the calculated freight only at the panel invocation boundary', () => {
    assert.match(panelSource, /createMarketIntelligencePanel\(root, \{[\s\S]*fleteCalculado: pageSnapshot\.fleteCalculado/);
    assert.doesNotMatch(panelSource, /SeaCharterStore/);
    assert.doesNotMatch(indexSource, /freightSell: State\.freightSell/);
});

test('keeps the complete commercial negotiation section intact', () => {
    const sectionStart = indexSource.indexOf('8. NEGOCIACIÓN COMERCIAL');
    const sectionEnd = indexSource.indexOf('9. ANÁLISIS', sectionStart);
    const sectionSource = indexSource.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : undefined);

    assert.ok(sectionStart >= 0);
    assert.match(sectionSource, /id="freight-rate"/);
    assert.match(sectionSource, /id="freight-sell"/);
    assert.match(sectionSource, /id="comtrade-competitiveness-radar"/);
    assert.match(sectionSource, /id="market-intelligence-panel"/);
    assert.match(sectionSource, /data-mi-value="fleteCalculado"/);
});

test('places sections seven, eight and nine as ordered siblings', () => {
    const document = parse(indexSource);
    const sectionSevenHeading = findElement(document, (node) => getAttribute(node, 'id') === 'freight-analysis-title');
    const sectionSeven = closestElement(sectionSevenHeading, (node) => hasClass(node, 'collapsible-section'));
    const sectionEight = findElement(document, (node) => hasClass(node, 'estimator-commercial-close'));
    const sectionNine = findElement(document, (node) => getAttribute(node, 'id') === 'stress-test-panel');

    assert.ok(sectionSeven);
    assert.ok(sectionEight);
    assert.ok(sectionNine);
    assert.equal(sectionSeven.parentNode, sectionEight.parentNode);
    assert.equal(sectionEight.parentNode, sectionNine.parentNode);

    const siblings = sectionSeven.parentNode.childNodes.filter((node) => node.tagName);
    assert.ok(siblings.indexOf(sectionSeven) < siblings.indexOf(sectionEight));
    assert.ok(siblings.indexOf(sectionEight) < siblings.indexOf(sectionNine));
});

test('keeps section eight vertical, full-width and commercially ordered', () => {
    const document = parse(indexSource);
    const sectionEight = findElement(document, (node) => hasClass(node, 'estimator-commercial-close'));
    const verticalContainer = findElement(sectionEight, (node) => hasClass(node, 'flex-col') && hasClass(node, 'gap-6'));
    const blocks = verticalContainer.childNodes.filter((node) => node.tagName);
    const purchaseInput = findElement(sectionEight, (node) => getAttribute(node, 'id') === 'freight-rate');
    const saleInput = findElement(sectionEight, (node) => getAttribute(node, 'id') === 'freight-sell');
    const demurrageInput = findElement(sectionEight, (node) => getAttribute(node, 'id') === 'demurrage-rate');
    const dispatchToggle = findElement(sectionEight, (node) => getAttribute(node, 'id') === 'dispatch-clause-active');
    const purchaseCard = closestElement(purchaseInput, (node) => hasClass(node, 'rounded-xl') && hasClass(node, 'bg-white'));
    const saleCard = closestElement(saleInput, (node) => hasClass(node, 'rounded-xl') && hasClass(node, 'bg-slate-50'));
    const dispatchCard = closestElement(dispatchToggle, (node) => hasClass(node, 'border-red-200'));
    const purchaseGrid = dispatchCard.parentNode;
    const demurrageField = closestElement(demurrageInput, (node) => node.parentNode === purchaseGrid);
    const purchaseFields = purchaseGrid.childNodes.filter((node) => node.tagName);

    assert.equal(blocks.length, 5);
    assert.ok(findElement(blocks[0], (node) => getAttribute(node, 'id') === 'freight-rate'));
    assert.ok(findElement(blocks[1], (node) => getAttribute(node, 'id') === 'negotiation-bottom-line-title'));
    assert.ok(findElement(blocks[2], (node) => getAttribute(node, 'id') === 'ais-market-reference-widget'));
    assert.ok(findElement(blocks[3], (node) => getAttribute(node, 'id') === 'comtrade-competitiveness-radar'));
    assert.equal(getAttribute(blocks[4], 'id'), 'market-intelligence-panel');
    assert.ok(hasClass(blocks[2], 'w-full'));
    assert.ok(hasClass(blocks[3], 'w-full'));
    assert.ok(hasClass(blocks[4], 'w-full'));
    assert.ok(purchaseCard);
    assert.ok(saleCard);
    assert.equal(purchaseGrid.parentNode, purchaseCard);
    assert.equal(purchaseFields.indexOf(dispatchCard), purchaseFields.indexOf(demurrageField) + 1);
});
