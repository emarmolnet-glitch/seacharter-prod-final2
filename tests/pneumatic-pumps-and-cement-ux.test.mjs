import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('UX Operativas Cemento: option Bombas Neumáticas exists in POL and POD selectors', () => {
  const polSelectMatch = indexSource.match(/<select[^>]*id="metodo_carga"[^>]*>([\s\S]*?)<\/select>/);
  const podSelectMatch = indexSource.match(/<select[^>]*id="metodo_descarga_pod"[^>]*>([\s\S]*?)<\/select>/);

  assert.ok(polSelectMatch, 'metodo_carga select element must exist');
  assert.ok(podSelectMatch, 'metodo_descarga_pod select element must exist');

  assert.match(polSelectMatch[1], /<option value="bombas_neumaticas">Bombas Neumáticas<\/option>/);
  assert.match(podSelectMatch[1], /<option value="bombas_neumaticas">Bombas Neumáticas<\/option>/);
});

test('UX Operativas Cemento: TURN TIME TOTAL (H) supports 10 hours option', () => {
  const turnTimeSelectMatch = indexSource.match(/<select[^>]*id="turn-time-hours"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(turnTimeSelectMatch, 'turn-time-hours select element must exist');
  assert.match(turnTimeSelectMatch[1], /<option value="10">10 horas<\/option>/);
  assert.match(indexSource, /const TURN_TIME_OPTIONS = Object\.freeze\(\[\s*Object\.freeze\(\{ value: 10, label: '10 horas' \}\)/);
});

test('UX Operativas Cemento: helper text references exist near RITMO REAL POL and POD', () => {
  assert.match(indexSource, /id="rate-ref-helper-pol"/);
  assert.match(indexSource, /id="rate-ref-helper-pod"/);
  assert.match(indexSource, /Ref\. Handysize \(Bombas\/Cintas\): 12,000 - 24,000 TM\/D/);
  assert.match(indexSource, /Ref\. Panamax\/Kamsarmax \(Cintas\): 72,000 - 144,000 TM\/D/);
});

test('UX Operativas Cemento: Cinta Transportadora sets 3600 TM/D and 12h turn time by default', () => {
  const rateInputPol = { value: '0', dataset: {} };
  const turnTimeSelect = { value: '24' };

  const context = {
    window: {
      State: { cargo: 10000, vesselType: 'Mini Bulker' },
      hasCommittedCargoSelection: () => true,
      getSelectedMethodLabel: () => 'Cinta Transportadora',
      recalcularDiasPuerto: () => {}
    },
    document: {
      getElementById: (id) => {
        if (id === 'cargo-qty') return { value: '10000' };
        if (id === 'metodo_carga') return { value: 'cinta_transportadora' };
        if (id === 'rate-load') return rateInputPol;
        if (id === 'turn-time-hours') return turnTimeSelect;
        return null;
      }
    }
  };

  const script = `
    ${indexSource.match(/function applyMethodAndProductConditions\([\s\S]*?\n        \}/)[0]}
    window.applyMethodAndProductConditions = applyMethodAndProductConditions;
  `;

  vm.runInNewContext(script, context);
  context.window.applyMethodAndProductConditions('pol');

  assert.equal(rateInputPol.value, '3600', 'Cinta Transportadora defaults to 3600 TM/D for Mini-Bulker');
  assert.equal(turnTimeSelect.value, '12', 'Cinta Transportadora sets turn time to 12 hours');
});

test('UX Operativas Cemento: Bombas Neumáticas sets 8000 TM/D and 10h turn time by default', () => {
  const rateInputPod = { value: '0', dataset: {} };
  const turnTimeSelect = { value: '24' };

  const context = {
    window: {
      State: { cargo: 10000, vesselType: 'Mini Bulker' },
      hasCommittedCargoSelection: () => true,
      getSelectedMethodLabel: () => 'Bombas Neumáticas',
      recalcularDiasPuerto: () => {}
    },
    document: {
      getElementById: (id) => {
        if (id === 'cargo-qty') return { value: '10000' };
        if (id === 'metodo_descarga_pod') return { value: 'bombas_neumaticas' };
        if (id === 'rate-disch') return rateInputPod;
        if (id === 'turn-time-hours') return turnTimeSelect;
        return null;
      }
    }
  };

  const script = `
    ${indexSource.match(/function applyMethodAndProductConditions\([\s\S]*?\n        \}/)[0]}
    window.applyMethodAndProductConditions = applyMethodAndProductConditions;
  `;

  vm.runInNewContext(script, context);
  context.window.applyMethodAndProductConditions('pod');

  assert.equal(rateInputPod.value, '8000', 'Bombas Neumáticas defaults to 8000 TM/D');
  assert.equal(turnTimeSelect.value, '10', 'Bombas Neumáticas sets turn time to 10 hours');
});

test('UX Operativas Cemento: User manual override on rate is preserved', () => {
  const rateInputPol = { value: '18000', dataset: { manualOverride: 'true' } };
  const turnTimeSelect = { value: '10' };

  const context = {
    window: {
      State: { cargo: 10000, vesselType: 'Handysize' },
      getSelectedMethodLabel: () => 'Bombas Neumáticas',
      recalcularDiasPuerto: () => {}
    },
    document: {
      getElementById: (id) => {
        if (id === 'cargo-qty') return { value: '10000' };
        if (id === 'metodo_carga') return { value: 'bombas_neumaticas' };
        if (id === 'rate-load') return rateInputPol;
        if (id === 'turn-time-hours') return turnTimeSelect;
        return null;
      }
    }
  };

  const script = `
    ${indexSource.match(/function applyMethodAndProductConditions\([\s\S]*?\n        \}/)[0]}
    window.applyMethodAndProductConditions = applyMethodAndProductConditions;
  `;

  vm.runInNewContext(script, context);
  context.window.applyMethodAndProductConditions('pol');

  assert.equal(rateInputPol.value, '18000', 'Manual override rate must not be overwritten');
});
