import test from 'node:test';
import assert from 'node:assert/strict';

import iContainersService, {
  BASE_URL,
  IContainersApiError,
  apiRequest,
  searchMaritimePlaces,
  searchAerialPlaces,
  createFclQuote,
  createLclQuote,
  createAirQuote,
  createLtlQuote,
  createEcommerceOrder,
  formatQuoteResponse,
  extractMainQuote,
} from '../netlify/functions/lib/icontainers.js';

import * as serviceFromRoot from '../services/icontainers-service.js';

// Helper to create mock fetch responses
function createMockFetch(handler) {
  return async (url, init = {}) => {
    const result = await handler(url, init);
    const status = result.status ?? 200;
    const statusText = result.statusText ?? (status === 200 ? 'OK' : 'Error');
    const headers = new Map(Object.entries(result.headers || { 'content-type': 'application/json' }));
    const bodyText = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: {
        get: (name) => headers.get(name.toLowerCase()) || null,
      },
      json: async () => JSON.parse(bodyText),
      text: async () => bodyText,
    };
  };
}

test('iContainers Service - Base URL and Exports', () => {
  assert.equal(BASE_URL, 'https://brutus-dev.icontainers.com');
  assert.equal(typeof searchMaritimePlaces, 'function');
  assert.equal(typeof searchAerialPlaces, 'function');
  assert.equal(typeof createFclQuote, 'function');
  assert.equal(typeof createLclQuote, 'function');
  assert.equal(typeof createAirQuote, 'function');
  assert.equal(typeof createLtlQuote, 'function');
  assert.equal(typeof createEcommerceOrder, 'function');
  assert.equal(typeof formatQuoteResponse, 'function');
  assert.equal(typeof extractMainQuote, 'function');
  assert.equal(typeof apiRequest, 'function');

  // Verify re-export from services/icontainers-service.js
  assert.equal(serviceFromRoot.BASE_URL, BASE_URL);
  assert.equal(typeof serviceFromRoot.createFclQuote, 'function');
  assert.equal(typeof serviceFromRoot.default.createFclQuote, 'function');
});

test('iContainers Service - apiRequest injects Bearer token and headers', async () => {
  let capturedUrl = '';
  let capturedInit = {};

  const mockFetch = createMockFetch((url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      status: 200,
      body: { success: true },
    };
  });

  const response = await apiRequest('/api/v1/test', {
    method: 'POST',
    body: { foo: 'bar' },
    apiKey: 'test-secret-token-12345',
    fetchFn: mockFetch,
  });

  assert.deepEqual(response, { success: true });
  assert.equal(capturedUrl, 'https://brutus-dev.icontainers.com/api/v1/test');
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.headers.Authorization, 'Bearer test-secret-token-12345');
  assert.equal(capturedInit.headers['Content-Type'], 'application/json');
  assert.equal(capturedInit.headers.Accept, 'application/json');
  assert.equal(capturedInit.body, JSON.stringify({ foo: 'bar' }));
});

test('iContainers Service - apiRequest error handling on HTTP error response', async () => {
  const mockFetch = createMockFetch(() => ({
    status: 401,
    statusText: 'Unauthorized',
    body: { message: 'Invalid or expired API token' },
  }));

  await assert.rejects(
    async () => {
      await apiRequest('/api/v1/quotes/fcl', {
        fetchFn: mockFetch,
      });
    },
    (err) => {
      assert.ok(err instanceof IContainersApiError);
      assert.equal(err.status, 401);
      assert.equal(err.statusText, 'Unauthorized');
      assert.match(err.message, /Invalid or expired API token/);
      assert.deepEqual(err.details, { message: 'Invalid or expired API token' });
      return true;
    }
  );
});

test('iContainers Service - apiRequest error handling on network failure', async () => {
  const failingFetch = async () => {
    throw new Error('Connection refused');
  };

  await assert.rejects(
    async () => {
      await apiRequest('/api/v1/test', { fetchFn: failingFetch });
    },
    (err) => {
      assert.ok(err instanceof IContainersApiError);
      assert.equal(err.status, 0);
      assert.equal(err.statusText, 'NETWORK_ERROR');
      assert.match(err.message, /Connection refused/);
      return true;
    }
  );
});

test('searchMaritimePlaces - performs GET request with encoded term and shipmentType', async () => {
  let requestedUrl = '';
  let requestedMethod = '';

  const mockFetch = createMockFetch((url, init) => {
    requestedUrl = url;
    requestedMethod = init.method;
    return {
      status: 200,
      body: [
        { id: 'ESVLC', name: 'Valencia Port', country: 'Spain', unlocode: 'ESVLC' },
      ],
    };
  });

  const results = await searchMaritimePlaces('Valencia Port', 'FCL', { fetchFn: mockFetch });

  assert.equal(requestedMethod, 'GET');
  assert.equal(
    requestedUrl,
    'https://brutus-dev.icontainers.com/api/v1/locations/maritime/places?term=Valencia+Port&shipmentType=FCL'
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].unlocode, 'ESVLC');

  // Shipment type LCL
  await searchMaritimePlaces('Hamburg', 'LCL', { fetchFn: mockFetch });
  assert.ok(requestedUrl.includes('shipmentType=LCL'));

  // Invalid shipment type throws
  await assert.rejects(
    async () => searchMaritimePlaces('Valencia', 'AIR'),
    /Invalid shipmentType "AIR"/
  );

  // Empty term returns empty array without network call
  const emptyRes = await searchMaritimePlaces('   ');
  assert.deepEqual(emptyRes, []);
});

