import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const modalSource = await readFile(new URL('../src/components/VoyageExecutiveReportModal.jsx', import.meta.url), 'utf8');

test('1. Desglose detallado de costes en executive-cost-structure-column', () => {
  assert.match(modalSource, /id="executive-cost-structure-column"/);
  assert.match(modalSource, /Combustible \(Bunkers\):[\s\S]*?\$\{costBunkers\.toLocaleString/);
  assert.match(modalSource, /Costo Operativo \(OPEX\):[\s\S]*?\$\{costOpex\.toLocaleString/);
  assert.match(modalSource, /Tasas \/ Gastos \(PDAs\):[\s\S]*?\$\{costPda\.toLocaleString/);
  assert.match(modalSource, /Costo ETS Estimado:[\s\S]*?\$\{costEts\.toLocaleString/);
  assert.match(modalSource, /Total Gastos Estimados:[\s\S]*?\$\{costTotal\.toLocaleString/);
});

test('2. Acordeones de fórmulas bajo VisualStowagePlan en executive-data-accordions condicionados por !isClientMode', () => {
  assert.match(modalSource, /id="executive-data-accordions"/);
  assert.match(modalSource, /\{!isClientMode\s*&&\s*\([\s\S]*?FÓRMULAS Y DESGLOSE DE CÁLCULO BREAK-EVEN[\s\S]*?Coste Total Operativo \/ TM = Break Even/);
  assert.match(modalSource, /\{!isClientMode\s*&&\s*\([\s\S]*?COSTOS DE COMBUSTIBLE[\s\S]*?Gasto Total en Bunkers/);
  assert.match(modalSource, /\{!isClientMode\s*&&\s*\([\s\S]*?CÁLCULOS OPEX Y CARACTERÍSTICAS BUQUE[\s\S]*?OPEX Diario Total/);
});

test('3. Estilos consistentes con Light Mode (bg-slate-50, border-slate-200, text-slate-600)', () => {
  assert.match(modalSource, /className="bg-slate-50 p-4 rounded-xl border border-slate-200"/);
  assert.match(modalSource, /className="text-slate-600"/);
});
