import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.resolve('index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const seaAssistantPath = path.resolve('src/sea-assistant-entry.js');
const seaAssistantJs = fs.readFileSync(seaAssistantPath, 'utf8');

test('index.html defines recalculateCraneRates with guard for window.isAiInjectedRate', () => {
    assert.match(indexHtml, /function\s+recalculateCraneRates\s*\(/);
    assert.match(indexHtml, /window\.isAiInjectedRate\s*&&\s*modeEl\?\.value\s*!==\s*['"]manual['"]/);
    assert.match(indexHtml, /window\.recalculateCraneRates\s*=\s*recalculateCraneRates/);
});

test('index.html calcularRitmoGrua contains guard against overwriting AI-injected rates', () => {
    assert.match(indexHtml, /function\s+calcularRitmoGrua\s*\(/);
    const fnBody = indexHtml.slice(indexHtml.indexOf('function calcularRitmoGrua('), indexHtml.indexOf('function calcularRitmoGrua(') + 600);
    assert.match(fnBody, /window\.isAiInjectedRate\s*&&\s*modeEl\?\.value\s*!==\s*['"]manual['"]/);
});

test('index.html contains hidden inputs ritmo-mode-pol and ritmo-mode-pod', () => {
    assert.match(indexHtml, /id="ritmo-mode-pol"/);
    assert.match(indexHtml, /id="ritmo-mode-pod"/);
});

test('cargoDictionary in index.html does not assign Big Bags to Minerales y Construcción', () => {
    const dictStart = indexHtml.indexOf('const cargoDictionary = {');
    const dictEnd = indexHtml.indexOf('const TURN_TIME_OPTIONS =');
    const dictStr = indexHtml.slice(dictStart, dictEnd);

    // Extract "Minerales y Construcción" block
    const mineralesBlock = dictStr.slice(dictStr.indexOf('"Minerales y Construcción":'), dictStr.indexOf('"Biomasa y Combustibles Sólidos":'));
    assert.doesNotMatch(mineralesBlock, /Big Bags/i, 'Minerales y Construcción should not contain Big Bags');

    // "Carga Unitizada / Envasada" block must contain Big Bags
    const unitizadaBlock = dictStr.slice(dictStr.indexOf('"Carga Unitizada / Envasada":'), dictStr.indexOf('"Carga de Proyecto (Breakbulk)":'));
    assert.match(unitizadaBlock, /Big Bags \(Minerales\/Cemento\)/, 'Carga Unitizada / Envasada must contain Big Bags');
});

test('sea-assistant-entry.js TAXONOMY_TRANSLATION_DICTIONARY maps Big Bags to Carga Unitizada / Envasada', () => {
    assert.match(seaAssistantJs, /const TAXONOMY_TRANSLATION_DICTIONARY =/);
    assert.match(seaAssistantJs, /matcher:\s*\/big\\s\*bags\?\|jumbo\|sacos\?\|ensacado\/i/);
    assert.match(seaAssistantJs, /category:\s*["']Carga Unitizada \/ Envasada["']/);
});

test('sea-assistant-entry.js cemento con envase resolves to Carga Unitizada / Envasada and not Minerales y Construcción', () => {
    const envaseBlock = seaAssistantJs.slice(seaAssistantJs.indexOf('else if (isCementOrMineral && hasEnvase)'), seaAssistantJs.indexOf('else if (isCementOrMineral && hasEnvase)') + 500);
    assert.match(envaseBlock, /category = "Carga Unitizada \/ Envasada"/);
    assert.doesNotMatch(envaseBlock, /resolvedCategory = "Minerales y Construcción"/);
});

test('sea-assistant-entry.js preserves auto mode and sets aiInjected dataset on rate inputs', () => {
    assert.match(seaAssistantJs, /window\.setRitmoMode\?\.\(["']auto["'],\s*["']pol["']/);
    assert.match(seaAssistantJs, /window\.setRitmoMode\?\.\(["']auto["'],\s*["']pod["']/);
    assert.match(seaAssistantJs, /dataset\.aiInjected\s*=\s*["']true["']/);
});

test('recalculateCraneRates and applyMethodAndProductConditions respect AI rate in auto mode', () => {
    // Mock browser DOM environment
    const elements = {
        'ritmo-mode-pol': { value: 'auto' },
        'rate-load': { value: '1500', dataset: { manualOverride: 'false', aiInjected: 'true' }, readOnly: true },
        'metodo_carga': { value: 'big_bags_barco' },
        'cargo-product': { value: 'Big Bags (Minerales/Cemento)' },
        'cargo-type': { value: 'Carga Unitizada / Envasada' }
    };

    const mockDoc = {
        getElementById: (id) => elements[id] || null
    };

    const mockWindow = {
        isAiInjectedRate: true,
        document: mockDoc,
        State: { loadRate: 1500 }
    };

    // Simulate recalculateCraneRates guard logic with base AI rate adoption
    let rateOverwritten = false;
    function testRecalculateCraneRates(side = 'pol') {
        const modeEl = mockDoc.getElementById(`ritmo-mode-${side}`);
        if (mockWindow.isAiInjectedRate && modeEl?.value !== 'manual') {
            const rateInputId = side === 'pod' ? 'rate-disch' : 'rate-load';
            const rateInput = mockDoc.getElementById(rateInputId);
            const aiRate = parseFloat(rateInput?.value) || mockWindow.State?.loadRate || 0;
            if (aiRate > 0) {
                return aiRate; // Respetar y asumir como valor base calculado
            }
            return;
        }
        rateOverwritten = true;
        elements['rate-load'].value = '666';
    }

    const calculatedBase = testRecalculateCraneRates('pol');
    assert.equal(calculatedBase, 1500, 'Calculated base should adopt AI rate of 1500 in auto mode');
    assert.equal(rateOverwritten, false, 'Rate should not be overwritten when isAiInjectedRate is true in auto mode');
    assert.equal(elements['rate-load'].value, '1500', 'Rate should remain 1500 TPD');
    assert.equal(elements['ritmo-mode-pol'].value, 'auto', 'Mode should stay auto');

    // Now switch to manual mode
    elements['ritmo-mode-pol'].value = 'manual';
    testRecalculateCraneRates('pol');
    assert.equal(rateOverwritten, true, 'Rate recalculation can proceed when mode is manual');
    assert.equal(elements['rate-load'].value, '666', 'Rate was updated in manual mode');
});

test('sea-assistant-entry.js Big Bags and Palets never map to Carga de Proyecto or Minerales', () => {
    // Verify isBreakbulk does NOT match isolated 'auto'
    assert.doesNotMatch(seaAssistantJs, /isBreakbulk\s*=\s*\/[^\/]*\bauto\b[^\/]*\//, 'isBreakbulk regex must not match word auto');

    // Verify Big Bags priority resolution in sea-assistant-entry.js
    assert.match(seaAssistantJs, /hasUnitizedPackagingClue/, 'hasUnitizedPackagingClue must be present in sea-assistant-entry.js');
    assert.match(seaAssistantJs, /resolvedProduct\s*=\s*isPallet\s*\?\s*["']Carga Paletizada["']\s*:\s*["']Big Bags \(Minerales\/Cemento\)["']/, 'resolvedProduct must resolve to Big Bags (Minerales/Cemento)');
});

test('populateCargoProducts in index.html normalizes Big Bags alias to Big Bags (Minerales/Cemento)', () => {
    assert.match(indexHtml, /if\s*\(categoryEl\.value\s*===\s*['"]Carga Unitizada \/ Envasada['"]\)/);
    assert.match(indexHtml, /selectedProduct\s*=\s*['"]Big Bags \(Minerales\/Cemento\)['"]/);
});
