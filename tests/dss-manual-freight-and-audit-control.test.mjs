import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

test('1. FLETE ALL-IN GROSS is an editable number input with step="0.01" and reset capability', () => {
  const dssModuleContent = fs.readFileSync(path.join(repoRoot, 'src/DecisionSupportModule.js'), 'utf-8');
  const decisionesHtmlContent = fs.readFileSync(path.join(repoRoot, 'decisiones.html'), 'utf-8');

  // Must have display-all-in-gross as input type number with step 0.01
  assert.match(
    dssModuleContent,
    /<input[^>]*id=["']display-all-in-gross["'][^>]*>/,
    'display-all-in-gross must exist in DecisionSupportModule.js'
  );
  assert.match(
    dssModuleContent,
    /<input[^>]*id=["']display-all-in-gross["'][^>]*step=["']0\.01["']|<input[^>]*step=["']0\.01["'][^>]*id=["']display-all-in-gross["']/,
    'display-all-in-gross must have step="0.01" in DecisionSupportModule.js'
  );
  assert.match(
    decisionesHtmlContent,
    /<input[^>]*id=["']display-all-in-gross["'][^>]*step=["']0\.01["']|<input[^>]*step=["']0\.01["'][^>]*id=["']display-all-in-gross["']/,
    'display-all-in-gross must have step="0.01" in decisiones.html'
  );
  const indexHtmlContent = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');
  assert.match(
    indexHtmlContent,
    /<input[^>]*id=["']display-all-in-gross["'][^>]*step=["']0\.01["']|<input[^>]*step=["']0\.01["'][^>]*id=["']display-all-in-gross["']/,
    'display-all-in-gross must have step="0.01" in index.html'
  );

  // Must have reset button / function restablecerFleteAllInGross
  assert.match(
    dssModuleContent,
    /restablecerFleteAllInGross/,
    'restablecerFleteAllInGross must be defined in DecisionSupportModule.js'
  );
  assert.match(
    decisionesHtmlContent,
    /restablecerFleteAllInGross/,
    'restablecerFleteAllInGross must be defined in decisiones.html'
  );

  // Must have green styling
  assert.match(
    dssModuleContent,
    /text-emerald-400/,
    'display-all-in-gross must have emerald styling'
  );
});

test('2. input-fleteEstimado is directly editable without read-only lock and recalculates reactively', () => {
  const dssModuleContent = fs.readFileSync(path.join(repoRoot, 'src/DecisionSupportModule.js'), 'utf-8');
  const decisionesHtmlContent = fs.readFileSync(path.join(repoRoot, 'decisiones.html'), 'utf-8');
  const indexHtmlContent = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');

  // input-fleteEstimado must not have readonly attribute
  assert.doesNotMatch(
    dssModuleContent,
    /<input[^>]*id=["']input-fleteEstimado["'][^>]*readonly/i,
    'input-fleteEstimado must not be readonly in DecisionSupportModule.js'
  );
  assert.doesNotMatch(
    decisionesHtmlContent,
    /<input[^>]*id=["']input-fleteEstimado["'][^>]*readonly/i,
    'input-fleteEstimado must not be readonly in decisiones.html'
  );

  // input-fleteEstimado has step="0.01" or step="any"
  assert.match(
    decisionesHtmlContent,
    /<input[^>]*id=["']input-fleteEstimado["'][^>]*step=["'](0\.01|any)["']/,
    'input-fleteEstimado must have step="0.01" or "any"'
  );

  // DecisionSupportModule template binds input-fleteEstimado to oninput="actualizarDesdeFormulario()"
  assert.match(
    dssModuleContent,
    /<input[^>]*id=["']input-fleteEstimado["'][^>]*oninput=["']actualizarDesdeFormulario\(\)["']/,
    'DecisionSupportModule binds input-fleteEstimado to actualizarDesdeFormulario'
  );
  assert.match(
    decisionesHtmlContent,
    /document\.activeElement === inputFleteEstimado/,
    'decisiones.html must respect active typing on input-fleteEstimado'
  );
  assert.match(
    indexHtmlContent,
    /document\.activeElement === inputFleteEstimado/,
    'index.html must respect active typing on input-fleteEstimado'
  );
});

test('3. Audit Panel includes highlighted manual input for Flete Final Acordado above Fixture Recap Opción B', () => {
  const dssModuleContent = fs.readFileSync(path.join(repoRoot, 'src/DecisionSupportModule.js'), 'utf-8');
  const decisionesHtmlContent = fs.readFileSync(path.join(repoRoot, 'decisiones.html'), 'utf-8');
  const indexHtmlContent = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');

  // Must contain input-audit-final-freight with step="0.01"
  assert.match(
    dssModuleContent,
    /<input[^>]*id=["']input-audit-final-freight["'][^>]*step=["']0\.01["']|<input[^>]*step=["']0\.01["'][^>]*id=["']input-audit-final-freight["']/,
    'input-audit-final-freight with step="0.01" must be in DecisionSupportModule.js'
  );
  assert.match(
    decisionesHtmlContent,
    /<input[^>]*id=["']input-audit-final-freight["'][^>]*step=["']0\.01["']|<input[^>]*step=["']0\.01["'][^>]*id=["']input-audit-final-freight["']/,
    'input-audit-final-freight with step="0.01" must be in decisiones.html'
  );
  assert.match(
    indexHtmlContent,
    /<input[^>]*id=["']input-audit-final-freight["'][^>]*step=["']0\.01["']|<input[^>]*step=["']0\.01["'][^>]*id=["']input-audit-final-freight["']/,
    'input-audit-final-freight with step="0.01" must be in index.html'
  );

  // Must be positioned right above btn-fixture-recap-opcion-b
  const idxAuditInputDss = dssModuleContent.indexOf('id="input-audit-final-freight"');
  const idxBtnOpcionBDss = dssModuleContent.indexOf('id="btn-fixture-recap-opcion-b"');
  assert.ok(idxAuditInputDss > -1 && idxBtnOpcionBDss > -1, 'Both elements must exist in DecisionSupportModule.js');
  assert.ok(idxAuditInputDss < idxBtnOpcionBDss, 'input-audit-final-freight must precede btn-fixture-recap-opcion-b');

  const idxAuditInputHtml = decisionesHtmlContent.indexOf('id="input-audit-final-freight"');
  const idxBtnOpcionBHtml = decisionesHtmlContent.indexOf('id="btn-fixture-recap-opcion-b"');
  assert.ok(idxAuditInputHtml > -1 && idxBtnOpcionBHtml > -1, 'Both elements must exist in decisiones.html');
  assert.ok(idxAuditInputHtml < idxBtnOpcionBHtml, 'input-audit-final-freight must precede btn-fixture-recap-opcion-b');

  const idxAuditInputIndex = indexHtmlContent.indexOf('id="input-audit-final-freight"');
  const idxBtnOpcionBIndex = indexHtmlContent.indexOf('id="btn-fixture-recap-opcion-b"');
  assert.ok(idxAuditInputIndex > -1 && idxBtnOpcionBIndex > -1, 'Both elements must exist in index.html');
  assert.ok(idxAuditInputIndex < idxBtnOpcionBIndex, 'input-audit-final-freight must precede btn-fixture-recap-opcion-b');
});

test('4. Modifying Audit freight updates live recap, dynamic text in paragraph 4, and export functions', () => {
  const dssModuleContent = fs.readFileSync(path.join(repoRoot, 'src/DecisionSupportModule.js'), 'utf-8');
  const decisionesHtmlContent = fs.readFileSync(path.join(repoRoot, 'decisiones.html'), 'utf-8');
  const indexHtmlContent = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');

  // Function actualizarTextoReporteConFlete must exist
  assert.match(dssModuleContent, /function actualizarTextoReporteConFlete/, 'actualizarTextoReporteConFlete must be in DecisionSupportModule.js');
  assert.match(decisionesHtmlContent, /function actualizarTextoReporteConFlete/, 'actualizarTextoReporteConFlete must be in decisiones.html');
  assert.match(indexHtmlContent, /function actualizarTextoReporteConFlete/, 'actualizarTextoReporteConFlete must be in index.html');

  // onAuditFinalFreightChange updates modificaciones_recap.flete
  assert.match(dssModuleContent, /modificaciones_recap\.flete\s*=\s*(num|val)/, 'modificaciones_recap.flete must be updated on audit freight change');
  assert.match(decisionesHtmlContent, /modificaciones_recap\.flete\s*=\s*(num|val)/, 'modificaciones_recap.flete must be updated in decisiones.html');

  // Paragraph 4 replacement logic
  assert.match(
    dssModuleContent,
    /4\.\s*ANÁLISIS FINANCIERO Y FLETE/,
    'Must target paragraph 4. ANÁLISIS FINANCIERO Y FLETE'
  );

  // generarFixtureRecapOpcionB, generateAuditPDF, generateFixtureRecapPDF, aplicarCondicionesAlRecap use custom freight
  assert.match(
    dssModuleContent,
    /document\.getElementById\(['"]input-audit-final-freight['"]\)/,
    'generarFixtureRecapOpcionB checks input-audit-final-freight'
  );
  assert.match(
    decisionesHtmlContent,
    /document\.getElementById\(['"]input-audit-final-freight['"]\)/,
    'decisiones.html checks input-audit-final-freight in recap and pdf actions'
  );
  assert.match(
    indexHtmlContent,
    /document\.getElementById\(['"]input-audit-final-freight['"]\)/,
    'index.html checks input-audit-final-freight in recap and pdf actions'
  );
});

test('5. Strategic recommendations render cleanly for both plain strings and objects', () => {
  const dssModuleContent = fs.readFileSync(path.join(repoRoot, 'src/DecisionSupportModule.js'), 'utf-8');
  const decisionesHtmlContent = fs.readFileSync(path.join(repoRoot, 'decisiones.html'), 'utf-8');
  const indexHtmlContent = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');

  // Verify typeof rec === 'string' handling
  const checkRecommendationCode = (content, filename) => {
    assert.match(
      content,
      /typeof rec === ['"]string['"]/,
      `typeof rec === 'string' must be handled in ${filename}`
    );
    assert.match(
      content,
      /rec\.texto\s*\|\|\s*rec\.descripcion\s*\|\|\s*rec\.recomendacion/,
      `rec.texto || rec.descripcion || rec.recomendacion fallback must be present in ${filename}`
    );
  };

  checkRecommendationCode(dssModuleContent, 'src/DecisionSupportModule.js');
  checkRecommendationCode(decisionesHtmlContent, 'decisiones.html');
  checkRecommendationCode(indexHtmlContent, 'index.html');
});

test('6. All numeric inputs in view-decisiones have step="any" or step="0.01"', () => {
  const dssModuleContent = fs.readFileSync(path.join(repoRoot, 'src/DecisionSupportModule.js'), 'utf-8');
  const decisionesHtmlContent = fs.readFileSync(path.join(repoRoot, 'decisiones.html'), 'utf-8');

  // Check critical DSS inputs
  const criticalInputIds = [
    'input-cargoQty',
    'input-fleteEstimado',
    'input-laycanDaysLeft',
    'input-estimatedVoyageDays',
    'input-loadRate',
    'input-dischargeRate',
    'input-portDays',
    'input-seaDays',
    'input-jwlaPremiumUSD',
    'input-ballastDays',
    'input-actualCargoIntake',
    'display-all-in-gross',
    'input-audit-final-freight'
  ];

  for (const id of criticalInputIds) {
    const regex = new RegExp(`id=["']${id}["'][^>]*step=["'](any|0\\.01)["']|step=["'](any|0\\.01)["'][^>]*id=["']${id}["']`);
    assert.ok(
      regex.test(dssModuleContent) || regex.test(decisionesHtmlContent),
      `Input #${id} must have step="any" or step="0.01"`
    );
  }

  // Regex scan over all <input type="number"> in decisiones.html inside view-decisiones
  const numberInputMatches = decisionesHtmlContent.match(/<input[^>]*type=["']number["'][^>]*>/g) || [];
  for (const inputTag of numberInputMatches) {
    const hasStep = /step=["'](any|0\.01|0\.1|1|\d+(\.\d+)?)["']/.test(inputTag);
    assert.ok(hasStep, `Tag ${inputTag} should define a step attribute`);
  }
});

test('7. actualizarTextoReporteConFlete updates freight without overwriting Break-Even and supports USD/MT', () => {
  const dssModuleContent = fs.readFileSync(path.join(repoRoot, 'src/DecisionSupportModule.js'), 'utf-8');
  const fnMatch = dssModuleContent.match(/export function actualizarTextoReporteConFlete\([\s\S]*?\n\}/);
  assert.ok(fnMatch, 'actualizarTextoReporteConFlete must be present in DecisionSupportModule.js');
  const cleanFnCode = fnMatch[0].replace('export function', 'function');
  const actualizarTextoReporteConFlete = new Function(`${cleanFnCode}; return actualizarTextoReporteConFlete;`)();

  const inputReport = '4. ANÁLISIS FINANCIERO Y FLETE: El coste base operativo (Break-Even) se establece en 26.99 USD/MT frente a un flete unitario de 34.2 USD/MT';
  const updatedReport = actualizarTextoReporteConFlete(inputReport, 38.5);

  const expectedReport = '4. ANÁLISIS FINANCIERO Y FLETE: El coste base operativo (Break-Even) se establece en 26.99 USD/MT frente a un flete unitario de 38.50 USD/MT';
  assert.strictEqual(
    updatedReport,
    expectedReport,
    'Break-Even must remain intact at 26.99 USD/MT and freight must update to 38.50 USD/MT'
  );

  // Also test with $ and phrases
  const inputReportDollar = '4. ANÁLISIS FINANCIERO Y FLETE: El coste base operativo (Break-Even) se establece en $26.99/MT frente a un flete unitario de $34.20/MT';
  const updatedDollar = actualizarTextoReporteConFlete(inputReportDollar, 38.5);
  assert.strictEqual(
    updatedDollar,
    '4. ANÁLISIS FINANCIERO Y FLETE: El coste base operativo (Break-Even) se establece en $26.99/MT frente a un flete unitario de $38.50/MT',
    'Break-Even must remain intact at $26.99/MT and freight must update to $38.50/MT'
  );

  const inputAjuste = 'Se sugiere cerrar ajustando el flete a $35.00/MT y mantener Flete ALL-IN GROSS: $36.00/MT';
  const updatedAjuste = actualizarTextoReporteConFlete(inputAjuste, 38.5);
  assert.match(updatedAjuste, /ajustando el flete a \$38\.50\/MT/);
  assert.match(updatedAjuste, /Flete ALL-IN GROSS: \$38\.50\/MT/);

  // Also verify that decisiones.html and index.html implementations match behavior
  const indexHtmlContent = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');
  const idxFnMatch = indexHtmlContent.match(/function actualizarTextoReporteConFlete\([\s\S]*?\n        \}/);
  assert.ok(idxFnMatch, 'actualizarTextoReporteConFlete must be present in index.html');
  const indexActualizarFn = new Function(`${idxFnMatch[0]}; return actualizarTextoReporteConFlete;`)();
  const indexResult = indexActualizarFn(inputReport, 38.5);
  assert.strictEqual(indexResult, expectedReport, 'index.html implementation must preserve Break-Even and update freight');
});
