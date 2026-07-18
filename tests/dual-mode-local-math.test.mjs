import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const componentSource = await readFile(new URL('../dual-trading-chartering-view.js', import.meta.url), 'utf8');
const overlaySource = await readFile(new URL('../dual-mode-overlay.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function createOutput() {
    const classes = new Set();
    return {
        textContent: '',
        classList: {
            add(...classNames) {
                classNames.forEach((className) => classes.add(className));
            },
            remove(...classNames) {
                classNames.forEach((className) => classes.delete(className));
            },
            toggle(className, force) {
                if (force) classes.add(className);
                else classes.delete(className);
            },
            contains(className) {
                return classes.has(className);
            },
        },
    };
}

function mountDualComponent({
    fleteJustoCalculado = 0,
    toneladasTotales = '',
    factorDeEstiba = '',
    toleranciaCarga = '',
} = {}) {
    const inputListeners = new Map();
    const editableInputs = ['fobPrice', 'cifPrice'].map((name) => ({
        name,
        value: '',
        addEventListener(type, listener) {
            if (type === 'input') inputListeners.set(name, listener);
        },
    }));
    const readOnlyInputs = {
        'dual-total-tonnage': { value: '' },
        'dual-stowage-factor': { value: '' },
        'dual-cargo-tolerance': { value: '' },
    };
    const outputs = {
        'dual-gross-margin': createOutput(),
        'dual-fair-freight': createOutput(),
        'dual-fair-freight-message': createOutput(),
        'dual-net-margin': createOutput(),
        'dual-net-margin-message': createOutput(),
    };
    let ComponentConstructor;

    class HTMLElementStub {
        attachShadow() {
            this.shadowRoot = {
                innerHTML: '',
                querySelectorAll: () => editableInputs,
                getElementById: (id) => outputs[id] || readOnlyInputs[id] || null,
            };
        }
    }

    vm.runInNewContext(componentSource, {
        HTMLElement: HTMLElementStub,
        customElements: {
            define(name, constructor) {
                if (name === 'dual-trading-chartering-view') ComponentConstructor = constructor;
            },
        },
        console,
    });

    const component = new ComponentConstructor();
    component.fleteJustoCalculado = fleteJustoCalculado;
    component.toneladasTotales = toneladasTotales;
    component.factorDeEstiba = factorDeEstiba;
    component.toleranciaCarga = toleranciaCarga;
    component.connectedCallback();

    return {
        input(name, value) {
            const input = editableInputs.find((candidate) => candidate.name === name);
            input.value = value;
            inputListeners.get(name)({ currentTarget: input });
        },
        component,
        outputs,
        readOnlyInputs,
    };
}

test('Dual Mode calculates commercial gross margin locally in real time', () => {
    const component = mountDualComponent();

    component.input('fobPrice', '82.25');
    component.input('cifPrice', '109.75');

    assert.equal(component.outputs['dual-gross-margin'].textContent, '$ 27.50 / TM');
});

test('Dual Mode keeps cargo variables read-only without changing the margin formula', () => {
    const component = mountDualComponent({
        toneladasTotales: 18500,
        factorDeEstiba: 1.35,
        toleranciaCarga: 10,
    });

    component.input('fobPrice', '100');
    component.input('cifPrice', '95');

    assert.equal(component.outputs['dual-gross-margin'].textContent, '-$ 5.00 / TM');
    assert.equal(component.readOnlyInputs['dual-total-tonnage'].value, 18500);
    assert.equal(component.readOnlyInputs['dual-stowage-factor'].value, 1.35);
    assert.equal(component.readOnlyInputs['dual-cargo-tolerance'].value, 10);
    assert.match(componentSource, /id="dual-total-tonnage"[^>]*readonly/);
    assert.match(componentSource, /id="dual-stowage-factor"[^>]*readonly/);
    assert.match(componentSource, /id="dual-cargo-tolerance"[^>]*readonly/);
    assert.doesNotMatch(componentSource, /data-dual-input[^>]*name="(?:totalTonnage|stowageFactor|cargoTolerance)"/);
    assert.doesNotMatch(componentSource, /SeaCharterStore|GlobalStore|syncGlobalStateToForms|localStorage|sessionStorage/);
});

test('Dual Mode refreshes read-only cargo inputs when a new snapshot arrives', () => {
    const component = mountDualComponent();

    assert.equal(component.readOnlyInputs['dual-total-tonnage'].value, '');
    assert.equal(component.readOnlyInputs['dual-stowage-factor'].value, '');
    assert.equal(component.readOnlyInputs['dual-cargo-tolerance'].value, '');

    component.component.toneladasTotales = 22450;
    component.component.factorDeEstiba = 1.62;
    component.component.toleranciaCarga = 7.5;

    assert.equal(component.readOnlyInputs['dual-total-tonnage'].value, 22450);
    assert.equal(component.readOnlyInputs['dual-stowage-factor'].value, 1.62);
    assert.equal(component.readOnlyInputs['dual-cargo-tolerance'].value, 7.5);
});

test('Dual Mode renders an isolated informational tooltip for MOLOO and MOLCO', () => {
    assert.match(componentSource, /const CARGO_TOLERANCE_TOOLTIP = Object\.freeze/);
    assert.match(componentSource, /More or Less in Owner’s Option/);
    assert.match(componentSource, /More or Less in Charterer’s Option/);
    assert.match(componentSource, /id="cargo-tolerance-tooltip"[^>]*role="tooltip"/);
    assert.match(componentSource, /\.tooltip-anchor:hover \.tooltip-content/);
    assert.match(componentSource, /id="dual-total-tonnage"[^>]*readonly/);
    assert.match(componentSource, /id="dual-stowage-factor"[^>]*readonly/);
    assert.match(componentSource, /id="dual-cargo-tolerance"[^>]*readonly/);
});

test('Dual Mode imports fair freight as read-only data and calculates positive net margin', () => {
    const component = mountDualComponent({ fleteJustoCalculado: 24.5 });

    component.input('fobPrice', '80');
    component.input('cifPrice', '112');

    assert.equal(component.outputs['dual-fair-freight'].textContent, '$ 24.50 / TM');
    assert.equal(component.outputs['dual-net-margin'].textContent, '$ 7.50 / TM');
    assert.equal(component.outputs['dual-net-margin'].classList.contains('is-positive'), true);
});

test('Dual Mode marks a negative operating margin as a loss', () => {
    const component = mountDualComponent({ fleteJustoCalculado: 24.5 });

    component.input('fobPrice', '90');
    component.input('cifPrice', '108');

    assert.equal(component.outputs['dual-net-margin'].textContent, '-$ 6.50 / TM');
    assert.equal(component.outputs['dual-net-margin'].classList.contains('is-negative'), true);
});

test('Dual Mode shows guidance when the main calculator has no fair freight', () => {
    const component = mountDualComponent();

    assert.equal(component.outputs['dual-fair-freight'].textContent, 'Sin flete calculado');
    assert.equal(
        component.outputs['dual-fair-freight-message'].textContent,
        'Calcula una ruta en el panel principal para importar el flete',
    );
    assert.equal(component.outputs['dual-net-margin'].textContent, 'Pendiente');
});

test('Dual Mode receives frozen read-only snapshots from the main calculator state', () => {
    assert.match(indexSource, /getSnapshot:\s*\(\)\s*=>\s*selectDualModeReadOnlyState\(SeaCharterStore\.getState\(\)\)/);
    assert.match(indexSource, /subscribe:\s*\(listener\)\s*=>\s*SeaCharterStore\.subscribe/);
    assert.match(indexSource, /toneladasTotales:\s*Number\(state\.cargo\)/);
    assert.match(indexSource, /factorDeEstiba:\s*Number\(state\.stowageFactor\)/);
    assert.match(indexSource, /toleranciaCarga:\s*Number\(state\.cargoTolerance\)/);
    assert.match(indexSource, /id="cargo-tolerance"[^>]*oninput="runEngine\(\)"/);
    assert.match(overlaySource, /dualView\.fleteJustoCalculado\s*=/);
    assert.match(overlaySource, /dualView\.toneladasTotales\s*=/);
    assert.match(overlaySource, /dualModeReadOnlyUnsubscribe\(\)/);
    assert.doesNotMatch(componentSource, /SeaCharterStore|\.set\(|dispatch\(|Object\.assign\(State/);
});
