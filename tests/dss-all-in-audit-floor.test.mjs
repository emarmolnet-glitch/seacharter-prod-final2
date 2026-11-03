import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

const source = readFileSync(new URL('../netlify/functions/madre-chat.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { requestVerdict, DIRECTIVA_DSS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('remote MADRE receives the actual All-In floor and critical directive', async () => {
  const body = { mensajeUsuario: 'Dictamen Ejecutivo', contexto_ui: { fleteUnitario: 61.31, allInRateGross: 71.82 } };
  await requestVerdict(body, async (_url, options) => {
    const sent = JSON.parse(options.body);
    assert.equal(sent.contexto_ui.allInRateGross, 71.82);
    assert.equal(sent.contexto_ui.flete_all_in_gross_usd_mt, 71.82);
    assert.equal(sent.contexto_ui.fleteUnitario, 61.31);
    assert.ok(sent.systemInstruction.includes(DIRECTIVA_DSS));
    assert.match(sent.mensajeUsuario, /71\.82/);
    return Response.json({ reply: 'Dictamen' });
  });
  assert.equal(body.contexto_ui.directiva_dss, undefined);
});

for (const file of ['src/DecisionSupportModule.js', 'index.html', 'decisiones.html', 'netlify/functions/cerebro-ia.js']) {
  test(`${file}: strategic Option B adds margin above All-In`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const match = text.match(/(?:export )?function (?:generarAuditoriaMadreFallback|buildDssStrategicAuditResponse)\([^)]*\) \{[\s\S]*?\n\s*\}/);
    // Extract the complete function through the next declaration (nested return objects included).
    const start = text.indexOf(match[0]);
    const end = text.indexOf('\n}', start);
    const fn = file.endsWith('.html')
      ? text.slice(start, text.indexOf('async function solicitarAuditoriaMadre', start)).trim()
      : text.slice(start, end + 2);
    const build = new Function(`${fn.replace(/^export /, '')}; return ${file.includes('cerebro') ? 'buildDssStrategicAuditResponse' : 'generarAuditoriaMadreFallback'};`)();
    const result = build({ fleteUnitario: 61.31, breakEvenUnitario: 61.31, allInRateGross: 71.82 });
    assert.equal(result.modificaciones_recap.allInRateGross, 77.57);
    assert.match(result.reporte_estrategico, /77\.57/);
  });
}
