import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const cbamModuleSource = await readFile(new URL('../cbam-module.js', import.meta.url), 'utf8');
const cbamModule = await import(`data:text/javascript;base64,${Buffer.from(cbamModuleSource).toString('base64')}`);

test('cargo specification is visually required and blocks voyage calculation when empty', () => {
  assert.match(indexSource, /id="label-cargo-type-manual" class="text-action-required/);
  assert.match(indexSource, /id="cargo-type-manual" class="input-gc action-required-field required-use-highlight text-action-required font-bold" value="" required aria-required="true"/);
  assert.match(indexSource, /#cargo-type-manual\.required-use-highlight/);

  const helperStart = indexSource.indexOf('function hasRequiredCalculationInputs()');
  const helperEnd = indexSource.indexOf('function resetTotalEstimation', helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const values = new Map([
    ['port-pol', 'Casablanca'],
    ['port-pod', 'Valencia'],
    ['cargo-type-manual', ''],
    ['vessel-dwt', '25000'],
    ['cargo-qty', '10000'],
    ['cons-sea', '20'],
    ['cons-port', '3'],
    ['price-sea', '600'],
    ['price-port', '700'],
    ['opex-daily', '8000'],
    ['margin-owner', '15'],
    ['margin-charterer', '10'],
  ]);
  const elements = new Map(Array.from(values, ([id, value]) => [id, {
    value,
    attributes: new Map(),
    setAttribute(name, nextValue) { this.attributes.set(name, String(nextValue)); },
  }]));
  const hasRequiredCalculationInputs = new Function('document', `${helperSource}; return hasRequiredCalculationInputs;`)(
    { getElementById: id => elements.get(id) || null },
  );

  assert.equal(hasRequiredCalculationInputs(), false);
  assert.equal(elements.get('cargo-type-manual').attributes.get('aria-invalid'), 'true');
  elements.get('cargo-type-manual').value = 'Steel coils';
  assert.equal(hasRequiredCalculationInputs(), true);
  assert.equal(elements.get('cargo-type-manual').attributes.get('aria-invalid'), 'false');
});

test('cargo classification enables CBAM only for regulated sectors', () => {
  const helperStart = indexSource.indexOf('function updateCargoAutoClassification(inputString)');
  const helperEnd = indexSource.indexOf('function handleCargoManualInput()', helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const elements = new Map([
    ['cargo-auto-classification', { textContent: '' }],
    ['cargo-category', { value: '' }],
    ['product-sector', {
      value: '',
      disabled: true,
      attributes: new Map(),
      setAttribute(name, value) { this.attributes.set(name, String(value)); },
    }],
  ]);
  const documentMock = { getElementById: id => elements.get(id) || null };
  const windowMock = { autoClassifyCargo: () => null };
  const updateCargoAutoClassification = new Function(
    'window',
    'document',
    `${helperSource}; return updateCargoAutoClassification;`,
  )(windowMock, documentMock);

  updateCargoAutoClassification('grain');
  assert.equal(elements.get('product-sector').value, '');
  assert.equal(elements.get('product-sector').disabled, true);
  assert.match(elements.get('cargo-auto-classification').textContent, /N\/A/);

  windowMock.autoClassifyCargo = () => ({ category: 'Metals & Steel Products', cbamSector: 'Acero' });
  updateCargoAutoClassification('steel coils');
  assert.equal(elements.get('product-sector').value, 'Acero');
  assert.equal(elements.get('product-sector').disabled, false);
  assert.equal(elements.get('product-sector').attributes.get('aria-disabled'), 'false');
});

test('CBAM starts inactive and non-regulated cargo cannot create a charge', () => {
  assert.equal(cbamModule.cbamState.sector, '');
  const result = cbamModule.updateCBAMState({
    sector: '',
    origen: 'Marruecos',
    destino: 'España',
    tonelaje: 10000,
    factorManual: '',
    impuestoOrigen: 0,
  });

  assert.equal(result.sector, '');
  assert.equal(result.esValido, false);
  assert.deepEqual(result.calculos, { escenarioA: 0, escenarioB: 0, escenarioC: 0, ahorro: 0 });
  assert.equal(result.mensaje, 'No sujeto a CBAM');
});

test('calculator CBAM automation remains isolated from AIS taxonomy state', () => {
  const manualInputStart = indexSource.indexOf('function handleCargoManualInput()');
  const manualInputEnd = indexSource.indexOf('function syncCBAMModuleFromCalculator()', manualInputStart);
  const manualInputSource = indexSource.slice(manualInputStart, manualInputEnd);
  assert.doesNotMatch(manualInputSource, /applyFleetCargoTaxonomy|setSelectedFleetTaxonomies/);
  assert.match(indexSource, /calculatorDrivenCBAMFields = new Set\(\['cargo-qty', 'cargo-type-manual'/);
  assert.doesNotMatch(indexSource, /sector: val\('cbam-sector'\) \|\| val\('product-sector'\) \|\| State\.cargoType/);
});
