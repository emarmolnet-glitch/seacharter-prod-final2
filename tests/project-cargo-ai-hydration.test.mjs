import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeNlpVoyagePayload } from '../shared/cargo-mapper.mjs';

const storeSource = await readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8');
const draftEntrySource = await readFile(new URL('../src/voyage-draft-entry.js', import.meta.url), 'utf8');
const seaAssistantSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('normalizeNlpVoyagePayload parses Cerebro.ia projectCargo payload with volumetric properties', () => {
    const payload = {
        cargo_type: 'Transformador eléctrico',
        projectCargo: {
            unitWeightMT: 150,
            dimensions: {
                lengthM: 12.5,
                widthM: 3.8,
                heightM: 4.2,
            },
            handlingMode: 'direct-lift',
        },
    };

    const normalized = normalizeNlpVoyagePayload(payload);
    assert.equal(normalized.unitWeightMT, 150);
    assert.equal(normalized.pesoUnitario, 150);
    assert.equal(normalized.length, 12.5);
    assert.equal(normalized.largo, 12.5);
    assert.equal(normalized.width, 3.8);
    assert.equal(normalized.ancho, 3.8);
    assert.equal(normalized.height, 4.2);
    assert.equal(normalized.alto, 4.2);
    assert.equal(normalized.handlingMode, 'direct-lift');
    assert.equal(normalized.projectCargo?.dimensions?.lengthM, 12.5);
    assert.equal(normalized.categoriaCarga, 'Carga de Proyecto (Breakbulk)');
});

test('normalizeNlpVoyagePayload parses root volumetric properties when projectCargo is absent', () => {
    const payload = {
        pesoUnitario: 95,
        largo: 18,
        ancho: 3.2,
        alto: 2.9,
        handlingMode: 'roro-spmt',
    };

    const normalized = normalizeNlpVoyagePayload(payload);
    assert.equal(normalized.unitWeightMT, 95);
    assert.equal(normalized.pesoUnitario, 95);
    assert.equal(normalized.length, 18);
    assert.equal(normalized.largo, 18);
    assert.equal(normalized.width, 3.2);
    assert.equal(normalized.ancho, 3.2);
    assert.equal(normalized.height, 2.9);
    assert.equal(normalized.alto, 2.9);
    assert.equal(normalized.handlingMode, 'roro-spmt');
    assert.deepEqual(normalized.projectCargo?.dimensions, {
        lengthM: 18,
        widthM: 3.2,
        heightM: 2.9,
    });
});

test('voyage-store includes projectCargo in EMPTY_DRAFT and hydrates volumetric variables', () => {
    assert.match(storeSource, /projectCargo:\s*\{\s*unitWeightMT:\s*0/);
    assert.match(storeSource, /applyNlpScenario:\s*\(scenario = \{\}\) => set\(\(current\) => \{/);
    assert.match(storeSource, /rawProjectCargo\.unitWeightMT/);
    assert.match(storeSource, /rawProjectCargo\.dimensions\?\.lengthM/);
    assert.match(storeSource, /pesoUnitario:\s*unitWeightMT/);
    assert.match(storeSource, /largo:\s*length/);
    assert.match(storeSource, /ancho:\s*width/);
    assert.match(storeSource, /alto:\s*height/);
});

test('voyage-draft-entry injects project cargo into inputs and SeaCharterStore', () => {
    assert.match(draftEntrySource, /setValue\('project-unit-weight',\s*unitWeightMT\)/);
    assert.match(draftEntrySource, /setValue\('project-length',\s*length\)/);
    assert.match(draftEntrySource, /setValue\('project-width',\s*width\)/);
    assert.match(draftEntrySource, /setValue\('project-height',\s*height\)/);
    assert.match(draftEntrySource, /setSelectValue\('project-handling-mode',\s*handlingMode\)/);
    assert.match(draftEntrySource, /window\.actualizarCamposTipoCarga/);
});

test('sea-assistant-entry extracts projectCargo from Cerebro.ia and updates UI inputs and global store', () => {
    assert.match(seaAssistantSource, /updateInputs\(\["project-unit-weight", "peso-pieza-mt"\],\s*unitWeightMT\)/);
    assert.match(seaAssistantSource, /updateInputs\(\["project-length"\],\s*length\)/);
    assert.match(seaAssistantSource, /updateInputs\(\["project-width"\],\s*width\)/);
    assert.match(seaAssistantSource, /updateInputs\(\["project-height"\],\s*height\)/);
    assert.match(seaAssistantSource, /updateInputs\(\["project-handling-mode"\],\s*handlingMode\)/);
    assert.match(seaAssistantSource, /window\.SeaCharterStore\?\.set\?\(routeState|window\.SeaCharterStore\?\.set\?\.s*\(routeState/);
});

test('index.html binds project cargo inputs reactively to state and store', () => {
    assert.match(indexSource, /id="project-unit-weight"[^>]*oninput="[^"]*SeaCharterStore/);
    assert.match(indexSource, /id="project-length"[^>]*oninput="[^"]*SeaCharterStore/);
    assert.match(indexSource, /id="project-width"[^>]*oninput="[^"]*SeaCharterStore/);
    assert.match(indexSource, /id="project-height"[^>]*oninput="[^"]*SeaCharterStore/);
    assert.match(indexSource, /id="project-handling-mode"[^>]*onchange="[^"]*SeaCharterStore/);
    assert.match(indexSource, /updateInputIfNotFocused\('project-unit-weight'/);
    assert.match(indexSource, /updateInputIfNotFocused\('project-length'/);
});
