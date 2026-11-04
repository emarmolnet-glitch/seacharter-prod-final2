import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const file of ['src/DecisionSupportModule.js', 'decisiones.html']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const start = source.indexOf('async function solicitarAuditoriaMadre');
  const fn = source.slice(start, source.lastIndexOf('}', source.indexOf('function renderizarAuditoriaDss', start)) + 1);
  const audit = { accion_ui: 'renderizar_auditoria_dss', reporte_estrategico: 'Informe estratégico',
    modificaciones_recap: { flete: 'Incrementar a $68.00/MT' } };
  for (const [label, response, accepted] of [
    ['unsigned report with descriptive freight', audit, true],
    ['report without recap', { accion_ui: audit.accion_ui }, true],
    ['command after unrelated commands', { uiComandos: [{ accion_ui: 'otra' }, audit] }, true],
    ['payload command', { payload: { uiComandos: [audit] } }, true],
    ['data report', { data: audit }, true],
    ['auditoria report', { auditoria: audit }, true],
    ['unrelated action', { accion_ui: 'otra' }, false],
    ['invalid commands', { uiComandos: [null, {}, { accion_ui: 'otra' }] }, false],
    ['missing response', null, false]
  ]) {
    test(`${file}: ${label}`, async () => {
      const rendered = [];
      const errors = [];
      const button = { innerHTML: 'Auditoría MADRE', disabled: false };
      const context = vm.createContext({
        document: { getElementById: id => id === 'btn-auditoria-madre' ? button : null },
        window: { dssFormState: { allInRateGross: 71.82 } },
        fetch: async () => ({ ok: true, json: async () => response }),
        renderizarAuditoriaDss: value => rendered.push(value),
        console: { error: (...args) => errors.push(args) }
      });
      await vm.runInContext(`(${fn})()`, context);
      assert.equal(rendered.length, accepted ? 1 : 0);
      assert.equal(errors.length, accepted ? 0 : 1);
      if (accepted) assert.equal(rendered[0].accion_ui, audit.accion_ui);
      assert.equal(button.disabled, false);
      assert.equal(button.innerHTML, 'Auditoría MADRE');
    });
  }
}
