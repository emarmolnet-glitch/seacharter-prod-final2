import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// El Fixture Recap renderiza cada dupla como <span> etiqueta (con los dos puntos ya
// concatenados) + <span> valor, por lo que las aserciones de contenido se validan
// sobre el texto plano del documento y no sobre el marcado.
const plainText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

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
  const startIdx = indexHtml.indexOf('function resolveFixtureRecapOperations(');
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
  const text = plainText(html);

  // Requirement 3 validations:
  assert.match(text, /RODAHMAR SHIPPING SL - FIRM FIXTURE RECAP \/ OFERTA COMERCIAL/, 'Recap title');
  assert.match(text, /VALIDITY\s*:\s*24 HOURS FROM ISSUANCE/, '24h validity statement');

  // 1. MAIN TERMS
  assert.match(text, /1\. MAIN TERMS/, 'Section 1 header');
  assert.match(text, /ACCT\s*:\s*CHARTERERS ACCOUNT/, 'ACCT term');
  assert.match(text, /OWNERS\s*:\s*RODAHMAR SHIPPING SL \(AS DISPONENT OWNERS\)/, 'OWNERS as Disponent Owners');
  assert.match(text, /VESSEL\s*:\s*MV GEARED BULKER - ABT 50,000 MT DWT FULLY GEARED WITH/, 'Geared Vessel term with DWT');
  assert.match(text, /CARGO\s*:\s*50,000 METRIC TONS/, 'Cargo quantity and commodity');
  assert.match(text, /POL\s*:\s*1 SAFE BERTH \/ 1 SAFE PORT ROTTERDAM/, 'POL term');
  assert.match(text, /POD\s*:\s*1 SAFE BERTH \/ 1 SAFE PORT HOUSTON/, 'POD term');

  // 2. FREIGHT & FINANCIALS
  assert.match(text, /2\. FREIGHT & FINANCIALS/, 'Section 2 header');
  assert.match(text, /FREIGHT RATE:\s*USD \$5\.00 PER METRIC TONNE/, 'Freight rate applying surcharges');
  assert.match(text, /TERMS\s*:\s*FIOS \(FREE IN AND OUT STOWED\)/, 'FIOS terms');

  // 3. LAYTIME & OPERATIONS
  assert.match(text, /3\. LAYTIME & OPERATIONS/, 'Section 3 header');
  assert.match(text, /LOADING RATE\s*:\s*5,000 METRIC TONS PER WEATHER WORKING DAY/, 'Load rate');
  assert.match(text, /DISDISCH RATE\s*:\s*MECHANICALLY LIMITED TO ~2,000 METRIC TONS/, 'Discharge rate limited to ~2,000 MT WWD SHINC');
  assert.match(text, /DEMURRAGE\s*:\s*USD 15,000 PER DAY/, 'Demurrage protection rate');

  // 4. SPECIAL CLAUSES
  assert.match(text, /4\. SPECIAL CLAUSES/, 'Section 4 header');
  assert.match(text, /GEAR CLAUSE/, 'Gear clause');
  assert.match(text, /WEATHER CLAUSE/, 'Weather clause');
  assert.match(text, /GENCON 1994/, 'GENCON 94 charterparty form');
});

test('buildFixtureRecapHTMLTemplate renders label-value pairs without a standalone colon cell', () => {
  const startIdx = indexHtml.indexOf('function resolveFixtureRecapOperations(');
  const endIdx = indexHtml.indexOf('window.buildFixtureRecapHTMLTemplate = buildFixtureRecapHTMLTemplate;', startIdx);
  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('state', `${fnSource}; return buildFixtureRecapHTMLTemplate(state);`);

  const html = evalFn({ pol: 'Rotterdam', pod: 'Houston', cargoQty: 50000, loadRate: 5000 });
  const markup = html.replace(/<style[\s\S]*?<\/style>/, '');

  // The colon belongs to the label string itself.
  assert.match(markup, /class="recap-field-label">VALIDITY:<\/span>/, 'VALIDITY label must carry its own colon');
  assert.match(markup, /class="recap-field-label">FREIGHT RATE:<\/span>/, 'FREIGHT RATE label must carry its own colon');
  assert.match(markup, /class="recap-field-label">TERMS:<\/span>/, 'TERMS label must carry its own colon');
  assert.match(markup, /class="recap-field-label">DEMURRAGE:<\/span>/, 'DEMURRAGE label must carry its own colon');

  // No dedicated element/column is used to paint the separator.
  assert.doesNotMatch(markup, /<(?:span|td|div)[^>]*>\s*:\s*<\/(?:span|td|div)>/, 'No element may exist only to render the colon');

  // Labels must not be padded with collapsing spaces before the colon (root cause of the overlap).
  assert.doesNotMatch(markup, /[A-Z] {2,}:/, 'Labels must not be aligned with runs of spaces');

  // Separation is delegated to CSS padding on the label column.
  assert.match(html, /\.recap-field-label\s*\{[^}]*padding-right:\s*12px/, 'Label column must reserve horizontal space via padding-right');
  assert.match(html, /\.recap-field-label\s*\{[^}]*width:\s*140px/, 'Label column must have a fixed width so pairs stay aligned');
});

