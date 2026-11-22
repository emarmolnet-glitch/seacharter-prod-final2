import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(source, fnName) {
  const start = source.indexOf(`function ${fnName}`);
  assert.ok(start >= 0, `Could not find function ${fnName} in index.html`);
  let depth = 0;
  let started = false;
  let end = start;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
      started = true;
    } else if (source[i] === '}') {
      depth--;
      if (started && depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return source.slice(start, end);
}

function loadBunkerArbitrageHelpers(source) {
  const normFn = extractFunction(source, 'normalizeBunkerArbitrageSuggestions');
  const setFeedbackFn = extractFunction(source, 'setBunkerArbitrageFeedback');
  const applyFn = extractFunction(source, 'applyBunkerArbitrageSuggestion');
  const renderFn = extractFunction(source, 'renderBunkerArbitrageSuggestions');

  const combined = `
    ${normFn}
    ${setFeedbackFn}
    ${applyFn}
    ${renderFn}
    window.normalizeBunkerArbitrageSuggestions = normalizeBunkerArbitrageSuggestions;
    window.setBunkerArbitrageFeedback = setBunkerArbitrageFeedback;
    window.renderBunkerArbitrageSuggestions = renderBunkerArbitrageSuggestions;
  `;

  return function evaluateWithMocks(windowMock = {}, documentMock = {}) {
    const fn = new Function('window', 'document', 'globalThis', 'vesselHasScrubber', 'State', 'runEngine', 'SeaCharterStore', 'showToast', combined);
    fn(windowMock, documentMock, windowMock, () => false, {}, () => {}, { set: () => {} }, () => {});
    return windowMock;
  };
}

const evaluateHelpers = loadBunkerArbitrageHelpers(indexSource);

test('normalizeBunkerArbitrageSuggestions parses real DataBridge payload with port_name, hub_price, round_trip_deviation_nm, and net_benefit', () => {
  const { normalizeBunkerArbitrageSuggestions } = evaluateHelpers();

  const realDataBridgePayload = {
    suggestions: [
      {
        hub_id: 'antwerp-vlsfo',
        port_name: 'Antwerp',
        location: { longitude: 4.4024, latitude: 51.2194 },
        fuel_grade: 'VLSFO',
        hub_price: 545.5,
        price_date: '2026-11-21',
        one_way_deviation_nm: 25.4,
        round_trip_deviation_nm: 50.8,
        extra_days: 0.18,
        extra_consumption: 4.5,
        gross_fuel_savings: 14200,
        deviation_cost: 3800,
        net_benefit: 10400
      },
      {
        hub_id: 'rotterdam-vlsfo',
        port_name: 'Rotterdam',
        location: { longitude: 4.4144, latitude: 51.9244 },
        fuel_grade: 'VLSFO',
        hub_price: 542.0,
        price_date: '2026-11-21',
        one_way_deviation_nm: 31.0,
        round_trip_deviation_nm: 62.0,
        extra_days: 0.22,
        extra_consumption: 5.5,
        gross_fuel_savings: 15300,
        deviation_cost: 4400,
        net_benefit: 10900
      }
    ]
  };

  const normalized = normalizeBunkerArbitrageSuggestions(realDataBridgePayload);
  assert.equal(normalized.length, 2);

  // Antwerp
  assert.equal(normalized[0].portName, 'Antwerp');
  assert.equal(normalized[0].port_name, 'Antwerp');
  assert.equal(normalized[0].hubPrice, 545.5);
  assert.equal(normalized[0].hub_price, 545.5);
  assert.equal(normalized[0].bunkerPrice, 545.5);
  assert.equal(normalized[0].roundTripDeviationNm, 50.8);
  assert.equal(normalized[0].round_trip_deviation_nm, 50.8);
  assert.equal(normalized[0].extraDays, 0.18);
  assert.equal(normalized[0].extra_days, 0.18);
  assert.equal(normalized[0].grossFuelSavings, 14200);
  assert.equal(normalized[0].gross_fuel_savings, 14200);
  assert.equal(normalized[0].deviationCost, 3800);
  assert.equal(normalized[0].deviation_cost, 3800);
  assert.equal(normalized[0].netBenefit, 10400);
  assert.equal(normalized[0].net_benefit, 10400);
  assert.equal(normalized[0].netSavings, 10400);
  // Leaflet format [latitude, longitude]
  assert.deepEqual(normalized[0].coordinates, [51.2194, 4.4024]);

  // Rotterdam
  assert.equal(normalized[1].portName, 'Rotterdam');
  assert.equal(normalized[1].port_name, 'Rotterdam');
  assert.equal(normalized[1].hubPrice, 542.0);
  assert.equal(normalized[1].hub_price, 542.0);
  assert.equal(normalized[1].roundTripDeviationNm, 62.0);
  assert.equal(normalized[1].netBenefit, 10900);
  assert.deepEqual(normalized[1].coordinates, [51.9244, 4.4144]);
});

test('normalizeBunkerArbitrageSuggestions accepts hubs array and nested data.suggestions payloads', () => {
  const { normalizeBunkerArbitrageSuggestions } = evaluateHelpers();

  // Payload with hubs array
  const hubsPayload = {
    hubs: [
      {
        hub_id: 'gibraltar',
        port_name: 'Gibraltar',
        hub_price: 560,
        round_trip_deviation_nm: 20,
        net_benefit: 8500
      }
    ]
  };
  const fromHubs = normalizeBunkerArbitrageSuggestions(hubsPayload);
  assert.equal(fromHubs.length, 1);
  assert.equal(fromHubs[0].portName, 'Gibraltar');
  assert.equal(fromHubs[0].hubPrice, 560);
  assert.equal(fromHubs[0].roundTripDeviationNm, 20);
  assert.equal(fromHubs[0].netBenefit, 8500);

  // Payload with data.suggestions
  const nestedPayload = {
    data: {
      suggestions: [
        {
          port_name: 'Las Palmas',
          hub_price: 555,
          round_trip_deviation_nm: 80,
          net_benefit: 4200
        }
      ]
    }
  };
  const fromNested = normalizeBunkerArbitrageSuggestions(nestedPayload);
  assert.equal(fromNested.length, 1);
  assert.equal(fromNested[0].portName, 'Las Palmas');
  assert.equal(fromNested[0].netBenefit, 4200);
});

test('normalizeBunkerArbitrageSuggestions preserves backward compatibility with legacy field names', () => {
  const { normalizeBunkerArbitrageSuggestions } = evaluateHelpers();

  const legacyPayload = [
    {
      port: 'Algeciras',
      bunker_price: 570,
      one_way_deviation_nm: 15,
      diversion_days: 0.25,
      gross_savings: 9000,
      diversion_cost: 2500,
      net_savings: 6500,
      coordinates: [36.14, -5.45]
    }
  ];

  const normalized = normalizeBunkerArbitrageSuggestions(legacyPayload);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].portName, 'Algeciras');
  assert.equal(normalized[0].bunkerPrice, 570);
  assert.equal(normalized[0].hubPrice, 570);
  // one_way_deviation_nm * 2
  assert.equal(normalized[0].roundTripDeviationNm, 30);
  assert.equal(normalized[0].extraDays, 0.25);
  assert.equal(normalized[0].grossFuelSavings, 9000);
  assert.equal(normalized[0].deviationCost, 2500);
  assert.equal(normalized[0].netBenefit, 6500);
  assert.equal(normalized[0].netSavings, 6500);
  assert.deepEqual(normalized[0].coordinates, [36.14, -5.45]);
});

