import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. Core PRO UI is 100% maritime: project-multimodal-card (truck UI) is purged from active project view', () => {
  assert.doesNotMatch(
    workspaceSource,
    /id="project-multimodal-card"/,
    'project-multimodal-card must be purged from Core PRO'
  );
  assert.doesNotMatch(
    workspaceSource,
    /Inyectado por Land Charter Core PRO/,
    'Land Charter injection notice must be purged from Core PRO'
  );
});

test('2. Core PRO UI is 100% maritime: pre-carriage-on-carriage-section is purged from financial breakdown', () => {
  assert.doesNotMatch(
    workspaceSource,
    /id="pre-carriage-on-carriage-section"/,
    'pre-carriage-on-carriage-section must be purged from Core PRO'
  );
  assert.doesNotMatch(
    workspaceSource,
    /Modalidad:\s*Transporte Terrestre por Camión/,
    'Truck transport modality section must be purged from Core PRO'
  );
});

test('3. Core PRO UI is 100% maritime: Executive Report omits multimodal truck row and subtotal', () => {
  assert.doesNotMatch(
    workspaceSource,
    /Subtotal Pre-carriage \/ On-carriage/,
    'Subtotal Pre-carriage / On-carriage must be purged from Executive Report'
  );
  assert.doesNotMatch(
    workspaceSource,
    /Transporte terrestre por camión/,
    'Transporte terrestre por camión row must be purged from Executive Report table'
  );
  assert.match(
    workspaceSource,
    /<div className="grid grid-cols-2 gap-4 mb-6">/,
    'Executive Report subtotals grid must be 2 columns (Flete Marítimo and FOB/Operativa Portuaria)'
  );
});

test('4. Core PRO UI is 100% maritime: renders project-maritime-route-card with nautical parameters', () => {
  assert.match(
    workspaceSource,
    /id="project-maritime-route-card"/,
    'Maritime route card must remain the core view for route parameters'
  );
  assert.match(
    workspaceSource,
    /Ruta Marítima, Ritmos Operativos y Gestión de Demoras/,
    'Maritime title must be present'
  );
});

test('5. Financial stability fix: landCost is safely scoped in autoCalculateEstimates preventing ReferenceError', () => {
  const functionBodyMatch = workspaceSource.match(
    /const autoCalculateEstimates = \([\s\S]*?setIsUnder40t\(isUnderThreshold\);([\s\S]*?)if \(isUnderThreshold\)/
  );
  assert.ok(functionBodyMatch, 'autoCalculateEstimates must declare landCost before isUnderThreshold check');
  assert.match(
    functionBodyMatch[1],
    /const\s+landCost\s*=\s*Number\(activeProject\?\.land_freight_cost\s*\?\?\s*activeProject\?\.landFreightCost\s*\?\?\s*0\)\s*\|\|\s*0;/,
    'landCost must have safe number fallback'
  );
  assert.match(
    workspaceSource,
    /totalEstimatedCost\s*=\s*calculatedOceanFreight\s*\+\s*calculatedFobOperations\s*\+\s*landCost;/,
    'totalEstimatedCost must calculate without ReferenceError'
  );
});

test('6. DataBridge maritime freights sync: Flete Compra Armador and Flete Venta Fletador remain preserved', () => {
  assert.match(workspaceSource, /Flete Sugerido Armador \(Compra\)/);
  assert.match(workspaceSource, /Flete Sugerido Fletador \(Venta\)/);
  assert.match(workspaceSource, /id="btn-sync-databridge-project-header"/);
  assert.match(workspaceSource, /manualFleteVentaUnit/);
  assert.match(workspaceSource, /manualFleteCompraUnit/);
});

test('7. App.jsx routing remains 100% maritime without truck or land calculators', () => {
  assert.doesNotMatch(appSource, /LDM|camion|road-routing|land-charter/i);
  assert.match(appSource, /FORWARDERS|PROYECTOS/);
  assert.match(appSource, /MAP|CALCULATOR/);
});
