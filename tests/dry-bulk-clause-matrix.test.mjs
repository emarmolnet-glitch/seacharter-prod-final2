import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRY_BULK_CLAUSE_MATRIX,
  resolveBulkCategory,
  resolveCommercialRole,
  getDynamicClauseTitle,
  getStipulatedClauses,
  renderStipulatedClausesHtml
} from '../src/dry-bulk-clause-matrix.mjs';

test('1. DRY_BULK_CLAUSE_MATRIX contiene todas las categorías clave y estructura bidireccional (owner_terms / charterer_terms)', () => {
  const expectedCategories = [
    'cemento_clinker_minerales',
    'granos_cereales_agri',
    'siderurgico_metales',
    'biomasa_combustibles',
    'fertilizantes_quimicos',
    'general_dry_bulk'
  ];

  expectedCategories.forEach((catKey) => {
    assert.ok(DRY_BULK_CLAUSE_MATRIX[catKey], `Debe existir la categoría ${catKey}`);
    assert.ok(Array.isArray(DRY_BULK_CLAUSE_MATRIX[catKey].owner_terms), `${catKey} debe tener owner_terms como array`);
    assert.ok(Array.isArray(DRY_BULK_CLAUSE_MATRIX[catKey].charterer_terms), `${catKey} debe tener charterer_terms como array`);
    assert.ok(DRY_BULK_CLAUSE_MATRIX[catKey].owner_terms.length >= 3, `${catKey}.owner_terms debe tener al menos 3 cláusulas`);
    assert.ok(DRY_BULK_CLAUSE_MATRIX[catKey].charterer_terms.length >= 3, `${catKey}.charterer_terms debe tener al menos 3 cláusulas`);
  });
});

test('2. Cemento / Clinker / Minerales contiene exactamente las cláusulas estipuladas de los requerimientos', () => {
  const cemento = DRY_BULK_CLAUSE_MATRIX.cemento_clinker_minerales;

  // Cláusulas Owner exactas
  assert.equal(
    cemento.owner_terms[0],
    "Charterers' stevedores to be considered as Owners' servants but Charterers remain fully responsible for any Stevedore Damage (including grab damage to tank top, ladders, and bulkheads)."
  );
  assert.equal(
    cemento.owner_terms[1],
    "Loading and discharging operations to be performed using Charterers' grabs. Any time lost due to grab malfunction to count as laytime."
  );
  assert.equal(
    cemento.owner_terms[2],
    "All dust pollution fines, washing, and cleaning costs of holds after discharge to be strictly for Charterers' account. Washing time to count as laytime."
  );

  // Cláusulas Charterer exactas
  assert.equal(
    cemento.charterer_terms[0],
    "Prior to NOR, holds must be presented completely clean, dry, free of loose rust scale, and fully swept (Grain Clean standard), subject to independent surveyor's approval."
  );
  assert.equal(
    cemento.charterer_terms[1],
    "Vessel's cranes/derricks to be fully operational at all times. Any time lost due to vessel's gear breakdown to be deducted from laytime."
  );
  assert.equal(
    cemento.charterer_terms[2],
    "Owners guarantee all hatch covers are fully watertight. Any cargo damage due to water ingress to be fully for Owners' account."
  );
});

