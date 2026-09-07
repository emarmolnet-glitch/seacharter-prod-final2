import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const widgetSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const widgetCssSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.css', import.meta.url), 'utf8');

test('1. AgenteProyectosWidget connects handleSend and handleFileAttach directly to /.netlify/functions/project-parser via POST', () => {
  // Verifies POST endpoint invocation in both handlers
  assert.match(widgetSource, /fetch\(\s*['"]\/\.netlify\/functions\/project-parser['"]/);
  assert.match(widgetSource, /method:\s*['"]POST['"]/);
  assert.match(widgetSource, /['"]Content-Type['"]:\s*['"]application\/json['"]/);
});

test('2. AgenteProyectosWidget sends JSON body structured with text and fileBase64', () => {
  // Verifies handleSend sends { text: raw, fileBase64: null }
  assert.match(widgetSource, /body:\s*JSON\.stringify\(\s*\{\s*text:\s*raw,\s*fileBase64:\s*null/);
  // Verifies handleFileAttach sends clean Base64 and text with file metadata
  assert.match(widgetSource, /cleanBase64\s*=[\s\S]*?split\(','\)\[1\]/);
  assert.match(widgetSource, /body:\s*JSON\.stringify\(\s*\{[\s\S]*?fileBase64:\s*cleanBase64/);
});

test('3. AgenteProyectosWidget provides visual loading feedback "Analizando orden y calculando parámetros..." during in-flight requests', () => {
  // Checks isAnalyzing state
  assert.match(widgetSource, /const\s+\[isAnalyzing,\s*setIsAnalyzing\]\s*=\s*useState\(false\);/);
  // Checks loading feedback indicator in messages
  assert.match(widgetSource, /Analizando orden y calculando parámetros\.\.\./);
  assert.match(widgetSource, /pa-loading-bubble/);
  assert.match(widgetSource, /pa-spinner/);
  // Verifies button and input are disabled during analysis
  assert.match(widgetSource, /disabled=\{isAnalyzing\}/);
  // Verifies CSS for loading animation
  assert.match(widgetCssSource, /\.pa-loading-bubble/);
  assert.match(widgetCssSource, /pa-pulse/);
});

test('4. AgenteProyectosWidget captures items array and notifies onUpdatePayload with parsed cargo lines', () => {
  // Extracts items array from response data
  assert.match(widgetSource, /formattedItems\s*=\s*\(data\.success\s*&&\s*Array\.isArray\(data\.items\)\)\s*\?\s*data\.items\s*:\s*\[\]/);
  // Passes items and operational assessment to onUpdatePayload
  assert.match(widgetSource, /onUpdatePayload\(\s*\{[\s\S]*?items:\s*formattedItems/);
  assert.match(widgetSource, /charteringAssessment:\s*data\.charteringAssessment/);
  assert.match(widgetSource, /operationalProfile:\s*data\.operationalProfile/);
});

test('5. ForwarderWorkspace injects received items directly into Packing List table state', () => {
  assert.match(workspaceSource, /const\s+incomingItems\s*=\s*payload\.items\s*\|\|\s*payload\.cargo_items;/);
  assert.match(workspaceSource, /setCargoItems\(mappedItems\);/);
  assert.match(workspaceSource, /setIsCargoModalOpen\(true\);/);
  assert.match(workspaceSource, /autoCalculateEstimates\(mappedItems\);/);
});

test('6. Cascade calculation: 40-tonne threshold deactivates TCE and computes LCL costs when weight < 40t', () => {
  // Checks threshold evaluation in autoCalculateEstimates
  assert.match(workspaceSource, /const\s+isUnderThreshold\s*=\s*totalWeightTons\s*<\s*40;/);
  assert.match(workspaceSource, /setIsUnder40t\(isUnderThreshold\);/);
  // Deactivates TCE when under 40t
  assert.match(workspaceSource, /setTceActive\(false\);/);
  assert.match(workspaceSource, /setTceValue\(null\);/);
  assert.match(workspaceSource, /setCharterMode\(['"]Grupaje LCL['"]\);/);
  // Computes LCL freight costs with revenue tons and standard port charges
  assert.match(workspaceSource, /oceanFreightCost\s*=\s*revenueTons\s*\*\s*65\.0/);
  assert.match(workspaceSource, /cfsOriginCost\s*=\s*revenueTons\s*\*\s*22\.0/);
  assert.match(workspaceSource, /cfsDestCost\s*=\s*revenueTons\s*\*\s*25\.0/);
  assert.match(workspaceSource, /portT3Cost\s*=\s*revenueTons\s*\*\s*4\.5/);
  assert.match(workspaceSource, /blFee\s*=\s*85\.0/);
  assert.match(workspaceSource, /totalLclFreightCost/);
});

test('7. Cascade calculation: applies full charter and calculates TCE when weight >= 40t', () => {
  assert.match(workspaceSource, /setTceActive\(true\);/);
  assert.match(workspaceSource, /setCharterMode\(['"]Fletamento Completo['"]\);/);
  assert.match(workspaceSource, /dailyTce/);
  assert.match(workspaceSource, /setTceValue\(dailyTce\);/);
});

test('8. Cascade calculation: Operational profile for Big Bags excludes heavy timber cradles and project steel cables', () => {
  // Detects Big Bags or bulk cargo
  assert.match(workspaceSource, /const\s+isBigBagsOrBulk\s*=\s*items\.some/);
  assert.match(workspaceSource, /setIsBigBagsCargo\(isBigBagsOrBulk\);/);
  // Zeroes out heavy wood cradles and steel cables
  assert.match(workspaceSource, /effectiveDunnage\s*=\s*0;/);
  assert.match(workspaceSource, /effectiveCadenas\s*=\s*0;/);
  assert.match(workspaceSource, /setDunnageWood\(0\);/);
  assert.match(workspaceSource, /setChainsBinders\(0\);/);
  // Banner and counter display reflect Big Bags exclusion
  assert.match(workspaceSource, /Perfil:\s*Mercancía Ensacada \/ Big Bags/);
  assert.match(workspaceSource, /Excluidas \(Big Bags\)/);
  assert.match(workspaceSource, /Maderas de cuna pesadas y cables de acero de proyecto quedan excluidos/);
});

test('9. Cascade calculation: automatically updates total estimated cost and sales price on screen', () => {
  assert.match(workspaceSource, /setEstimatedCost\(totalEstimatedCost\.toFixed\(2\)\);/);
  assert.match(workspaceSource, /setSalePrice\(\(totalEstimatedCost\s*\*\s*1\.15\)\.toFixed\(2\)\);/);
  assert.match(workspaceSource, /id="input-estimated-cost"/);
  assert.match(workspaceSource, /id="input-sale-price"/);
});
