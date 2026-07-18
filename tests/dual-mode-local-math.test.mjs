import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const componentSource = await readFile(new URL('../dual-trading-chartering-view.js', import.meta.url), 'utf8');

function mountDualComponent() {
    const inputListeners = new Map();
    const inputs = ['fobPrice', 'cifPrice', 'totalTonnage', 'stowageFactor', 'cargoTolerance'].map((name) => ({
        name,
        value: '',
        addEventListener(type, listener) {
            if (type === 'input') inputListeners.set(name, listener);
        },
    }));
    const marginOutput = { textContent: '' };
    let ComponentConstructor;

    class HTMLElementStub {
        attachShadow() {
            this.shadowRoot = {
                innerHTML: '',
                querySelectorAll: () => inputs,
                getElementById: (id) => id === 'dual-gross-margin' ? marginOutput : null,
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
    component.connectedCallback();

    return {
        input(name, value) {
            const input = inputs.find((candidate) => candidate.name === name);
            input.value = value;
            inputListeners.get(name)({ currentTarget: input });
        },
        marginOutput,
    };
}

test('Dual Mode calculates commercial gross margin locally in real time', () => {
    const component = mountDualComponent();

    component.input('fobPrice', '82.25');
    component.input('cifPrice', '109.75');

    assert.equal(component.marginOutput.textContent, '$ 27.50 / TM');
});

test('Dual Mode keeps stowage and tolerance inputs local without changing the margin formula', () => {
    const component = mountDualComponent();

    component.input('fobPrice', '100');
    component.input('cifPrice', '95');
    component.input('stowageFactor', '1.35');
    component.input('cargoTolerance', '10');

    assert.equal(component.marginOutput.textContent, '-$ 5.00 / TM');
    assert.doesNotMatch(componentSource, /SeaCharterStore|GlobalStore|syncGlobalStateToForms|localStorage|sessionStorage/);
});