test('renderBunkerArbitrageSuggestions cleans feedback and renders cards with net benefit, deviation NM, extra days, and bunker price', () => {
  // Mock DOM environment
  const elements = {};
  function createMockElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      textContent: '',
      children: [],
      classList: {
        classes: new Set(),
        add(...cls) { cls.forEach(c => this.classes.add(c)); },
        remove(...cls) { cls.forEach(c => this.classes.delete(c)); },
        toggle(cls, force) {
          if (force === true) this.classes.add(cls);
          else if (force === false) this.classes.delete(cls);
          else if (this.classes.has(cls)) this.classes.delete(cls);
          else this.classes.add(cls);
        },
        contains(cls) { return this.classes.has(cls); }
      },
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      replaceChildren(...nodes) { this.children = nodes; },
      appendChild(node) { this.children.push(node); return node; },
      append(...nodes) { this.children.push(...nodes); },
      addEventListener() {}
    };
    return el;
  }

  const resultsContainer = createMockElement('div');
  resultsContainer.classList.add('hidden');
  const feedbackElement = createMockElement('p');
  feedbackElement.textContent = 'No hay desvíos más baratos que el puerto de origen con los precios vigentes.';

  elements['bunker-arbitrage-results'] = resultsContainer;
  elements['bunker-arbitrage-feedback'] = feedbackElement;

  const documentMock = {
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { return createMockElement(tag); }
  };

  const windowMock = evaluateHelpers({}, documentMock);

  const testSuggestions = [
    {
      portName: 'Antwerp',
      netBenefit: 10400,
      roundTripDeviationNm: 50.8,
      extraDays: 0.18,
      hubPrice: 545.5,
      bunkerPrice: 545.5
    },
    {
      portName: 'Rotterdam',
      netBenefit: 10900,
      roundTripDeviationNm: 62.0,
      extraDays: 0.22,
      hubPrice: 542.0,
      bunkerPrice: 542.0
    }
  ];

  windowMock.renderBunkerArbitrageSuggestions(testSuggestions);

  // Informative feedback message was cleared/hidden
  assert.equal(feedbackElement.textContent, '');
  assert.ok(feedbackElement.classList.contains('hidden'));

  // Results container is visible
  assert.ok(resultsContainer.classList.contains('flex'));
  assert.ok(!resultsContainer.classList.contains('hidden'));
  assert.equal(resultsContainer.children.length, 2);

  // Antwerp card validation
  const antwerpCard = resultsContainer.children[0];
  assert.equal(
    antwerpCard.className,
    'group inline-flex flex-wrap items-center gap-2 rounded-xl border border-emerald-600 bg-emerald-50/90 px-3.5 py-2.5 text-left text-xs font-bold text-slate-900 shadow-sm transition hover:border-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600'
  );
  assert.equal(antwerpCard.children[0].className, 'fa-solid fa-gas-pump text-emerald-700');
  assert.equal(antwerpCard.children[1].className, 'font-bold text-slate-900');
  const expectedBadgeClass = 'rounded border border-emerald-400/80 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-900';
  assert.equal(antwerpCard.children[2].className, expectedBadgeClass);
  assert.equal(antwerpCard.children[3].className, expectedBadgeClass);
  assert.equal(antwerpCard.children[4].className, expectedBadgeClass);

  const antwerpTexts = antwerpCard.children.map(c => c.textContent).join(' ');
  assert.ok(antwerpTexts.includes('Antwerp'));
  assert.ok(antwerpTexts.includes('10,400'));
  assert.ok(antwerpTexts.includes('51 NM'));
  assert.ok(antwerpTexts.includes('0.18 d'));
  assert.ok(antwerpTexts.includes('$545.50/MT'));

  // Rotterdam card validation
  const rotterdamCard = resultsContainer.children[1];
  assert.equal(
    rotterdamCard.className,
    'group inline-flex flex-wrap items-center gap-2 rounded-xl border border-emerald-600 bg-emerald-50/90 px-3.5 py-2.5 text-left text-xs font-bold text-slate-900 shadow-sm transition hover:border-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600'
  );
  assert.equal(rotterdamCard.children[0].className, 'fa-solid fa-gas-pump text-emerald-700');
  assert.equal(rotterdamCard.children[1].className, 'font-bold text-slate-900');
  assert.equal(rotterdamCard.children[2].className, expectedBadgeClass);
  assert.equal(rotterdamCard.children[3].className, expectedBadgeClass);
  assert.equal(rotterdamCard.children[4].className, expectedBadgeClass);

  const rotterdamTexts = rotterdamCard.children.map(c => c.textContent).join(' ');
  assert.ok(rotterdamTexts.includes('Rotterdam'));
  assert.ok(rotterdamTexts.includes('10,900'));
  assert.ok(rotterdamTexts.includes('62 NM'));
  assert.ok(rotterdamTexts.includes('0.22 d'));
  assert.ok(rotterdamTexts.includes('$542.00/MT'));
});
