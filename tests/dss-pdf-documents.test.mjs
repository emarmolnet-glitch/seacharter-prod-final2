import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('DSS panel header contains the secondary PDF document action buttons', () => {
  assert.match(indexHtml, /id="btn-generate-audit-pdf"/, 'Audit PDF button must exist in index.html');
  assert.match(indexHtml, /onclick="generateAuditPDF\(\)"/, 'Audit PDF button must invoke generateAuditPDF()');
  assert.match(indexHtml, /Generar Auditoría \(PDF\)/, 'Audit PDF button text label must be correct');

  assert.match(indexHtml, /id="btn-generate-fixture-recap-pdf"/, 'Fixture Recap button must exist in index.html');
  assert.match(indexHtml, /onclick="generateFixtureRecapPDF\(\)"/, 'Fixture Recap button must invoke generateFixtureRecapPDF()');
  assert.match(indexHtml, /Generar Oferta \(Fixture Recap\)/, 'Fixture Recap button text label must be correct');
});

test('DSS PDF generation functions are defined and exposed on window in index.html', () => {
  assert.match(indexHtml, /function generateAuditPDF\(\)/, 'generateAuditPDF function must be defined');
  assert.match(indexHtml, /window\.generateAuditPDF = generateAuditPDF;/, 'generateAuditPDF must be exported on window');

  assert.match(indexHtml, /function generateFixtureRecapPDF\(\)/, 'generateFixtureRecapPDF function must be defined');
  assert.match(indexHtml, /window\.generateFixtureRecapPDF = generateFixtureRecapPDF;/, 'generateFixtureRecapPDF must be exported on window');

  assert.match(indexHtml, /function buildAuditHTMLTemplate\(state\)/, 'buildAuditHTMLTemplate function must be defined');
  assert.match(indexHtml, /function buildFixtureRecapHTMLTemplate\(state\)/, 'buildFixtureRecapHTMLTemplate function must be defined');
});

test('buildAuditHTMLTemplate generates complete corporate risk audit document', () => {
  // Extract buildAuditHTMLTemplate source and execute with mock state
  const startIdx = indexHtml.indexOf('function buildAuditHTMLTemplate(state)');
  const endIdx = indexHtml.indexOf('window.buildAuditHTMLTemplate = buildAuditHTMLTemplate;', startIdx);
  assert.notEqual(startIdx, -1, 'buildAuditHTMLTemplate function must be present');
  assert.notEqual(endIdx, -1, 'buildAuditHTMLTemplate function end marker must be present');

  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('state', `${fnSource}; return buildAuditHTMLTemplate(state);`);

  const mockState = {
    pol: 'Rotterdam',
    pod: 'Houston',
    cargoQty: 50000,
    commodity: 'Siderúrgico / Carga General',
    laycanDaysLeft: 10,
    estimatedVoyageDays: 8,
    loadRate: 5000,
    portDays: 10,
    seaDays: 8,
    fleteEstimado: 250000,
    breakEven: 210000,
    vesselName: 'MV GEARED BULKER'
  };

  const html = evalFn(mockState);

  // Requirement 2 validations:
  assert.match(html, /Rodahmar Shipping SL/, 'Header must include Rodahmar Shipping SL');
  assert.match(html, /Auditoría de Riesgo Comercial, Viabilidad Operativa y Lógica DSS/, 'Header title must be correct');

  // Section 1: Inconsistencia Operativa
  assert.match(html, /ANÁLISIS DE INCONSISTENCIA OPERATIVA Y CAPACIDAD MECÁNICA DEL BUQUE/, 'Section 1 header');
  assert.match(html, /2\.000 MT\/día/, 'Section 1 must reference Geared 2,000 MT/day limitation');
  assert.match(html, /5\.000 MT\/día/, 'Section 1 must reference 5,000 MT/day demand');

  // Section 2: Riesgo de Puerto
  assert.match(html, /MATRIZ DINÁMICA DE RIESGO DE PUERTO Y ALERTAS OPERATIVAS/, 'Section 2 header');
  assert.match(html, /POL: Rotterdam/, 'Section 2 must include POL alert data');
  assert.match(html, /POD: Houston/, 'Section 2 must include POD alert data');

  // Section 3: Lógica DSS Triggers
  assert.match(html, /DOCUMENTACIÓN DE TRIGGERS Y REGLAS ALGORÍTMICAS ACTIVADAS/, 'Section 3 header');
  assert.match(html, /Exigencia Cláusula FIOS/, 'Trigger 1 FIO clause');
  assert.match(html, /Ajuste \/ Recargo de Flete/, 'Trigger 2 Freight Surcharge');
  assert.match(html, /Demurrage Disuasorio/, 'Trigger 3 Demurrage Protection');

  // Section 4: Directrices de Fijación
  assert.match(html, /DIRECTRICES Y ESCENARIOS DE FIJACIÓN Y NEGOCIACIÓN COMERCIAL/, 'Section 4 header');
  assert.match(html, /Escenario A: Ajuste a la Realidad Operativa/, 'Scenario A');
  assert.match(html, /Escenario B: Medios Externos FIO/, 'Scenario B');
  assert.match(html, /Escenario C: Recargo del 15% y Subida de Demurrage/, 'Scenario C');
});