test('searchAerialPlaces - performs GET request with encoded term', async () => {
  let requestedUrl = '';
  let requestedMethod = '';

  const mockFetch = createMockFetch((url, init) => {
    requestedUrl = url;
    requestedMethod = init.method;
    return {
      status: 200,
      body: [
        { iata: 'MAD', name: 'Adolfo Suárez Madrid-Barajas', country: 'Spain' },
      ],
    };
  });

  const results = await searchAerialPlaces('Madrid Barajas', { fetchFn: mockFetch });

  assert.equal(requestedMethod, 'GET');
  assert.equal(
    requestedUrl,
    'https://brutus-dev.icontainers.com/api/v1/locations/aerial/places?term=Madrid+Barajas'
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].iata, 'MAD');

  // Empty term returns empty array
  const emptyRes = await searchAerialPlaces('');
  assert.deepEqual(emptyRes, []);
});

test('createFclQuote - structures JSON body with portIsoCode and extracts primary rate', async () => {
  let capturedBody = null;

  const mockResponse = {
    uuid: 'fcl-quote-uuid-9876',
    rates: [
      {
        id: 'rate-fcl-1',
        carrier: 'Maersk Line',
        carrierCode: 'MAEU',
        totalAmount: 1850.00,
        currency: 'USD',
        transitTime: 22,
        validUntil: '2026-11-15',
        oceanFreight: 1500.00,
        breakdown: [
          { name: 'Ocean Freight', amount: 1500.00 },
          { name: 'Bunker Adjustment (BAF)', amount: 250.00 },
          { name: 'THC Origin', amount: 100.00 },
        ],
      },
      {
        id: 'rate-fcl-2',
        carrier: 'Hapag-Lloyd',
        totalAmount: 1980.00,
        currency: 'USD',
        transitTime: 20,
      },
    ],
  };

  const mockFetch = createMockFetch((url, init) => {
    capturedBody = JSON.parse(init.body);
    return { status: 200, body: mockResponse };
  });

  const result = await createFclQuote(
    {
      originIso: 'ESVLC',
      destIso: 'USMIA',
      containers: [{ containerType: '40HC', quantity: 2 }],
    },
    { fetchFn: mockFetch }
  );

  // Check structured body
  assert.deepEqual(capturedBody, {
    origin: { type: 'port', portIsoCode: 'ESVLC' },
    destination: { type: 'port', portIsoCode: 'USMIA' },
    containers: [{ containerType: '40HC', quantity: 2 }],
  });

  // Check extracted clean response
  assert.equal(result.uuid, 'fcl-quote-uuid-9876');
  assert.equal(result.hasRates, true);
  assert.equal(result.rates.length, 2);
  assert.equal(result.primaryRate.id, 'rate-fcl-1');
  assert.equal(result.primaryRate.carrier, 'Maersk Line');
  assert.equal(result.primaryRate.totalAmount, 1850.00);
  assert.equal(result.primaryRate.currency, 'USD');
  assert.equal(result.primaryRate.transitTimeDays, 22);
  assert.equal(result.primaryRate.validUntil, '2026-11-15');
  assert.equal(result.primaryRate.oceanFreight, 1500.00);
  assert.equal(result.primaryRate.breakdown.length, 3);
});

test('createLclQuote - structures JSON body with portIsoCode, cargo and extracts primary rate', async () => {
  let capturedBody = null;

  const mockResponse = {
    uuid: 'lcl-quote-uuid-5544',
    rates: [
      {
        id: 'rate-lcl-1',
        carrier: 'Vanguard Logistics',
        totalAmount: 420.50,
        currency: 'EUR',
        transitTime: 18,
        oceanFreight: 320.00,
      },
    ],
  };

  const mockFetch = createMockFetch((url, init) => {
    capturedBody = JSON.parse(init.body);
    return { status: 200, body: mockResponse };
  });

  const cargoSpec = {
    volumeM3: 4.5,
    grossWeightKg: 1200,
    packagesCount: 3,
    packageType: 'PALLET',
  };

  const result = await createLclQuote(
    {
      originIso: 'ESBCN',
      destIso: 'USNYC',
      cargo: cargoSpec,
    },
    { fetchFn: mockFetch }
  );

  assert.deepEqual(capturedBody, {
    origin: { type: 'port', portIsoCode: 'ESBCN' },
    destination: { type: 'port', portIsoCode: 'USNYC' },
    cargo: cargoSpec,
  });

  assert.equal(result.uuid, 'lcl-quote-uuid-5544');
  assert.equal(result.hasRates, true);
  assert.equal(result.primaryRate.carrier, 'Vanguard Logistics');
  assert.equal(result.primaryRate.totalAmount, 420.50);
  assert.equal(result.primaryRate.currency, 'EUR');
});