test('3. resolveBulkCategory clasifica correctamente distintas formas de entrada de mercancía', () => {
  assert.equal(resolveBulkCategory('Cemento a granel'), 'cemento_clinker_minerales');
  assert.equal(resolveBulkCategory('Clínker'), 'cemento_clinker_minerales');
  assert.equal(resolveBulkCategory('Yeso'), 'cemento_clinker_minerales');
  assert.equal(resolveBulkCategory('Big Bags (Minerales/Cemento)'), 'cemento_clinker_minerales');
  assert.equal(resolveBulkCategory('10'), 'cemento_clinker_minerales');
  assert.equal(resolveBulkCategory({ cargoType: 'Minerales y Construcción' }), 'cemento_clinker_minerales');

  assert.equal(resolveBulkCategory('Trigo a granel'), 'granos_cereales_agri');
  assert.equal(resolveBulkCategory('Corn / Maíz'), 'granos_cereales_agri');
  assert.equal(resolveBulkCategory('Soja'), 'granos_cereales_agri');
  assert.equal(resolveBulkCategory('60'), 'granos_cereales_agri');

  assert.equal(resolveBulkCategory('Bobinas de Acero (Steel Coils)'), 'siderurgico_metales');
  assert.equal(resolveBulkCategory('Chatarra'), 'siderurgico_metales');
  assert.equal(resolveBulkCategory('20'), 'siderurgico_metales');

  assert.equal(resolveBulkCategory('Biomasa (Grignon, Astillas, Pellets)'), 'biomasa_combustibles');
  assert.equal(resolveBulkCategory('Carbón mineral'), 'biomasa_combustibles');

  assert.equal(resolveBulkCategory('Urea a granel'), 'fertilizantes_quimicos');
  assert.equal(resolveBulkCategory('30'), 'fertilizantes_quimicos');
});

test('4. resolveCommercialRole normaliza adecuadamente el rol activo (owner vs charterer)', () => {
  assert.equal(resolveCommercialRole('owner'), 'owner');
  assert.equal(resolveCommercialRole('OWN'), 'owner');
  assert.equal(resolveCommercialRole('armador'), 'owner');
  assert.equal(resolveCommercialRole('Shipowner'), 'owner');
  assert.equal(resolveCommercialRole({ commercialRole: 'owner' }), 'owner');

  assert.equal(resolveCommercialRole('charterer'), 'charterer');
  assert.equal(resolveCommercialRole('CHR'), 'charterer');
  assert.equal(resolveCommercialRole('fletador'), 'charterer');
  assert.equal(resolveCommercialRole('Charterers'), 'charterer');
  assert.equal(resolveCommercialRole({ commercialRole: 'charterer' }), 'charterer');

  // Fallback seguro a owner
  assert.equal(resolveCommercialRole(null), 'owner');
  assert.equal(resolveCommercialRole(undefined), 'owner');
});

test('5. getDynamicClauseTitle genera los títulos exactos según el rol comercial', () => {
  assert.equal(
    getDynamicClauseTitle('owner'),
    "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (OWNERS' TERMS)"
  );
  assert.equal(
    getDynamicClauseTitle('armador'),
    "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (OWNERS' TERMS)"
  );

  assert.equal(
    getDynamicClauseTitle('charterer'),
    "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (CHARTERERS' TERMS)"
  );
  assert.equal(
    getDynamicClauseTitle('fletador'),
    "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (CHARTERERS' TERMS)"
  );
});

test('6. getStipulatedClauses extrae la matriz correcta bidireccional', () => {
  const ownerResult = getStipulatedClauses('Cemento a granel', 'owner');
  assert.equal(ownerResult.title, "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (OWNERS' TERMS)");
  assert.equal(ownerResult.role, 'owner');
  assert.equal(ownerResult.category, 'cemento_clinker_minerales');
  assert.match(ownerResult.clauses[0], /Charterers' stevedores to be considered as Owners' servants/);

  const chartererResult = getStipulatedClauses('Cemento a granel', 'charterer');
  assert.equal(chartererResult.title, "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (CHARTERERS' TERMS)");
  assert.equal(chartererResult.role, 'charterer');
  assert.equal(chartererResult.category, 'cemento_clinker_minerales');
  assert.match(chartererResult.clauses[0], /Prior to NOR, holds must be presented completely clean/);

  // Verificación bidireccional para Granos
  const grainOwner = getStipulatedClauses('Trigo', 'owner');
  assert.match(grainOwner.clauses[1], /Fumigation/);
  const grainCharterer = getStipulatedClauses('Trigo', 'charterer');
  assert.match(grainCharterer.clauses[0], /grain-clean/);
});

