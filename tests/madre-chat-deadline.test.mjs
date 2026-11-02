import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
const source = readFileSync(new URL('../netlify/functions/madre-chat.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { requestVerdict, handler, AI_TIMEOUT_MS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const body = { contexto_ui: { cargoQty: 20000, breakEvenUnitario: 30, fleteUnitario: 25 } };

test('production deadline stays within the requested 8–12 second budget', () => {
  assert.ok(AI_TIMEOUT_MS >= 8000 && AI_TIMEOUT_MS <= 12000);
});

test('deadline aborts even when transport never settles', async () => {
  let signal;
  const start = Date.now();
  const result = await requestVerdict(body, async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }, 20);
  assert.ok(Date.now() - start < 1000);
  assert.equal(signal.aborted, true);
  assert.equal(result.fallback_reason, 'upstream_timeout');
  assert.equal(result.veredicto_general, 'desfavorable');
  assert.equal(result.metrics.break_even_usd_mt, 30);
});

test('deadline includes a stalled response body', async () => {
  const result = await requestVerdict({}, async () => ({ ok: true, json: () => new Promise(() => {}) }), 20);
  assert.equal(result.fallback_reason, 'upstream_timeout');
  assert.equal(result.veredicto_general, 'pendiente_datos');
  assert.equal(result.metrics.freight_usd_mt, null);
});

test('successful remote response preserves structured fields and normalizes text', async () => {
  const result = await requestVerdict(body, async () => Response.json({ texto_preformateado: 'Auditoría real', recomendaciones: ['Revisar'] }), 100);
  assert.equal(result.reply, 'Auditoría real');
  assert.deepEqual(result.recomendaciones, ['Revisar']);
  assert.equal(result.fallback, undefined);
});

test('HTTP, malformed, empty and rejected upstream responses return local verdicts', async () => {
  const cases = [
    async () => new Response('', { status: 504 }),
    async () => new Response('not json'),
    async () => Response.json({}),
    async () => Response.json({ success: false, reply: 'error' }),
    async () => { throw new Error('network'); }
  ];
  const results = await Promise.allSettled(cases.map(fetchImpl => requestVerdict(body, fetchImpl, 100)));
  for (const result of results) {
    assert.equal(result.status, 'fulfilled');
    assert.equal(result.value.fallback, true);
    assert.ok(result.value.reply);
  }
});

test('handler handles preflight, invalid methods and malformed JSON without network', async () => {
  assert.equal((await handler(new Request('https://example.com', { method: 'OPTIONS' }))).status, 204);
  assert.equal((await handler(new Request('https://example.com'))).status, 405);
  assert.equal((await handler(new Request('https://example.com', { method: 'POST', body: '{' }))).status, 400);
});