test('buildFixtureRecapHTMLTemplate formats dynamic vessel name, DWT with thousands separator, and MV TBN fallback', () => {
  const startIdx = indexHtml.indexOf('function resolveFixtureRecapOperations(');
  const endIdx = indexHtml.indexOf('window.buildFixtureRecapHTMLTemplate = buildFixtureRecapHTMLTemplate;', startIdx);
  const fnSource = indexHtml.slice(startIdx, endIdx);
  const evalFn = new Function('state', `${fnSource}; return buildFixtureRecapHTMLTemplate(state);`);

  // 1. Dynamic vessel name and formatted DWT
  const htmlCustom = evalFn({ vesselName: 'MV OCEAN TRADER', dwt: 11500, cargoQty: 10000 });
  assert.match(plainText(htmlCustom), /VESSEL\s*:\s*MV OCEAN TRADER - ABT 11,500 MT DWT FULLY GEARED WITH/, 'Captures real vessel name and formatted DWT with thousands separator');

  // 2. Fallback to MV TBN when vessel name is empty
  const htmlBlank = evalFn({ vesselName: '   ', dwt: 25000 });
  assert.match(plainText(htmlBlank), /VESSEL\s*:\s*MV TBN - ABT 25,000 MT DWT FULLY GEARED WITH/, 'Falls back to MV TBN when vessel name is blank');

  // 3. Fallback when vesselName is undefined
  const htmlUndefined = evalFn({ dwt: 50000 });
  assert.match(plainText(htmlUndefined), /VESSEL\s*:\s*MV TBN - ABT 50,000 MT DWT FULLY GEARED WITH/, 'Falls back to MV TBN when vesselName is missing');
});

test('buildFixtureRecapHTMLTemplate and buildAuditHTMLTemplate handle undefined and incomplete state properties safely without throwing TypeError', () => {
  const startIdxRecap = indexHtml.indexOf('function resolveFixtureRecapOperations(');
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


const operationsSource = indexHtml.slice(
  indexHtml.indexOf('function resolveFixtureRecapOperations('),
  indexHtml.indexOf('function buildFixtureRecapHTMLTemplate(state)')
);
const recapSource = indexHtml.slice(
  indexHtml.indexOf('function buildFixtureRecapHTMLTemplate(state)'),
  indexHtml.indexOf('window.buildFixtureRecapHTMLTemplate =')
);
const renderRecap = new Function('state', `${operationsSource}\n${recapSource}\nreturn buildFixtureRecapHTMLTemplate(state);`);

for (const selection of [
  { productoEspecifico: 'Cemento a Granel' },
  { loadingMethod: 'Semirremolque Neumático' },
  { loadingMethod: 'bombas_neumaticas' },
  { methodPOL: { value: 'pneumatic', label: 'Pneumatic trailers' } }
]) {
  test(`pneumatic recap uses actual rates and compatible equipment: ${JSON.stringify(selection)}`, () => {
    const text = plainText(renderRecap({ ...selection, vesselName: 'MV GEARED BULKER', loadRate: 1110, dischargeRate: 5184 }));
    assert.match(text, /Pneumatic Cement Carrier/);
    assert.match(text, /LOADING RATE:\s*1,110 METRIC TONS/);
    assert.match(text, /DISDISCH RATE:\s*5,184 METRIC TONS/);
    assert.match(text, /AIR PRESSURE AND AIRTIGHT HOSES/);
    assert.match(text, /FREE OF ALL RISK AND EXPENSE TO CHARTERERS/);
    assert.doesNotMatch(text, /cranes?|grabs?|SWL|Geared|2,000/i);
  });
}

test('general cargo, minerals and bagged cement retain conventional equipment', () => {
  for (const productoEspecifico of ['Carga General', 'Minerales', 'Big Bags (Minerales/Cemento)', 'Cemento ensacado']) {
    const text = plainText(renderRecap({ productoEspecifico, loadRate: 3500 }));
    assert.match(text, /Geared Bulker/);
    assert.match(text, /SWL CRANES AND ELECTRIC GRABS/);
    assert.doesNotMatch(text, /PNEUMATIC CLAUSE/);
  }
});

test('pneumatic rates remain dynamic and missing rates are marked TBA', () => {
  const text = plainText(renderRecap({ productoEspecifico: 'Bulk cement', loadRate: 2345, dischargeRate: 6789 }));
  assert.match(text, /LOADING RATE:\s*2,345 METRIC TONS/);
  assert.match(text, /DISDISCH RATE:\s*6,789 METRIC TONS/);
  assert.match(plainText(renderRecap({ productoEspecifico: 'Cemento a granel' })), /DISDISCH RATE:\s*TBA/);
});

test('jsPDF fallback applies pneumatic equipment and rates without crane clauses', async () => {
  const source = indexHtml.slice(
    indexHtml.indexOf('async function generateFixtureRecapJsPDDFallback('),
    indexHtml.indexOf('window.generateFixtureRecapJsPDDFallback =')
  );
  const lines = [];
  const doc = { setFont() {}, setFontSize() {}, text(text) { lines.push(text); },
    splitTextToSize(text) { return [text]; }, addPage() {}, save() {} };
  const run = new Function('window', 'state', `${operationsSource}\n${source}\nreturn generateFixtureRecapJsPDDFallback(state, 'test.pdf');`);
  await run({ jsPDF: function () { return doc; } }, {
    loadingMethod: 'Semirremolque neumático', loadRate: 1110, dischargeRate: 5184,
    fleteEstimado: 50000, cargoQty: 1000
  });
  const text = lines.join(' ');
  assert.match(text, /Pneumatic Cement Carrier/);
  assert.match(text, /1,110 MT/);
  assert.match(text, /5,184 MT/);
  assert.match(text, /AIR PRESSURE AND AIRTIGHT HOSES/);
  assert.doesNotMatch(text, /cranes?|grabs?|SWL|Geared|2,000/i);
});