test('7. renderStipulatedClausesHtml produce el HTML adecuado con lista de bullet points', () => {
  const html = renderStipulatedClausesHtml('Cemento', 'owner');
  assert.match(html, /id="print-stipulated-clauses-section"/);
  assert.match(html, /STIPULATED COMMERCIAL & OPERATIONAL CLAUSES \(OWNERS' TERMS\)/);
  assert.match(html, /<ul id="print-clauses-list"/);
  assert.match(html, /list-style-type:\s*disc/);
  assert.match(html, /<li[^>]*>Charterers' stevedores to be considered as Owners' servants/);
});

test('8. index.html integra la sección de cláusulas estipuladas en el PDF (#executive-report-print-view)', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Script tag incluido
  assert.match(indexSource, /<script type="module" src="\.\/src\/dry-bulk-clause-matrix\.js"><\/script>/);

  // Sección presente al final de la vista de impresión del informe ejecutivo
  assert.match(indexSource, /id="print-stipulated-clauses-section"/);
  assert.match(indexSource, /id="print-clauses-title"/);
  assert.match(indexSource, /id="print-clauses-list"/);

  // renderExecutiveReportPrintView contiene la lógica de inyección dinámica
  assert.match(indexSource, /printTitleEl\.innerText = clauseInfo\.title/);
  assert.match(indexSource, /printListEl\.innerHTML = clauseInfo\.clauses/);
  assert.match(indexSource, /STIPULATED COMMERCIAL & OPERATIONAL CLAUSES \(OWNERS' TERMS\)/);
  assert.match(indexSource, /STIPULATED COMMERCIAL & OPERATIONAL CLAUSES \(CHARTERERS' TERMS\)/);
});

test('9. VoyageExecutiveReportModal.jsx integra la sección de cláusulas estipuladas y reactividad de rol', async () => {
  const { readFile } = await import('node:fs/promises');
  const modalSource = await readFile(new URL('../src/components/VoyageExecutiveReportModal.jsx', import.meta.url), 'utf8');

  // Importación del módulo
  assert.match(modalSource, /import\s+\{\s*getStipulatedClauses\s*\}\s+from\s+['"]\.\.\/dry-bulk-clause-matrix\.mjs['"]/);

  // Cálculo de rol activo y cláusulas
  assert.match(modalSource, /activeRole/);
  assert.match(modalSource, /stipulatedClausesData/);

  // Sección y elementos en el render
  assert.match(modalSource, /id="executive-stipulated-clauses"/);
  assert.match(modalSource, /id="executive-clauses-title"/);
  assert.match(modalSource, /id="executive-clauses-list"/);
  assert.match(modalSource, /\{stipulatedClausesData\.title\}/);
  assert.match(modalSource, /\{stipulatedClausesData\.clauses\.map/);
});

test('10. Evaluación exhaustiva de todas las categorías de carga en modo Armador (OWN) y Fletador (CHR)', () => {
  const categories = [
    { input: 'Clínker', expectedCat: 'cemento_clinker_minerales' },
    { input: 'Cemento a granel', expectedCat: 'cemento_clinker_minerales' },
    { input: 'Minerales y Construcción', expectedCat: 'cemento_clinker_minerales' },
    { input: 'Trigo', expectedCat: 'granos_cereales_agri' },
    { input: 'Grano', expectedCat: 'granos_cereales_agri' },
    { input: 'Bobinas de Acero', expectedCat: 'siderurgico_metales' },
    { input: 'Biomasa', expectedCat: 'biomasa_combustibles' },
    { input: 'Fertilizantes', expectedCat: 'fertilizantes_quimicos' },
    { input: 'Granel General', expectedCat: 'general_dry_bulk' }
  ];

  categories.forEach(({ input, expectedCat }) => {
    // Modo Armador
    const own = getStipulatedClauses(input, 'owner');
    assert.equal(own.title, "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (OWNERS' TERMS)");
    assert.equal(own.category, expectedCat);
    assert.ok(own.clauses.length >= 3);

    // Modo Fletador
    const chr = getStipulatedClauses(input, 'charterer');
    assert.equal(chr.title, "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (CHARTERERS' TERMS)");
    assert.equal(chr.category, expectedCat);
    assert.ok(chr.clauses.length >= 3);
  });
});
