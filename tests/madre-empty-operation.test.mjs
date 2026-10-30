import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { transform } from 'esbuild';

register(new URL('./jsx-loader.mjs', import.meta.url));
const scanner = await import('../src/utils/coreProScanner.js');
const { buildMotherExecutiveScript, getScanPendingMessage } = await import('../src/components/GlobalMadreDrawer.jsx');

function withInputs(values, check) {
  const previous = globalThis.document;
  globalThis.document = {
    querySelector: selector => values[selector] === undefined ? null : typeof values[selector] === 'object' ? values[selector] : { value: values[selector], textContent: '' },
    querySelectorAll: () => [],
    body: { innerText: 'FLETE BREAK-EVEN $99 MT 30000' },
  };
  try { check(); } finally { globalThis.document = previous; }
}

test('empty, zero, invalid and preset-only inputs leave the scan pending', () => {
  for (const values of [{}, { '#pda-pol': '', '#pda-pod': '0', '#cons-sea': '0' },
    { '#pda-pol': 'NaN', '#freight-rate': 'Infinity' },
    { '#spd-ballast': '11', '#margin-owner': '15', '#comm-pct': '2.5', '#res-cost-total': '90000' }]) {
    withInputs(values, () => {
      assert.equal(scanner.hasOperationalInputData(), false);
      const data = scanner.extractStructuredCoreProData();
      assert.equal(data.metadata.estado, 'pendiente_datos');
      assert.equal(data.mensaje, scanner.PENDING_OPERATION_MESSAGE);
      assert.deepEqual(data.bloques, {});
      assert.equal(buildMotherExecutiveScript({ cargoQty: 30000, breakEven: 99 }), scanner.PENDING_OPERATION_MESSAGE);
    });
  }
});

test('real PDA or cargo data enables extraction without invented missing amounts', () => {
  for (const values of [{ '#pda-pol': '12500' }, { '#cargo-qty': '20000' }]) {
    withInputs(values, () => {
      assert.equal(scanner.hasOperationalInputData(), true);
      const data = scanner.extractStructuredCoreProData();
      assert.equal(Object.keys(data.bloques).length, 10);
      assert.equal(data.bloques.bloque_3_bunkers_gastos.precio_vlsfo_usd, 0);
      assert.equal(data.bloques.bloque_10_simulador_negociacion_contraofertas.flete_venta_fletador_mt, 0);
    });
  }
});

test('key calculator costs and consumption start at zero', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['pda-pol', 'pda-pod', 'opex-daily', 'price-sea', 'price-port', 'price-ifo',
    'cons-sea', 'cons-port', 'cons-anchorage', 'freight-rate', 'freight-sell', 'demurrage-rate']) {
    assert.match(html, new RegExp('<input[^>]*id="' + id + '"[^>]*value="0"'));
  }
});

test('scanner and drawer parse without compilation errors', async () => {
  for (const [path, loader] of [['../src/utils/coreProScanner.js', 'js'], ['../src/components/GlobalMadreDrawer.jsx', 'jsx']]) {
    await transform(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader, format: 'esm' });
  }
});


test('zero or missing cargo and break-even suppress executive verdicts despite other inputs', () => {
  for (const values of [
    { '#pda-pol': '12000' },
    { '#cargo-qty': '', '#res-breakeven': '28.50' },
    { '#cargo-qty': '0', '#res-breakeven': '28.50' },
    { '#cargo-qty': '30000', '#res-breakeven': '0' },
    { '#cargo-qty': '30000', '#res-breakeven': '' },
    { '#cargo-qty': '30000', '#res-breakeven': 'NaN' },
  ]) {
    withInputs(values, () => {
      // Stale body text must not turn incomplete inputs into an audit.
      assert.equal(buildMotherExecutiveScript(), scanner.PENDING_OPERATION_MESSAGE);
    });
  }
  withInputs({ '#cargo-qty': '0', '#res-breakeven': '0' }, () => {
    assert.equal(buildMotherExecutiveScript({ cargoQty: 30000, breakEven: 99 }), scanner.PENDING_OPERATION_MESSAGE);
  });
});

const visibleView = { classList: { contains: () => false } };
const hiddenView = { classList: { contains: name => name === 'hidden' } };

test('map scan directs the user to the calculator even with an existing calculation', () => {
  for (const data of [{}, { '#cargo-qty': '30000', '#res-breakeven': '28.50' }]) {
    withInputs({ ...data, '#view-map': visibleView }, () => {
      const message = buildMotherExecutiveScript({ cargoQty: 30000, breakEven: 28.5 });
      assert.match(message, /mapa operativo/);
      assert.match(message, /calculadora de SeaCharter/);
      assert.doesNotMatch(message, /Escaneo analítico completado|break-even|flete/);
    });
  }
});

test('AIS without calculation data gives radar-specific guidance', () => {
  withInputs({ '#view-ais': visibleView, '#view-map': hiddenView }, () => {
    assert.match(buildMotherExecutiveScript(), /radar AIS/);
  });
});

test('a hidden map does not block a valid calculator audit', () => {
  withInputs({ '#view-map': hiddenView, '#view-estimator': visibleView,
    '#cargo-qty': '30000', '#res-breakeven': '28.50' }, () => {
    assert.equal(getScanPendingMessage(), null);
    assert.match(buildMotherExecutiveScript(), /Escaneo analítico completado/);
  });
});
