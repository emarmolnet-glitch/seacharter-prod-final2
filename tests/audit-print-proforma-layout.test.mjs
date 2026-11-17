import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [indexSource, auditSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/ai-legal-audit.ts", import.meta.url), "utf8"),
]);

test("expanded layout: #resultsContent uses w-full max-w-none and #view-auditor has 26-28% / 72-74% split", () => {
  // #resultsContent sin max-w-4xl, con w-full max-w-none
  assert.match(indexSource, /id="resultsContent"[^>]*w-full max-w-none/);
  assert.doesNotMatch(indexSource, /id="resultsContent"[^>]*max-w-4xl/);

  // Panel izquierdo de entrada (28% en md, 26% en lg)
  assert.match(indexSource, /md:w-\[28%\]\s+lg:w-\[26%\]/);

  // Panel derecho de resultados (72% en md, 74% en lg)
  assert.match(indexSource, /audit-results-panel[^>]*md:w-\[72%\]\s+lg:w-\[74%\]/);
});

test("renderComparativaClausulasHtml renders full-width horizontal reading cards with separated severity badge", () => {
  // Extraer función de index.html
  const fnMatch = indexSource.match(/function renderComparativaClausulasHtml\(comparativaArray\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*window\.renderComparativaClausulasHtml/);
  assert.ok(fnMatch, "renderComparativaClausulasHtml debe existir en index.html");

  const escapeHtml = (str) => String(str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  const renderComparativaClausulasHtml = new Function("comparativaArray", "escapeHtml", `
    const fn = function(comparativaArray) { ${fnMatch[1]} };
    return fn(comparativaArray);
  `);

  const sampleClauses = [
    {
      clausula: "CLAUSE 2 PRODUCT, QUANTITY, PRICE, QUALITY",
      estandar: "Tolerancia estándar del +/- 5% a opción del fletador / comprador.",
      desviacion: "Cláusula contractual otorga opción unilateral de volumen mensual al vendedor.",
      impacto_armador: "Riesgo de capacidad ociosa si no se avisa con 30 días.",
      impacto_fletador: "Incertidumbre en la planificación del aprovisionamiento.",
      riesgo: "ALTO. La flexibilidad en la cantidad mensual no define quién nomina la tolerancia final.",
      cambio_solicitado: "Fijar margen de tolerancia +/- 5% siempre bajo mutuo acuerdo o nominado por comprador."
    }
  ];

  const html = renderComparativaClausulasHtml(sampleClauses, escapeHtml);

  // Debe contener la tarjeta de cláusula
  assert.match(html, /class="audit-clause-card bg-white rounded-lg border border-slate-200 p-3\.5 space-y-3 shadow-2xs"/);

  // Cabecera: Nombre de cláusula en negrita
  assert.match(html, /CLAUSE 2 PRODUCT, QUANTITY, PRICE, QUALITY/);

  // Badge: SOLO debe contener la palabra de severidad 'ALTO', NUNCA la explicación
  assert.match(html, /<span class="px-2 py-0\.5 text-\[10px\] font-bold rounded border uppercase tracking-wider shrink-0 bg-rose-100 text-rose-800 border-rose-200">ALTO<\/span>/);
  assert.doesNotMatch(html, /<span[^>]*>[^<]*flexibilidad[^<]*<\/span>/);

  // La explicación de riesgo debe ir en Bloque B como texto normal
  assert.match(html, /Detalle de Severidad:<\/span>\s*La flexibilidad en la cantidad mensual no define quién nomina la tolerancia final\./);

  // Fila 1: Grid de 2 bloques (Estándar y Desviación)
  assert.match(html, /grid grid-cols-1 md:grid-cols-2 gap-3 text-xs/);
  assert.match(html, /Estándar de Mercado/);
  assert.match(html, /Desviación Detectada en Contrato/);

  // Fila 2: Impacto Operativo y Comercial
  assert.match(html, /Impacto Operativo y Comercial/);
  assert.match(html, /Vendedor \/ Armador \(Seller \/ Owner\):/);
  assert.match(html, /Comprador \/ Fletador \(Buyer \/ Charterer\):/);

  // Fila 3: Cambio Solicitado / Acción Correctiva destacada
  assert.match(html, /bg-teal-50\/80 border-l-4 border-teal-600 p-2\.5 rounded-r/);
  assert.match(html, /Cambio Solicitado \/ Acción Correctiva:/);
  assert.match(html, /Fijar margen de tolerancia \+\/- 5% siempre bajo mutuo acuerdo/);
});

test("@media print defines avoid-break and 8px border-radius styling for audit-clause-card", () => {
  assert.match(indexSource, /#print-audit-proforma \.audit-clause-card,\s*#resultsContent \.audit-clause-card\s*\{[^}]*break-inside:\s*avoid\s*!important/);
  assert.match(indexSource, /#print-audit-proforma \.audit-clause-card,\s*#resultsContent \.audit-clause-card\s*\{[^}]*page-break-inside:\s*avoid\s*!important/);
  assert.match(indexSource, /#print-audit-proforma \.audit-clause-card,\s*#resultsContent \.audit-clause-card\s*\{[^}]*border:\s*1px solid #cbd5e1\s*!important/);
  assert.match(indexSource, /#print-audit-proforma \.audit-clause-card,\s*#resultsContent \.audit-clause-card\s*\{[^}]*border-radius:\s*8px\s*!important/);
  assert.match(indexSource, /#print-audit-proforma \.audit-clause-card,\s*#resultsContent \.audit-clause-card\s*\{[^}]*padding:\s*12px\s*!important/);
});

test("formatEstrategiaStructuredPoints splits numbered inline paragraphs into independent horizontal blocks", () => {
  const fnMatch = indexSource.match(/function formatEstrategiaStructuredPoints\(text\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*window\.formatEstrategiaStructuredPoints/);
  assert.ok(fnMatch, "formatEstrategiaStructuredPoints debe existir en index.html");

  const formatMarkdownBold = (s) => s.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-800">$1</strong>');
  const formatEstrategiaStructuredPoints = new Function("text", "formatMarkdownBold", `
    const fn = function(text) { ${fnMatch[1]} };
    return fn(text);
  `);

  const denseStrategy =
    "Objetivo comercial: Proteger el margen del fletamento minimizando contingencias. 1. Negociar la cláusula de demurrage reduciendo el preaviso a 6 horas. 2. Exigir carta de crédito confirmada e irrevocable antes de cargar. 3. Limitar la responsabilidad por huelga a eventos de fuerza mayor comprobables. 4. Fijar sumisión expresa a la LMAA de Londres.";

  const html = formatEstrategiaStructuredPoints(denseStrategy, formatMarkdownBold);

  assert.match(html, /^<div class="space-y-2 not-italic">/);

  // Debe tener bloque introductorio para el objetivo
  assert.match(html, /bg-teal-50\/70/);
  assert.match(html, /Objetivo comercial: Proteger el margen del fletamento/);

  // Debe tener bloques numerados del 1 al 4
  assert.match(html, /<span[^>]*>1<\/span>/);
  assert.match(html, /Negociar la cláusula de demurrage reduciendo el preaviso/);
  assert.match(html, /<span[^>]*>2<\/span>/);
  assert.match(html, /Exigir carta de crédito confirmada e irrevocable/);
  assert.match(html, /<span[^>]*>3<\/span>/);
  assert.match(html, /Limitar la responsabilidad por huelga/);
  assert.match(html, /<span[^>]*>4<\/span>/);
  assert.match(html, /Fijar sumisión expresa a la LMAA de Londres/);
});

test("formatProformaStructuredPoints splits dense text into bullet points ending with semicolons and last with period", () => {
  const fnMatch = indexSource.match(/function formatProformaStructuredPoints\(text\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*window\.formatProformaStructuredPoints/);
  assert.ok(fnMatch, "formatProformaStructuredPoints debe existir en index.html");

  const formatProformaStructuredPoints = new Function("text", fnMatch[1]);

  const denseText =
    "Este Sales & Purchase Agreement (SPA) entre SARL TECH y JURY S.A. establece la compraventa de 42,5 TM de urea a granel; la entrega se pacta bajo Incoterm CIF Valencia con pago mediante Carta de Crédito irrevocable confirmada. Se detecta ambigüedad en el Art. 12 sobre penalizaciones de 12.500 USD/día; la jurisdicción pactada somete el litigio a arbitraje en Londres bajo ley inglesa.";

  const html = formatProformaStructuredPoints(denseText);

  assert.match(html, /^<ul class="space-y-1\.5 list-disc pl-5 text-xs text-slate-700 leading-relaxed">/);
  assert.match(html, /<\/ul>$/);
  assert.match(html, /JURY S\.A\./);
  assert.match(html, /42,5 TM/);
  assert.match(html, /Art\. 12/);

  const liMatches = [...html.matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]);
  assert.ok(liMatches.length >= 4, `Debe tener al menos 4 puntos, tiene ${liMatches.length}`);

  for (let i = 0; i < liMatches.length - 1; i++) {
    assert.ok(liMatches[i].endsWith(";"), `Punto ${i + 1} debe terminar en ';': ${liMatches[i]}`);
  }

  const lastLi = liMatches[liMatches.length - 1];
  assert.ok(lastLi.endsWith("."), `El último punto debe terminar en '.': ${lastLi}`);
});

test("ai-legal-audit.ts instructs Gemini in Stage 1 metadata_proforma to format proforma in structured points with semicolons", () => {
  assert.match(
    auditSource,
    /proforma: Dictamen ejecutivo y comercial preliminar del contrato redactado de forma estructurada en puntos separados por punto y coma \(;\) y saltos de línea para máxima legibilidad ejecutiva/
  );
});
