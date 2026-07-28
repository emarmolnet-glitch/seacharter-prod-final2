import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('calculator cargo state does not overwrite AIS taxonomy selection or vessel types', () => {
  assert.match(indexSource, /cargoCategoryEl\.value = result\.category/);
  assert.match(indexSource, /updateCBAMResult\(\)/);
});

test('hasRequiredCalculationInputs validates required form inputs and sets aria-invalid', () => {
  const helperStart = indexSource.indexOf('function hasRequiredCalculationInputs()');
  const helperEnd = indexSource.indexOf('function resetTotalEstimation', helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const elements = new Map([
    ['port-pol', { value: 'Rotterdam' }],
    ['port-pod', { value: 'Houston' }],
    ['vessel-dwt', { value: '50000' }],
    ['cargo-qty', { value: '50000' }],
    ['cons-sea', { value: '20' }],
    ['cons-port', { value: '3' }],
    ['price-sea', { value: '600' }],
    ['price-port', { value: '600' }],
    ['opex-daily', { value: '6000' }],
    ['margin-owner', { value: '10' }],
    ['margin-charterer', { value: '10' }],
    ['cargo-type-manual', {
      value: 'Siderúrgico / Carga General',
      attributes: new Map(),
      setAttribute(name, value) { this.attributes.set(name, String(value)); },
    }],
  ]);
  const documentMock = { getElementById: id => elements.get(id) || null };
  const hasRequiredCalculationInputs = new Function('document', `${helperSource}; return hasRequiredCalculationInputs;`)(
    documentMock,
  );

  assert.equal(hasRequiredCalculationInputs(), true);
  assert.equal(elements.get('cargo-type-manual').attributes.get('aria-invalid'), 'false');
  elements.get('cargo-type-manual').value = '';
  assert.equal(hasRequiredCalculationInputs(), false);
  assert.equal(elements.get('cargo-type-manual').attributes.get('aria-invalid'), 'true');
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
  globalThis.window = windowMock;

  const updateCargoAutoClassification = new Function(
    'document',
    `${helperSource};\nreturn updateCargoAutoClassification;`,
  )(documentMock);

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
