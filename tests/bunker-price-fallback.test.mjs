import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  extractBixWorldPrices,
  extractShipAndBunkerGlobalPrices,
} from '../netlify/functions/_shared/bunker-price-parser.mjs';

const functionSource = await readFile(new URL('../netlify/functions/get-bunker-prices.js', import.meta.url), 'utf8');
const executableFunctionSource = functionSource.replace(
  '"./_shared/bunker-price-parser.mjs"',
  JSON.stringify(new URL('../netlify/functions/_shared/bunker-price-parser.mjs', import.meta.url).href),
);
const bunkerFunctionModule = await import(`data:text/javascript;base64,${Buffer.from(executableFunctionSource).toString('base64')}`);

function htmlResponse(html, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => html,
  };
}

test('Bunker Index parser finds World semantically without legacy classes or hrefs', () => {
  const html = `
    <section data-widget="indices">
      <header><h3>Latest BIX Indices</h3></header>
      <div class="redesigned-market-grid">
        <table>
          <thead><tr><th>Index</th><th>IFO 380</th><th>VLSFO</th><th>MGO</th></tr></thead>
          <tbody><tr><td><span>World</span></td><td>$487.25</td><td>US$ 632.50</td><td>USD 811.75</td></tr></tbody>
        </table>
      </div>
    </section>`;

  assert.deepEqual(extractBixWorldPrices(html), {
    ifo380: 487.25,
    vlsfo: 632.5,
    mgo: 811.75,
  });
});

test('Bunker Index parser supports the nested World price layout', () => {
  const html = `
    <aside>
      <h4>BIX Indices</h4>
      <table>
        <tr><th>Index</th><th>IFO 380</th><th>VLSFO</th><th>MGO</th></tr>
        <tr><td><a>World</a></td><td><table><tr><td>490.00</td><td>640.00</td><td>820.00</td></tr></table></td></tr>
      </table>
    </aside>`;

  assert.deepEqual(extractBixWorldPrices(html), {
    ifo380: 490,
    vlsfo: 640,
    mgo: 820,
  });
});

test('Ship & Bunker fallback extracts the Global Average Bunker Price row', () => {
  const html = `
    <main>
      <h2>Global Average Bunker Prices</h2>
      <div class="price-table-v3">
        <table>
          <thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th><th>IFO380</th></tr></thead>
          <tbody>
            <tr><td>Singapore</td><td>620</td><td>780</td><td>470</td></tr>
            <tr><td>Global Average Bunker Price</td><td>635.10</td><td>804.20</td><td>481.30</td></tr>
          </tbody>
        </table>
      </div>
    </main>`;

  assert.deepEqual(extractShipAndBunkerGlobalPrices(html), {
    ifo380: 481.3,
    vlsfo: 635.1,
    mgo: 804.2,
  });
});

test('endpoint attempts Ship & Bunker only after Bunker Index transports', () => {
  const bunkerIndexPosition = functionSource.indexOf('name: "Bunker Index"');
  const shipAndBunkerPosition = functionSource.indexOf('name: "Ship & Bunker"');
  assert.ok(bunkerIndexPosition > -1);
  assert.ok(shipAndBunkerPosition > bunkerIndexPosition);
  assert.match(functionSource, /SHIP_AND_BUNKER_URL = "https:\/\/shipandbunker\.com\/prices\/av"/);
  assert.match(functionSource, /parser: extractShipAndBunkerGlobalPrices/);
  assert.match(functionSource, /return \{ \.\.\.prices, source: source\.name, transport, attempts \}/);
  assert.match(functionSource, /No se pudieron extraer precios de Bunker Index ni Ship & Bunker/);
});

test('endpoint automatically returns Ship & Bunker prices when Bunker Index parsing fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SCRAPER_API_URL;
  const originalToken = process.env.SCRAPER_API_TOKEN;
  const requests = [];
  delete process.env.SCRAPER_API_URL;
  delete process.env.SCRAPER_API_TOKEN;
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    if (String(input).includes('bunkerindex.com')) return htmlResponse('<html><body>blocked</body></html>');
    return htmlResponse(`
      <h2>Global Average Bunker Prices</h2>
      <table>
        <tr><th>Location</th><th>IFO 380</th><th>VLSFO</th><th>MGO</th></tr>
        <tr><td>Global Average Bunker Price</td><td>482.40</td><td>636.70</td><td>806.20</td></tr>
      </table>`);
  };

  try {
    const response = await bunkerFunctionModule.handler({ httpMethod: 'GET' }, {});
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(requests, [
      'https://www.bunkerindex.com/',
      'https://shipandbunker.com/prices/av',
    ]);
    assert.equal(payload.vlsfo, 636.7);
    assert.equal(payload.ifo380, 482.4);
    assert.equal(payload.mgo, 806.2);
    assert.equal(payload.source, 'Ship & Bunker');
    assert.equal(payload.transport, 'direct');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SCRAPER_API_URL;
    else process.env.SCRAPER_API_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SCRAPER_API_TOKEN;
    else process.env.SCRAPER_API_TOKEN = originalToken;
  }
});

test('endpoint keeps the validated empty error contract when both websites fail', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SCRAPER_API_URL;
  const originalToken = process.env.SCRAPER_API_TOKEN;
  delete process.env.SCRAPER_API_URL;
  delete process.env.SCRAPER_API_TOKEN;
  globalThis.fetch = async () => htmlResponse('<html><body>no bunker prices</body></html>');

  try {
    const response = await bunkerFunctionModule.handler({ httpMethod: 'GET' }, {});
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 502);
    assert.equal(payload.ok, false);
    assert.equal(payload.vlsfo, undefined);
    assert.equal(payload.mgo, undefined);
    assert.equal(payload.ifo380, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SCRAPER_API_URL;
    else process.env.SCRAPER_API_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SCRAPER_API_TOKEN;
    else process.env.SCRAPER_API_TOKEN = originalToken;
  }
});
