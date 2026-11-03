import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { calcularDss } from '../netlify/functions/_shared/dss-calculations.mjs';
const source = readFileSync(new URL('../netlify/functions/madre-chat.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { auditDss } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const body = { current_module: 'decisiones', contexto_ui: { cargoQty: 20000, breakEvenUnitario: 60,
  fleteUnitario: 61.31, allInRateGross: 71.82, dischargeRate: 2000,
  cuaderno_bitacora: { aisFreightRates: { spot: 80 }, capturedAt: '2026-11-03' } } };
const report = (rate) => ({ accion_ui: 'renderizar_auditoria_dss', veredicto_general: '🟡 Revisar',
  reporte_estrategico: `El Radar exige contrastar el margen. Opción B: ${rate} USD/MT. Firmado: MADRE`,
  variables_perjudiciales: [], recomendaciones: [],
  modificaciones_recap: { flete: rate, fleteUnitario: rate, allInRateGross: rate } });
function mockClient(rates, calls) {
  return { chat: { completions: { create: async (request) => {
    calls.push(structuredClone(request));
    if (request.tools) return { choices: [{ message: { role: 'assistant', content: null,
      tool_calls: [{ id: 'calc-1', type: 'function', function: { name: 'delegar_cerebro_ia', arguments: '{}' } }] } }] };
    return { choices: [{ message: { content: JSON.stringify(report(rates.shift())) } }] };
  } } } };
}
test('MADRE calls Cerebro before composing the report with Radar context', async () => {
  const calls = [];
  const result = await auditDss(body, { calcularDss, client: mockClient([80], calls) });
  assert.equal(calls[0].tool_choice.function.name, 'delegar_cerebro_ia');
  assert.match(calls[0].messages[1].content, /aisFreightRates/);
  const raw = JSON.parse(calls[1].messages.find(m => m.role === 'tool').content);
  assert.equal(raw.break_even_usd_mt, 60);
  assert.equal(raw.discharge_days, 10);
  assert.equal(raw.reporte_estrategico, undefined);
  assert.equal(result.source, 'madre-llm');
  assert.equal(result.firmado_por, 'MADRE');
  assert.equal(result.modificaciones_recap.flete, 80);
});
test('below-floor output is rewritten by the model, including prose', async () => {
  const calls = [];
  const result = await auditDss(body, { calcularDss, client: mockClient([65, 80], calls) });
  assert.equal(calls.length, 3);
  assert.match(result.reporte_estrategico, /80 USD/);
});
test('invalid model output never becomes a static audit', async () => {
  await assert.rejects(auditDss(body, { calcularDss, client: mockClient([65, 65], []) }), /invalid_llm_audit/);
  await assert.rejects(auditDss({ contexto_ui: {} }, { calcularDss }), /missing_all_in/);
});
test('missing calculations stay missing instead of inventing voyage defaults', () => {
  const result = calcularDss({});
  assert.equal(result.break_even_usd_mt, null);
  assert.equal(result.margin_pct, null);
  assert.equal(result.reporte_estrategico, undefined);
  assert.ok(result.missing_fields.includes('cargoQty'));
});
for (const file of ['src/DecisionSupportModule.js', 'index.html', 'decisiones.html']) {
  test(`${file}: audit button uses MADRE and never runs static fallback`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const start = text.indexOf('async function solicitarAuditoriaMadre');
    const fn = text.slice(start, text.indexOf('function renderizarAuditoriaDss', start));
    assert.match(fn, /\/api\/madre-chat/);
    assert.doesNotMatch(fn, /\/api\/cerebro-ia|generarAuditoriaMadreFallback\(/);
    assert.match(fn, /cuaderno_bitacora/);
  });
}