test('buildFixtureRecapHTMLTemplate generates traditional shipping telex fixture recap', () => {
  const startIdx = indexHtml.indexOf('function buildFixtureRecapHTMLTemplate(state)');
  const endIdx = indexHtml.indexOf('window.buildFixtureRecapHTMLTemplate = buildFixtureRecapHTMLTemplate;', startIdx);
  assert.notEqual(startIdx, -1, 'buildFixtureRecapHTMLTemplate function must be present');
  assert.notEqual(endIdx, -1, 'buildFixtureRecapHTMLTemplate function end marker must be present');

  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('state', `${fnSource}; return buildFixtureRecapHTMLTemplate(state);`);

  const mockState = {
    pol: 'Rotterdam',
    pod: 'Houston',
    cargoQty: 50000,
    commodity: 'Siderúrgico / Carga General',
    laycanDaysLeft: 10,
    estimatedVoyageDays: 8,
    loadRate: 5000,
    portDays: 10,
    seaDays: 8,
    fleteEstimado: 250000,
    breakEven: 210000,
    vesselName: 'MV GEARED BULKER'
  };

  const html = evalFn(mockState);

  // Requirement 3 validations:
  assert.match(html, /RODAHMAR SHIPPING SL - FIRM FIXTURE RECAP \/ OFERTA COMERCIAL/, 'Recap title');
  assert.match(html, /VALIDITY\s*:\s*24 HOURS FROM ISSUANCE/, '24h validity statement');

  // 1. MAIN TERMS
  assert.match(html, /1\. MAIN TERMS/, 'Section 1 header');
  assert.match(html, /ACCT\s*:\s*CHARTERERS ACCOUNT/, 'ACCT term');
  assert.match(html, /OWNERS\s*:\s*RODAHMAR SHIPPING SL \(AS DISPONENT OWNERS\)/, 'OWNERS as Disponent Owners');
  assert.match(html, /VESSEL\s*:\s*MV GEARED BULKER - ABT 50,000 MT DWT FULLY GEARED WITH/, 'Geared Vessel term with DWT');
  assert.match(html, /CARGO\s*:\s*50,000 METRIC TONS/, 'Cargo quantity and commodity');
  assert.match(html, /POL\s*:\s*1 SAFE BERTH \/ 1 SAFE PORT ROTTERDAM/, 'POL term');
  assert.match(html, /POD\s*:\s*1 SAFE BERTH \/ 1 SAFE PORT HOUSTON/, 'POD term');

  // 2. FREIGHT & FINANCIALS
  assert.match(html, /2\. FREIGHT & FINANCIALS/, 'Section 2 header');
  assert.match(html, /FREIGHT RATE:\s*USD \$5\.00 PER METRIC TONNE/, 'Freight rate applying surcharges');
  assert.match(html, /TERMS\s*:\s*FIOS \(FREE IN AND OUT STOWED\)/, 'FIOS terms');

  // 3. LAYTIME & OPERATIONS
  assert.match(html, /3\. LAYTIME & OPERATIONS/, 'Section 3 header');
  assert.match(html, /LOADING RATE\s*:\s*5,000 METRIC TONS PER WEATHER WORKING DAY/, 'Load rate');
  assert.match(html, /DISDISCH RATE\s*:\s*MECHANICALLY LIMITED TO ~2,000 METRIC TONS/, 'Discharge rate limited to ~2,000 MT WWD SHINC');
  assert.match(html, /DEMURRAGE\s*:\s*USD 15,000 PER DAY/, 'Demurrage protection rate');

  // 4. SPECIAL CLAUSES
  assert.match(html, /4\. SPECIAL CLAUSES/, 'Section 4 header');
  assert.match(html, /GEAR CLAUSE/, 'Gear clause');
  assert.match(html, /WEATHER CLAUSE/, 'Weather clause');
  assert.match(html, /GENCON 1994/, 'GENCON 94 charterparty form');
});

