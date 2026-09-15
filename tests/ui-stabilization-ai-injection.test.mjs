import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const forwarderSource = await readFile(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const seaAssistantSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

test('1. autoScaleVesselAndCosts has strict null guards before reading .value and does not throw with null elements', () => {
    // Assert static code has null guards
    assert.match(indexSource, /function autoScaleVesselAndCosts\(\)\s*\{[\s\S]*?const cargoQtyEl = document\.getElementById\('cargo-qty'\);/);
    assert.match(indexSource, /if\s*\(!cargoQtyEl \|\| !vesselNameEl \|\| !vesselDwtEl\)\s*return;/);

    // Extract autoScaleVesselAndCosts and run in a minimal VM context where getElementById returns null
    const startIdx = indexSource.indexOf('function autoScaleVesselAndCosts()');
    const endIdx = indexSource.indexOf('const cargoDictionary =', startIdx);
    const fnSource = indexSource.slice(startIdx, endIdx);

    const context = {
        document: {
            getElementById: () => null
        },
        State: {},
        console: { log: () => {} },
        handleDWTChange: () => {},
        updateCargoUnit: () => {}
    };
    vm.createContext(context);
    vm.runInContext(`${fnSource}\nautoScaleVesselAndCosts();`, context);
    // If it reaches here without throwing Uncaught TypeError, the guard succeeds!
});

test('2. dependent calculations handleDWTChange, updateCargoUnit, and useAlgorithmicFreight have null guards', () => {
    assert.match(indexSource, /function handleDWTChange\([\s\S]*?const vesselDwtEl = document\.getElementById\('vessel-dwt'\);[\s\S]*?if\s*\(!vesselDwtEl\)\s*return;/);
    assert.match(indexSource, /function updateCargoUnit\([\s\S]*?const packingEl = document\.getElementById\('gc-add-packing'\);[\s\S]*?const cargoQtyEl = document\.getElementById\('cargo-qty'\);[\s\S]*?if\s*\(!packingEl \|\| !cargoQtyEl\)\s*return;/);
    assert.match(indexSource, /function useAlgorithmicFreight\([\s\S]*?const freightRateEl = document\.getElementById\('freight-rate'\);[\s\S]*?if\s*\(freightRateEl\)\s*freightRateEl\.value/);
    assert.match(indexSource, /function handleFlagOrPscChange\(\)\s*\{[\s\S]*?const dwtEl = document\.getElementById\('vessel-dwt'\);/);
});

test('3. ForwarderWorkspace.jsx blocks automatic/programmatic execution of handleCreateProject', () => {
    assert.match(forwarderSource, /const isSynthetic = e && \(e\.isTrusted === false \|\| e\.isProgrammatic === true\);/);
    assert.match(forwarderSource, /window\.__AI_INJECTION_IN_PROGRESS__/);
    assert.match(forwarderSource, /window\.updateFieldsActionInProgress/);
    assert.match(forwarderSource, /if\s*\(isSynthetic \|\| isAiInjecting \|\| isPageLoading\)\s*\{[\s\S]*?return;/);
});

test('4. ForwarderWorkspace.jsx wraps prompt and aborts silently on cancel or empty input without calling endpoint', () => {
    assert.match(forwarderSource, /input = window\.prompt\('Introduce el nombre del cliente para el nuevo proyecto:'\);/);
    assert.match(forwarderSource, /if\s*\(input === null \|\| !input \|\| !input\.trim\(\)\)\s*\{[\s\S]*?return;[\s\S]*?\}/);
    
    // Ensure the fetch call happens strictly after the prompt cancel check
    const promptIdx = forwarderSource.indexOf("window.prompt('Introduce el nombre del cliente para el nuevo proyecto:')");
    const checkIdx = forwarderSource.indexOf('if (input === null || !input || !input.trim())', promptIdx);
    const fetchIdx = forwarderSource.indexOf("fetch(getApiUrl('/.netlify/functions/forwarder-projects')", checkIdx);
    
    assert.ok(promptIdx > 0, 'Prompt must exist');
    assert.ok(checkIdx > promptIdx, 'Validation check must occur after prompt');
    assert.ok(fetchIdx > checkIdx, 'Fetch must occur after validation check');
});

test('5. sea-assistant-entry.js silences prompt and sets __AI_INJECTION_IN_PROGRESS__ during executeActionableAiUpdateFields', () => {
    assert.match(seaAssistantSource, /window\.__AI_INJECTION_IN_PROGRESS__ = true;/);
    assert.match(seaAssistantSource, /window\.updateFieldsActionInProgress = true;/);
    assert.match(seaAssistantSource, /changeEv\.isProgrammatic = true;/);
    assert.match(seaAssistantSource, /window\.__AI_INJECTION_IN_PROGRESS__ = false;/);
    assert.match(seaAssistantSource, /window\.updateFieldsActionInProgress = false;/);
});
