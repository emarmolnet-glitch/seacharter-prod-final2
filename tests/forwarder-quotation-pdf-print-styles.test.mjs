import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. Executive Report PDF has size A4 portrait defined in print CSS rules', () => {
  assert.match(forwarderSource, /@page\s*\{\s*size:\s*A4\s+portrait;\s*margin:\s*0;\s*\}/);
  assert.match(forwarderSource, /#printable-a4-sheet/);
});

test('2. Action controls and overlay elements have print:hidden', () => {
  assert.match(forwarderSource, /fixed\s+bottom-6\s+(?:left-8|right-8)\s+flex\s+(?:items-center\s+)?gap-4\s+z-\[9999\]\s+print:hidden/);
  assert.match(forwarderSource, /\.print-hidden/);
  assert.match(forwarderSource, /print(?::|\\\\:)hidden/);
});

test('3. CSS print rules include break-inside-avoid with browser print compatibility', () => {
  assert.match(forwarderSource, /\.break-inside-avoid,\s*\[class\*="break-inside-avoid"\]\s*\{\s*break-inside:\s*avoid\s*!important;\s*page-break-inside:\s*avoid\s*!important;\s*\}/);
});

test('4. Report sections have break-inside-avoid class applied', () => {
  // Header
  assert.match(forwarderSource, /<header[^>]*break-inside-avoid/);
  // Operational summary
  assert.match(forwarderSource, /Resumen Operativo[\s\S]*?break-inside-avoid/);
  // Financial breakdown
  assert.match(forwarderSource, /Desglose Financiero Separado[\s\S]*?break-inside-avoid/);
  // Subtotals
  assert.match(forwarderSource, /Subtotal Flete Marítimo[\s\S]*?break-inside-avoid/);
  // Total client price
  assert.match(forwarderSource, /PRECIO TOTAL DE VENTA AL CLIENTE[\s\S]*?break-inside-avoid/);
  // Signatures
  assert.match(forwarderSource, /Firma Transitario[\s\S]*?break-inside-avoid/);
});

test('5. Dynamic header outputs emission date, project reference, client, and commercial scenario', () => {
  assert.match(forwarderSource, /Fecha de Emisión:/);
  assert.match(forwarderSource, /new Date\(\)\.toLocaleDateString\('es-ES'\)/);
  assert.match(forwarderSource, /Referencia del Proyecto:/);
  assert.match(forwarderSource, /activeProject\?\.project_ref/);
  assert.match(forwarderSource, /Cliente:/);
  assert.match(forwarderSource, /activeProject\?\.client_name/);
  assert.match(forwarderSource, /Modalidad Comercial Activa:/);
  assert.match(forwarderSource, /commercialScenario === 'target'/);
});