test('buildFixtureRecapHTMLTemplate formats dynamic vessel name, DWT with thousands separator, and MV TBN fallback', () => {
  const startIdx = indexHtml.indexOf('function buildFixtureRecapHTMLTemplate(state)');
  const endIdx = indexHtml.indexOf('window.buildFixtureRecapHTMLTemplate = buildFixtureRecapHTMLTemplate;', startIdx);
  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('state', `${fnSource}; return buildFixtureRecapHTMLTemplate(state);`);

  // 1. Dynamic vessel name and formatted DWT
  const htmlCustom = evalFn({ vesselName: 'MV OCEAN TRADER', dwt: 11500, cargoQty: 10000 });
  assert.match(htmlCustom, /VESSEL\s*:\s*MV OCEAN TRADER - ABT 11,500 MT DWT FULLY GEARED WITH/, 'Captures real vessel name and formatted DWT with thousands separator');

  // 2. Fallback to MV TBN when vessel name is empty
  const htmlBlank = evalFn({ vesselName: '   ', dwt: 25000 });
  assert.match(htmlBlank, /VESSEL\s*:\s*MV TBN - ABT 25,000 MT DWT FULLY GEARED WITH/, 'Falls back to MV TBN when vessel name is blank');

  // 3. Fallback when vesselName is undefined
  const htmlUndefined = evalFn({ dwt: 50000 });
  assert.match(htmlUndefined, /VESSEL\s*:\s*MV TBN - ABT 50,000 MT DWT FULLY GEARED WITH/, 'Falls back to MV TBN when vesselName is missing');
});

test('buildFixtureRecapHTMLTemplate and buildAuditHTMLTemplate handle undefined and incomplete state properties safely without throwing TypeError', () => {
  const startIdxRecap = indexHtml.indexOf('function buildFixtureRecapHTMLTemplate(state)');
  const endIdxRecap = indexHtml.indexOf('window.buildFixtureRecapHTMLTemplate = buildFixtureRecapHTMLTemplate;', startIdxRecap);
  const fnSourceRecap = indexHtml.slice(startIdxRecap, endIdxRecap);
  const evalFnRecap = new Function('state', `${fnSourceRecap}; return buildFixtureRecapHTMLTemplate(state);`);

  const startIdxAudit = indexHtml.indexOf('function buildAuditHTMLTemplate(state)');
  const endIdxAudit = indexHtml.indexOf('window.buildAuditHTMLTemplate = buildAuditHTMLTemplate;', startIdxAudit);
  const fnSourceAudit = indexHtml.slice(startIdxAudit, endIdxAudit);
  const evalFnAudit = new Function('state', `${fnSourceAudit}; return buildAuditHTMLTemplate(state);`);

  // Test with completely empty object
  assert.doesNotThrow(() => {
    const htmlRecap = evalFnRecap({});
    assert.match(htmlRecap, /TBA/, 'Empty state should fall back to TBA in Recap');
  }, 'Recap with empty object must not throw');

  assert.doesNotThrow(() => {
    const htmlAudit = evalFnAudit({});
    assert.match(htmlAudit, /Rotterdam/, 'Empty state should fall back to default values in Audit');
  }, 'Audit with empty object must not throw');

  // Test with state containing undefined properties
  const incompleteState = {
    pol: undefined,
    pod: undefined,
    vesselName: undefined,
    commodity: undefined,
    cargoQty: undefined,
    fleteEstimado: undefined
  };

  assert.doesNotThrow(() => {
    const htmlRecap = evalFnRecap(incompleteState);
    assert.match(htmlRecap, /TBA/, 'Incomplete state with undefined props should fall back to TBA in Recap');
  }, 'Recap with undefined properties must not throw TypeError');

  assert.doesNotThrow(() => {
    const htmlAudit = evalFnAudit(incompleteState);
    assert.match(htmlAudit, /Rotterdam/, 'Incomplete state with undefined props should fall back to defaults in Audit');
  }, 'Audit with undefined properties must not throw TypeError');
});

