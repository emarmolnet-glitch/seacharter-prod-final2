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
    return { choices: [{ message: { content: JSON.stringify(report(rates.shift())) } }] };
  } } } };
}
test('MADRE calculates before a single report request with voyage and Radar context', async () => {
  const calls = [];
  let calculated = false;
  const client = mockClient([80], calls);
  const create = client.chat.completions.create;
  client.chat.completions.create = request => {
    assert.equal(calculated, true);
    return create(request);
  };
  const result = await auditDss(body, { calcularDss: ui => {
    calculated = true;
    return calcularDss(ui);
  }, client });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tools, undefined);
  assert.equal(calls[0].tool_choice, undefined);
  assert.equal(calls[0].response_format.type, 'json_object');
  assert.match(calls[0].messages[1].content, /aisFreightRates/);
  const payload = JSON.parse(calls[0].messages[1].content);
  assert.equal(payload.viaje.allInRateGross, 71.82);
  const raw = payload.calculos_cerebro;
  assert.equal(raw.break_even_usd_mt, 60);
  assert.equal(raw.discharge_days, 10);
  assert.equal(raw.reporte_estrategico, undefined);
  assert.equal(result.source, 'madre-llm');
  assert.equal(result.firmado_por, 'MADRE');
  assert.equal(result.modificaciones_recap.flete, 80);
});
test('below-floor output is corrected by a second model request including prose', async () => {
  const calls = [];
  let calculationCount = 0;
  const result = await auditDss(body, {
    calcularDss: ui => { calculationCount++; return calcularDss(ui); },
    client: mockClient([65, 80], calls)
  });
  assert.equal(calls.length, 2);
  assert.equal(calculationCount, 1);
  assert.deepEqual(calls[1].messages.slice(0, 2), calls[0].messages);
  assert.equal(calls[1].messages[2].role, 'assistant');
  assert.equal(JSON.parse(calls[1].messages[2].content).modificaciones_recap.flete, 65);
  assert.equal(calls[1].messages[3].role, 'user');
  assert.match(calls[1].messages[3].content, /números iguales >= 71\.82 USD\/MT/);
  assert.match(calls[1].messages[3].content, /Reescribe también la prosa/);
  for (const request of calls) {
    assert.equal(request.tools, undefined);
    assert.equal(request.tool_choice, undefined);
  }
  assert.equal(result.success, true);
  assert.equal(result.modificaciones_recap.flete, 80);
  assert.equal(result.modificaciones_recap.fleteUnitario, 80);
  assert.equal(result.modificaciones_recap.allInRateGross, 80);
  assert.match(result.reporte_estrategico, /80 USD\/MT/);
});
test('invalid model output fails only after two attempts and never becomes a static audit', async () => {
  const calls = [];
  await assert.rejects(auditDss(body, { calcularDss, client: mockClient([65, 65, 80], calls) }), /invalid_llm_audit/);
  assert.equal(calls.length, 2);
  await assert.rejects(auditDss({ contexto_ui: {} }, { calcularDss }), /missing_all_in/);
});
test('malformed JSON is corrected with an additional report request', async () => {
  const calls = [];
  const client = mockClient([80], calls);
  const create = client.chat.completions.create;
  client.chat.completions.create = async request => {
    if (!calls.length) {
      calls.push(structuredClone(request));
      return { choices: [{ message: { content: 'invalid json' } }] };
    }
    return create(request);
  };
  const result = await auditDss(body, { calcularDss, client });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages[2].content, 'invalid json');
  assert.equal(result.success, true);
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
    assert.match(fn, /\/api\/databridge\/madre-chat/);
    assert.doesNotMatch(fn, /\/api\/cerebro-ia|generarAuditoriaMadreFallback\(/);
    assert.match(fn, /cuaderno_bitacora/);
  });
}
