import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. "Generar Reporte Ejecutivo" button has explicit onClick, type="button", pointer-events-auto and defensive open handler', () => {
  // Check activeReport state declaration
  assert.match(
    forwarderSource,
    /const\s+\[activeReport,\s*setActiveReport\]\s*=\s*useState\(null\);/,
    'ForwarderWorkspace must formally declare activeReport state hook with useState(null)'
  );

  // Check button markup
  const btnGenMatch = forwarderSource.match(/<button[\s\S]*?id="btn-generate-executive-report"[\s\S]*?>[\s\S]*?Generar Reporte Ejecutivo[\s\S]*?<\/button>/);
  assert.ok(btnGenMatch, 'btn-generate-executive-report must be present');
  assert.match(btnGenMatch[0], /type="button"/, 'Must explicitly set type="button" to prevent unwanted form submissions');
  assert.match(btnGenMatch[0], /handleOpenExecutiveReport/, 'Must invoke handleOpenExecutiveReport');
  assert.match(btnGenMatch[0], /setShowExecutiveReport\(true\)/, 'Must set showExecutiveReport to true');
  assert.match(btnGenMatch[0], /cursor-pointer/, 'Must have cursor-pointer class');

  // Check parent container for pointer-events and z-index
  const parentContainerMatch = forwarderSource.match(/<div\s+className="flex\s+gap-3\s+relative\s+z-10\s+pointer-events-auto">/);
  assert.ok(parentContainerMatch, 'Buttons container must have relative z-10 pointer-events-auto');

  // Check defensive try/catch in handleOpenExecutiveReport
  assert.match(
    forwarderSource,
    /const\s+handleOpenExecutiveReport\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?try\s*\{[\s\S]*?setActiveReport\(data\);[\s\S]*?setReportData\(data\);[\s\S]*?setShowExecutiveReport\(true\);[\s\S]*?\}\s*catch/,
    'handleOpenExecutiveReport must be wrapped in try/catch and invoke setActiveReport(data) before opening modal'
  );
});

test('2. "Guardar Flete y Estiba en Proyecto" button has explicit onClick, type="button", pointer-events-auto and defensive try/catch/finally', () => {
  // Check button markup
  const btnSaveMatch = forwarderSource.match(/<button[\s\S]*?Guardar Flete y Estiba en Proyecto[\s\S]*?<\/button>/);
  assert.ok(btnSaveMatch, 'Guardar Flete y Estiba en Proyecto button must exist');
  assert.match(btnSaveMatch[0], /type="button"/, 'Must explicitly set type="button"');
  assert.match(btnSaveMatch[0], /handleSaveProjectCargo/, 'Must invoke handleSaveProjectCargo on click');
  assert.match(btnSaveMatch[0], /cursor-pointer/, 'Must have cursor-pointer class');

  // Check defensive handling in handleSaveProjectCargo
  assert.match(
    forwarderSource,
    /const\s+handleSaveProjectCargo\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?try\s*\{[\s\S]*?\}\s*catch[\s\S]*?finally\s*\{[\s\S]*?setCargoItems\(\[\]\);[\s\S]*?setIsCargoModalOpen\(false\);[\s\S]*?setSaveSuccessMessage\(/,
    'handleSaveProjectCargo must have try/catch/finally block to guarantee modal close and visual feedback'
  );

  // Check visual feedback banner
  assert.match(
    forwarderSource,
    /\{saveSuccessMessage\s*&&/,
    'Must render visual feedback banner when saveSuccessMessage is set'
  );
});

test('3. Modal container uses pointer-events-auto and does not block interaction', () => {
  // Project Cargo Builder modal must have backdrop and clean interactive container
  assert.match(
    forwarderSource,
    /isCargoModalOpen\s*&&\s*!showExecutiveReport\s*&&\s*\(/,
    'Modal must render when isCargoModalOpen is true and showExecutiveReport is false'
  );
  assert.doesNotMatch(
    forwarderSource,
    /pointer-events-none[\s\S]*?btn-generate-executive-report/,
    'Button must not be covered or affected by pointer-events-none'
  );
});