test('createAirQuote - structures JSON body with iataCode, cargo, ready date and known shipper', async () => {
  let capturedBody = null;

  const mockResponse = {
    uuid: 'air-quote-uuid-1122',
    rates: [
      {
        id: 'rate-air-1',
        carrier: 'Iberia Cargo',
        carrierCode: 'IB',
        totalAmount: 1450.00,
        currency: 'USD',
        transitTime: 3,
        airFreight: 1200.00,
      },
    ],
  };

  const mockFetch = createMockFetch((url, init) => {
    capturedBody = JSON.parse(init.body);
    return { status: 200, body: mockResponse };
  });

  const cargo = {
    dimensions: { length: 120, width: 80, height: 100, unit: 'cm' },
    weight: { value: 350, unit: 'kg' },
    pieces: 2,
  };

  const result = await createAirQuote(
    {
      originIata: 'MAD',
      destIata: 'JFK',
      cargo,
      cargoReadyDate: '2026-10-20',
      isKnownShipper: true,
    },
    { fetchFn: mockFetch }
  );

  assert.deepEqual(capturedBody, {
    origin: { type: 'airport', iataCode: 'MAD' },
    destination: { type: 'airport', iataCode: 'JFK' },
    cargo,
    cargoReadyDate: '2026-10-20',
    isKnownShipper: true,
  });

  assert.equal(result.uuid, 'air-quote-uuid-1122');
  assert.equal(result.primaryRate.carrier, 'Iberia Cargo');
  assert.equal(result.primaryRate.totalAmount, 1450.00);
  assert.equal(result.primaryRate.transitTimeDays, 3);
});

test('createLtlQuote - structures JSON body for US domestic ground quote with postalCode and US country', async () => {
  let capturedBody = null;

  const mockResponse = {
    uuid: 'ltl-quote-uuid-3344',
    rates: [
      {
        id: 'rate-ltl-1',
        carrier: 'Old Dominion Freight Line',
        totalAmount: 640.00,
        currency: 'USD',
        transitTime: 4,
      },
    ],
  };

  const mockFetch = createMockFetch((url, init) => {
    capturedBody = JSON.parse(init.body);
    return { status: 200, body: mockResponse };
  });

  const cargo = {
    pallets: 2,
    weightLbs: 1500,
  };

  const result = await createLtlQuote(
    {
      originZip: '33101',
      destZip: '90001',
      cargo,
      freightClass: '85',
    },
    { fetchFn: mockFetch }
  );

  assert.deepEqual(capturedBody, {
    origin: { type: 'postalCode', postalCode: '33101', country: 'US' },
    destination: { type: 'postalCode', postalCode: '90001', country: 'US' },
    freightClass: '85',
    cargo,
  });

  assert.equal(result.uuid, 'ltl-quote-uuid-3344');
  assert.equal(result.primaryRate.carrier, 'Old Dominion Freight Line');
  assert.equal(result.primaryRate.totalAmount, 640.00);
});

test('createEcommerceOrder - structures body for Amazon FBA orders', async () => {
  let capturedBody = null;

  const mockResponse = {
    id: 'eco-order-7788',
    status: 'SUBMITTED',
    trackingNumber: '1Z9999999999999999',
  };

  const mockFetch = createMockFetch((url, init) => {
    capturedBody = JSON.parse(init.body);
    return { status: 200, body: mockResponse };
  });

  const orderParams = {
    serviceType: 'LAST_MILE',
    hubCode: 'ONT8',
    shipper: { name: 'Acme Exports', address: 'Calle Mayor 10, Madrid' },
    consignee: { name: 'Amazon Fulfillment Center ONT8', address: '24300 Nandina Ave, Moreno Valley, CA' },
    packageData: { cartons: 50, totalWeightKg: 450, asin: 'B08N5WRWNW' },
  };

  const result = await createEcommerceOrder(orderParams, { fetchFn: mockFetch });

  assert.deepEqual(capturedBody, orderParams);
  assert.equal(result.success, true);
  assert.equal(result.orderId, 'eco-order-7788');
  assert.equal(result.trackingNumber, '1Z9999999999999999');
  assert.equal(result.status, 'SUBMITTED');
});

test('formatQuoteResponse - safely handles empty or malformed rates', () => {
  const emptyRes = formatQuoteResponse(null);
  assert.equal(emptyRes.uuid, null);
  assert.equal(emptyRes.primaryRate, null);
  assert.equal(emptyRes.hasRates, false);
  assert.deepEqual(emptyRes.rates, []);

  const noRatesRes = formatQuoteResponse({ uuid: 'abc-123', rates: [] });
  assert.equal(noRatesRes.uuid, 'abc-123');
  assert.equal(noRatesRes.primaryRate, null);
  assert.equal(noRatesRes.hasRates, false);
});
