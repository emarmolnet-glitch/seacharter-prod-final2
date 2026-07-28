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
  assert.match(html, /VESSEL\s*:\s*MV GEARED BULKER/, 'Geared Vessel term');
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
