import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync('/opt/build/repo/index.html', 'utf8');
const assistantEntryJs = fs.readFileSync('/opt/build/repo/src/sea-assistant-entry.js', 'utf8');

function createMockDom() {
  const categoryOptions = [
    { value: '', label: 'Selecciona una categoría' },
    { value: 'Minerales y Construcción', label: 'Minerales y Construcción' },
    { value: 'Biomasa y Combustibles Sólidos', label: 'Biomasa y Combustibles Sólidos' },
    { value: 'Carga Siderúrgica y Metales', label: 'Carga Siderúrgica y Metales' },
    { value: 'Carga Unitizada / Envasada', label: 'Carga Unitizada / Envasada' },
    { value: 'Carga de Proyecto (Breakbulk)', label: 'Carga de Proyecto (Breakbulk)' },
  ];

  const categoryEl = {
    id: 'cargo-type',
    value: '',
    options: categoryOptions.map(o => ({ value: o.value, text: o.label })),
    dispatchEvent() {},
  };

  const productEl = {
    id: 'cargo-product',
    value: '',
    disabled: false,
    options: [
      { value: '', text: 'Selecciona una mercancía' },
      { value: 'Cemento a granel', text: 'Cemento a granel' },
      { value: 'Clínker', text: 'Clínker' },
      { value: 'Yeso', text: 'Yeso' },
    ],
    replaceChildren(fragment) {
      this.options = Array.from(fragment.children).map(c => ({ value: c.value, text: c.textContent }));
    },
    dispatchEvent() {},
  };

  const elements = {
    'cargo-type': categoryEl,
    'cargo-product': productEl,
  };

  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      if (selector === 'select') {
        return [categoryEl, productEl];
      }
      return [];
    },
    createDocumentFragment() {
      const children = [];
      return {
        children,
        appendChild(child) {
          children.push(child);
        },
      };
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        value: '',
        textContent: '',
      };
    },
  };

  globalThis.window = {
    State: {},
    document: globalThis.document,
    HTMLSelectElement: {
      prototype: {
        value: '',
      },
    },
    replaceSelectOptions(select, options) {
      if (!select) return;
      const fragment = globalThis.document.createDocumentFragment();
      options.forEach(({ value, label }) => {
        const option = globalThis.document.createElement('option');
        option.value = String(value);
        option.textContent = label;
        fragment.appendChild(option);
      });
      select.replaceChildren(fragment);
    },
    enforceTurnTimeOptions() {},
    applySelectedCargoProduct() {},
  };
  globalThis.enforceTurnTimeOptions = () => {};
  globalThis.applySelectedCargoProduct = () => {};
  globalThis.replaceSelectOptions = globalThis.window.replaceSelectOptions;

  // Extract cargoDictionary from index.html
  const cargoDictStart = indexHtml.indexOf('const cargoDictionary = {');
  const cargoDictEnd = indexHtml.indexOf('};', cargoDictStart) + 2;
  const cargoDictCode = indexHtml.slice(cargoDictStart, cargoDictEnd);
  globalThis.cargoDictionary = eval(`(() => { ${cargoDictCode}; return cargoDictionary; })()`);
  globalThis.window.cargoDictionary = globalThis.cargoDictionary;

  // Extract populateCargoProducts from index.html
  const popStart = indexHtml.indexOf('function populateCargoProducts(');
  const popEnd = indexHtml.indexOf('function restoreCargoSelection(');
  const popCode = indexHtml.slice(popStart, popEnd);
  const populateFn = eval(`(() => { ${popCode}; return populateCargoProducts; })()`);
  globalThis.populateCargoProducts = populateFn;
  globalThis.window.populateCargoProducts = populateFn;

  // Extract restoreCargoSelection from index.html
  const restStart = indexHtml.indexOf('function restoreCargoSelection(');
  const restEnd = indexHtml.indexOf('function applySelectedCargoProduct(');
  const restCode = indexHtml.slice(restStart, restEnd);
  const restoreFn = eval(`(() => { ${restCode}; return restoreCargoSelection; })()`);
  globalThis.restoreCargoSelection = restoreFn;
  globalThis.window.restoreCargoSelection = restoreFn;

  return { categoryEl, productEl };
}

