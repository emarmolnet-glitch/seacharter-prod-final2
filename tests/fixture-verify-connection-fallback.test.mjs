import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('        async function verifyDataBridgeConnection(');
const end = html.indexOf('\n        /**', start);
const pdfStart = html.indexOf('        async function generateFixtureRecapPDF(');
const pdfEnd = html.indexOf('        window.generateFixtureRecapPDF =', pdfStart);

function setup(fetch) {
  const pending = [], toasts = [], verified = [], exports = [];
  let timer, cleared = false, delay, closed = false;
  const snapshot = Object.freeze({
    state: Object.freeze({ pol: 'Bilbao', pod: 'Lima' }),
    html: '<p>Approved fixture</p>', executiveHTML: '<p>Approved strategy</p>'
  });
  const window = { fetch, State: { fixtureRecapSnapshot: snapshot } };
  const context = vm.createContext({
    window, AbortController,
    document: { getElementById: () => null },
    DATA_BRIDGE_VERIFY_ENDPOINT: '/api/verify-connection',
    getStoredDataBridgeToken: () => '',
    setDataBridgeLinkPending: value => pending.push(value),
    setDataBridgeVerifiedConnection: value => verified.push(value),
    updateDataBridgeConnectionIndicator() {},
    closeDataBridgeLinkModal: () => { closed = true; },
    showToast: message => toasts.push(message),
    setTimeout: (callback, ms) => { timer = callback; delay = ms; return 1; },
    clearTimeout: () => { cleared = true; },
    ensurePdfLibrariesLoaded: async () => {},
    getDSSCurrentState: () => { throw new Error('Must use frozen snapshot'); },
    exportFixtureRecapInFrame: async value => { exports.push(value); },
    console: { error: (...args) => { throw new Error(`Unexpected PDF failure: ${args[0]}`); } }
  });
  vm.runInContext(html.slice(start, end) + html.slice(pdfStart, pdfEnd), context);
  return { context, window, snapshot, pending, toasts, verified, exports,
    expire: () => { assert.equal(delay, 5000); timer(); },
    cleared: () => cleared, closed: () => closed };
}

async function assertLocalExport(ctx, verification) {
  assert.equal(await verification, false);
  assert.deepEqual(ctx.pending, [true, false]);
  assert.deepEqual(ctx.verified, [false]);
  assert.equal(ctx.cleared(), true);
  assert.equal(ctx.window.State.fixtureRecapSnapshot, ctx.snapshot);
  assert.match(ctx.toasts[0], /snapshot local/);
  await ctx.context.generateFixtureRecapPDF({ includeExecutiveReport: true });
  assert.equal(ctx.exports[0], '<div><p>Approved fixture</p><p>Approved strategy</p></div>');
}

for (const status of [502, 503]) {
  test(`HTTP ${status} releases UI and allows PDF from session snapshot`, async () => {
    const ctx = setup(async () => ({ ok: false, status,
      json: () => { throw new Error('Gateway body must not be read'); } }));
    await assertLocalExport(ctx, ctx.context.verifyDataBridgeConnection());
  });
}

test('network rejection allows local PDF', async () => {
  const ctx = setup(async () => { throw new TypeError('Failed to fetch'); });
  await assertLocalExport(ctx, ctx.context.verifyDataBridgeConnection());
});

for (const stalledBody of [false, true]) {
  test(`five-second deadline handles stalled ${stalledBody ? 'body' : 'fetch'} and aborts transport`, async () => {
    let signal;
    const ctx = setup(async (_url, options) => {
      signal = options.signal;
      if (!stalledBody) return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    });
    const verification = ctx.context.verifyDataBridgeConnection();
    await Promise.resolve();
    ctx.expire();
    await assertLocalExport(ctx, verification);
    assert.equal(signal.aborted, true);
  });
}

test('late success after timeout cannot mark connection verified', async () => {
  let resolve;
  const ctx = setup(() => new Promise(done => { resolve = done; }));
  const verification = ctx.context.verifyDataBridgeConnection();
  ctx.expire();
  await assertLocalExport(ctx, verification);
  resolve({ ok: true, json: async () => ({ success: true }) });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(ctx.verified, [false]);
});

test('successful verification clears timeout and closes connection modal', async () => {
  const ctx = setup(async () => ({ ok: true, json: async () => ({ status: 'connected' }) }));
  assert.equal(await ctx.context.verifyDataBridgeConnection(), true);
  assert.deepEqual(ctx.verified, [true]);
  assert.deepEqual(ctx.pending, [true, false]);
  assert.equal(ctx.cleared(), true);
  assert.equal(ctx.closed(), true);
});
