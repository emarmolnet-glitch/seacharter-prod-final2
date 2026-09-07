import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. ForwarderWorkspace defines showExecutiveReport state hook initialized to false', () => {
  assert.match(forwarderComponentSource, /const\s+\[showExecutiveReport,\s*setShowExecutiveReport\]\s*=\s*useState\(false\);/);
});

test('2. Modal footer includes secondary button "📄 Generar Reporte Ejecutivo" that sets showExecutiveReport to true', () => {
  const footerButtonMatch = forwarderComponentSource.match(/id="btn-generate-executive-report"[\s\S]*?>[\s\S]*?Generar Reporte Ejecutivo[\s\S]*?<\/button>/);
  assert.ok(footerButtonMatch, 'btn-generate-executive-report must exist with text "Generar Reporte Ejecutivo"');
  assert.match(footerButtonMatch[0], /setShowExecutiveReport\(true\)/);
  assert.match(footerButtonMatch[0], /📄/);
});

test('3. Executive Report view renders full-screen print-ready overlay when showExecutiveReport is true', () => {
  assert.match(forwarderComponentSource, /showExecutiveReport\s*&&\s*\(\(\)\s*=>/);
  assert.match(forwarderComponentSource, /fixed\s+inset-0\s+bg-white\s+(?:z-50|z-\[9000\])\s+overflow-y-auto/);
});

test('4. Centered A4 container is rendered with requested max-w-4xl mx-auto p-10 bg-white text-slate-900 classes', () => {
  assert.match(forwarderComponentSource, /max-w-4xl\s+mx-auto\s+p-10\s+bg-white\s+text-slate-900/);
});

test('5. Bottom-left floating controls contain "🖨️ Imprimir / Guardar Reporte" and "✖ Cerrar" with print:hidden', () => {
  const printButtonMatch = forwarderComponentSource.match(/id="btn-print-executive-report"[\s\S]*?>[\s\S]*?Imprimir\s*\/\s*(?:Guardar\s+)?(?:Reporte|PDF)[\s\S]*?<\/button>/);
  assert.ok(printButtonMatch, 'btn-print-executive-report must exist');
  assert.match(printButtonMatch[0], /window\.print\(\)/);
  assert.match(printButtonMatch[0], /🖨️/);

  const closeButtonMatch = forwarderComponentSource.match(/id="btn-close-executive-report"[\s\S]*?>[\s\S]*?Cerrar(?: Reporte)?[\s\S]*?<\/button>/);
  assert.ok(closeButtonMatch, 'btn-close-executive-report must exist');
  assert.match(closeButtonMatch[0], /setShowExecutiveReport\(false\)/);

  assert.match(forwarderComponentSource, /fixed\s+bottom-6\s+left-8\s+flex\s+(?:items-center\s+)?gap-4\s+z-\[(?:60|100|9999)\]\s+print:hidden/);
});

test('6. Header section includes forwarder branding, issue date, project_ref, and commercial title', () => {
  assert.match(forwarderComponentSource, /Universal Forwarding\s*\/\s*B2B Module/);
  assert.match(forwarderComponentSource, /Fecha de Emisión:/);
  assert.match(forwarderComponentSource, /Referencia del Proyecto:/);
  assert.match(forwarderComponentSource, /activeProject\?\.project_ref/);
  assert.match(forwarderComponentSource, /OFERTA COMERCIAL - PROJECT CARGO/);
});

test('7. Operational Summary panel renders bg-slate-50 p-4 with all 5 core operational totals', () => {
  assert.match(forwarderComponentSource, /bg-slate-50\s+p-4/);
  assert.match(forwarderComponentSource, /Resumen Operativo\s*\(Operational Summary\)/);
  assert.match(forwarderComponentSource, /Volumen Total/);
  assert.match(forwarderComponentSource, /Peso Total/);
  assert.match(forwarderComponentSource, /Revenue Tons \(RT\)/);
  assert.match(forwarderComponentSource, /Modalidad Operativa/);
  assert.match(forwarderComponentSource, /Buque Recomendado/);
});

test('8. Financial breakdown table uses border-collapse w-full and defines the 4 specified line item rows', () => {
  assert.match(forwarderComponentSource, /border-collapse\s+w-full/);
  // Column headers
  assert.match(forwarderComponentSource, /Concepto/);
  assert.match(forwarderComponentSource, /Descripción/);
  assert.match(forwarderComponentSource, /Coste \(€\)/);
  assert.match(forwarderComponentSource, /Venta \(€\)/);
  assert.match(forwarderComponentSource, /Margen/);

  // Row 1: Flete Marítimo (Base RT)
  assert.match(forwarderComponentSource, /Flete Marítimo \(Base RT\)/);
  // Row 2: Estiba y Trincaje (Cuadrillas, Trincadores)
  assert.match(forwarderComponentSource, /Estiba y Trincaje \(Cuadrillas, Trincadores\)/);
  // Row 3: Materiales Especiales (MAFIs, Heavy Lift, Cadenas, Dunnage)
  assert.match(forwarderComponentSource, /Materiales Especiales \(MAFIs, Heavy Lift, Cadenas, Dunnage\)/);
  // Row 4: Logística Periférica (Almacenaje Portuario, Surveyor, Transporte Inland, Mercancía)
  assert.match(forwarderComponentSource, /Logística Periférica \(Almacenaje Portuario, Surveyor, Transporte Inland, Mercancía\)/);
  assert.match(forwarderComponentSource, /activeReport\.preStackingDays/);
  assert.doesNotMatch(forwarderComponentSource, /Almacenaje muelle \(0 d\)/);
});

test('9. Standout highlight displays PRECIO TOTAL DE VENTA AL CLIENTE at table foot', () => {
  assert.match(forwarderComponentSource, /PRECIO TOTAL DE VENTA AL CLIENTE/);
});

test('10. Print styles ensure outer layout containers and modals are hidden during print', () => {
  // Sidebar has print:hidden
  assert.match(forwarderComponentSource, /<aside[^>]*print:hidden/);
  // Main canvas has print:hidden
  assert.match(forwarderComponentSource, /<main[^>]*print:hidden/);
  // Cargo builder modal has print:hidden
  assert.match(forwarderComponentSource, /isCargoModalOpen[\s\S]*?print:hidden/);
  // CSS print rules
  assert.match(forwarderComponentSource, /@media print/);
  assert.match(forwarderComponentSource, /print-color-adjust:\s*exact/);
});

test('11. Action controls in bottom-left corner allow exiting executive report view fluidly without trapping user', () => {
  // Container positioned at bottom-left
  assert.match(forwarderComponentSource, /fixed\s+bottom-6\s+left-8/);
  // Contains both close and print action buttons accessible to user
  assert.match(forwarderComponentSource, /id="btn-close-executive-report"[\s\S]*?onClick=\{\(\)\s*=>\s*setShowExecutiveReport\(false\)\}/);
  assert.match(forwarderComponentSource, /id="btn-print-executive-report"[\s\S]*?onClick=\{\(\)\s*=>\s*window\.print\(\)\}/);
  // Button labels match Cerrar and Imprimir / Guardar Reporte
  assert.match(forwarderComponentSource, /id="btn-close-executive-report"[\s\S]*?>[\s\S]*?Cerrar[\s\S]*?<\/button>/);
  assert.match(forwarderComponentSource, /id="btn-print-executive-report"[\s\S]*?>[\s\S]*?Imprimir\s*\/\s*Guardar\s+Reporte[\s\S]*?<\/button>/);
});