test('restoreCargoSelection: selects Carga Unitizada / Envasada and Big Bags (Minerales/Cemento) without falling back to Cemento a granel', () => {
  const { categoryEl, productEl } = createMockDom();

  globalThis.restoreCargoSelection('Carga Unitizada / Envasada', 'Big Bags (Minerales/Cemento)');

  assert.equal(categoryEl.value, 'Carga Unitizada / Envasada');
  assert.equal(productEl.value, 'Big Bags (Minerales/Cemento)');
  assert.notEqual(productEl.value, 'Cemento a granel');
});

test('restoreCargoSelection: selects Carga Unitizada / Envasada and Carga Paletizada for palletized goods without falling back to Cemento a granel', () => {
  const { categoryEl, productEl } = createMockDom();

  globalThis.restoreCargoSelection('Carga Unitizada / Envasada', 'Carga Paletizada');

  assert.equal(categoryEl.value, 'Carga Unitizada / Envasada');
  assert.equal(productEl.value, 'Carga Paletizada');
  assert.notEqual(productEl.value, 'Cemento a granel');
});

test('restoreCargoSelection: maps Big Bags packingType to Big Bags (Minerales/Cemento) without defaulting to bulk cement', () => {
  const { categoryEl, productEl } = createMockDom();

  globalThis.restoreCargoSelection('', 'Cemento en Big Bags', 'Big Bags');

  assert.equal(categoryEl.value, 'Carga Unitizada / Envasada');
  assert.equal(productEl.value, 'Big Bags (Minerales/Cemento)');
  assert.notEqual(productEl.value, 'Cemento a granel');
});

test('restoreCargoSelection: maps Palets packingType to Carga Paletizada without defaulting to bulk cement', () => {
  const { categoryEl, productEl } = createMockDom();

  globalThis.restoreCargoSelection('', 'Madera en Palets', 'Paletizado');

  assert.equal(categoryEl.value, 'Carga Unitizada / Envasada');
  assert.equal(productEl.value, 'Carga Paletizada');
  assert.notEqual(productEl.value, 'Cemento a granel');
});

test('restoreCargoSelection: forces Carga Unitizada / Envasada even if backend sent Minerales y Construcción for Cemento en Big Bags', () => {
  const { categoryEl, productEl } = createMockDom();

  globalThis.restoreCargoSelection('Minerales y Construcción', 'Big Bags (Minerales/Cemento)', 'Big Bags');

  assert.equal(categoryEl.value, 'Carga Unitizada / Envasada');
  assert.equal(productEl.value, 'Big Bags (Minerales/Cemento)');
  assert.notEqual(productEl.value, 'Cemento a granel');
});

test('restoreCargoSelection: forces Carga Unitizada / Envasada even if backend sent Minerales y Construcción for Cemento en Palets', () => {
  const { categoryEl, productEl } = createMockDom();

  globalThis.restoreCargoSelection('Minerales y Construcción', 'Carga Paletizada', 'Paletizado');

  assert.equal(categoryEl.value, 'Carga Unitizada / Envasada');
  assert.equal(productEl.value, 'Carga Paletizada');
  assert.notEqual(productEl.value, 'Cemento a granel');
});

test('sea-assistant-entry.js does not fall through to fuzzy optText.includes(cemento) that overwrites cargo dropdowns', () => {
  // Ensure that in the select loop, cargo-type and cargo-product are bypassed
  assert.match(assistantEntryJs, /if\s*\(sel\.id\s*===\s*'cargo-type'\s*\|\|\s*sel\.id\s*===\s*'cargo-product'\)\s*return;/);
  // Ensure that replaceCargoHierarchySelection or restoreCargoSelection is called deterministically
  assert.match(assistantEntryJs, /window\.replaceCargoHierarchySelection\(resolvedCategory,\s*resolvedProduct\)/);
  // Ensure explicit backend cargo is prioritized
  assert.match(assistantEntryJs, /hasExplicitBackendCargo/);
});
