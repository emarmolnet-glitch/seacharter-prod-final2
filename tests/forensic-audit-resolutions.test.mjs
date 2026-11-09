import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cerebroIaPath = path.resolve('netlify/functions/cerebro-ia.js');
const cerebroIaJs = fs.readFileSync(cerebroIaPath, 'utf8');

const seaAssistantPath = path.resolve('src/sea-assistant-entry.js');
const seaAssistantJs = fs.readFileSync(seaAssistantPath, 'utf8');

const indexPath = path.resolve('index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

test('1. Backend proxy cerebro-ia.js: isBreakbulk regex isolates auto tokens so modo auto does not trigger breakbulk', () => {
    // Extract regex
    const match = cerebroIaJs.match(/const isBreakbulk = (\/.*?\/[a-z]*)\.test\(normalized\);/);
    assert.ok(match, 'isBreakbulk regex should be defined');
    const regex = eval(match[1]);
    
    assert.equal(regex.test('modo auto'), false, '"modo auto" must NOT trigger isBreakbulk');
    assert.equal(regex.test('ritmo auto'), false, '"ritmo auto" must NOT trigger isBreakbulk');
    assert.equal(regex.test('auto'), false, '"auto" must NOT trigger isBreakbulk');
    assert.equal(regex.test('en auto'), false, '"en auto" must NOT trigger isBreakbulk');
    assert.equal(regex.test('maquinaria pesada'), true, '"maquinaria pesada" should trigger isBreakbulk');
    assert.equal(regex.test('coche'), true, '"coche" should trigger isBreakbulk');
    assert.equal(regex.test('automovil'), true, '"automovil" should trigger isBreakbulk');
});

test('2. Backend proxy cerebro-ia.js: Big Bags maps to Big Bags (Minerales/Cemento)', () => {
    assert.match(cerebroIaJs, /product\s*=\s*isBigBag\s*\?\s*["']Big Bags \(Minerales\/Cemento\)["']/);
    assert.match(cerebroIaJs, /product\s*===\s*["']Big Bags["']/);
});

test('3. Frontend sea-assistant-entry.js: updates taxonomy in DOM before simulating clickMethodPill', () => {
    const fnStartIndex = seaAssistantJs.indexOf('async function executeActionableAiUpdateFields(');
    const fnEndIndex = seaAssistantJs.indexOf('window.executeActionableAiUpdateFields = executeActionableAiUpdateFields;');
    const fnBody = seaAssistantJs.slice(fnStartIndex, fnEndIndex !== -1 ? fnEndIndex : fnStartIndex + 40000);
    
    const hierarchyIndex = fnBody.indexOf('window.replaceCargoHierarchySelection');
    const clickMethodPillIndex = fnBody.indexOf('clickMethodPill(');

    assert.ok(hierarchyIndex !== -1, 'replaceCargoHierarchySelection should exist in executeActionableAiUpdateFields');
    assert.ok(clickMethodPillIndex !== -1, 'clickMethodPill should exist in executeActionableAiUpdateFields');
    assert.ok(hierarchyIndex < clickMethodPillIndex, 'replaceCargoHierarchySelection must be executed BEFORE clickMethodPill');
});

test('4. Frontend index.html: calcularRitmoEfectivo respects enteredRate when isAiInjectedRate is true in auto mode', () => {
    const fnStart = indexHtml.indexOf('function calcularRitmoEfectivo(');
    const fnBody = indexHtml.slice(fnStart, fnStart + 800);
    assert.match(fnBody, /window\.isAiInjectedRate\s*&&\s*enteredRate\s*>\s*0/);
});

test('5. Frontend index.html: updateCargoOperationDraft protects window.isAiInjectedRate against premature resets', () => {
    const fnStart = indexHtml.indexOf('function updateCargoOperationDraft(');
    const fnBody = indexHtml.slice(fnStart, fnStart + 1500);
    assert.match(fnBody, /activeEl\s*&&\s*activeEl\.id\s*===\s*id/);
    assert.match(fnBody, /!isProtectedMode/);
});
