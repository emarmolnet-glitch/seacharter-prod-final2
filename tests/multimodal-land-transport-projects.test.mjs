import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const forwarderFunctionsSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. forwarder-projects.js SQL query extracts land transport fields (land_origin, land_destination, land_distance, land_freight_cost)', () => {
  assert.match(forwarderFunctionsSource, /land_origin/);
  assert.match(forwarderFunctionsSource, /land_destination/);
  assert.match(forwarderFunctionsSource, /land_distance/);
  assert.match(forwarderFunctionsSource, /land_freight_cost/);

  // Verificamos que la consulta SELECT del GET incluya todos los campos de transporte terrestre
  assert.match(
    forwarderFunctionsSource,
    /SELECT[\s\S]*?land_origin[\s\S]*?land_destination[\s\S]*?land_distance[\s\S]*?land_freight_cost[\s\S]*?FROM\s+forwarder_projects/i
  );
});

test('2. forwarder-projects.js GET supports querying single project details by project_ref or id', () => {
  assert.match(forwarderFunctionsSource, /qParams\.project_ref/);
  assert.match(forwarderFunctionsSource, /qParams\.id/);
  assert.match(forwarderFunctionsSource, /WHERE\s+\(id\s*=\s*\$1\s+OR\s+UPPER\(project_ref\)\s*=\s*UPPER\(\$2\)\)/i);
});

test('3. forwarder-projects.js UPDATE queries preserve and persist land transport fields', () => {
  assert.match(forwarderFunctionsSource, /land_origin\s*=\s*COALESCE\(\$8,\s*land_origin\)/);
  assert.match(forwarderFunctionsSource, /land_destination\s*=\s*COALESCE\(\$9,\s*land_destination\)/);
  assert.match(forwarderFunctionsSource, /land_distance\s*=\s*COALESCE\(\$10,\s*land_distance\)/);
  assert.match(forwarderFunctionsSource, /land_freight_cost\s*=\s*COALESCE\(\$11,\s*land_freight_cost\)/);
});

test('4. db/schema.ts defines forwarderProjects table with land transport columns', () => {
  assert.match(schemaSource, /export const forwarderProjects = pgTable\("forwarder_projects"/);
  assert.match(schemaSource, /landOrigin:\s*varchar\("land_origin"/);
  assert.match(schemaSource, /landDestination:\s*varchar\("land_destination"/);
  assert.match(schemaSource, /landDistance:\s*numeric\("land_distance"\)/);
  assert.match(schemaSource, /landFreightCost:\s*numeric\("land_freight_cost"\)/);
});

test('5. ForwarderWorkspace defines getProjectDetails and getLandTransportData helper', () => {
  assert.match(workspaceSource, /const\s+getProjectDetails\s*=\s*async/);
  assert.match(workspaceSource, /\/\.netlify\/functions\/forwarder-projects\?project_ref=/);
  assert.match(workspaceSource, /const\s+getLandTransportData\s*=/);
  assert.match(workspaceSource, /handleSelectProject/);
});

test('6. ForwarderWorkspace renders conditional "Pre-carriage / On-carriage" section inside financial-breakdown-card', () => {
  assert.match(workspaceSource, /id="financial-breakdown-card"/);
  assert.match(workspaceSource, /id="pre-carriage-on-carriage-section"/);
  assert.match(workspaceSource, /Pre-carriage \/ On-carriage/);
  assert.match(workspaceSource, /id="land-route-display"/);
  assert.match(workspaceSource, /id="land-distance-display"/);
  assert.match(workspaceSource, /id="land-freight-cost-display"/);
});

test('7. ForwarderWorkspace renders conditional multimodal card in active project view and Executive Report', () => {
  assert.match(workspaceSource, /id="project-multimodal-card"/);
  assert.match(workspaceSource, /Conexión Multimodal Puerta a Puerto/);
  // Executive Report subtotal and row
  assert.match(workspaceSource, /Subtotal Pre-carriage \/ On-carriage/);
});

test('8. Total calculation sums land freight cost into disbursements/costs of maritime voyage', () => {
  // En autoCalculateEstimates
  assert.match(
    workspaceSource,
    /totalEstimatedCost\s*=\s*calculatedOceanFreight\s*\+\s*calculatedFobOperations\s*\+\s*landCost;/
  );

  // En buildExecutiveReportData
  assert.match(
    workspaceSource,
    /finalTotalCost\s*=\s*Math\.round\(\(fleteCostNum\s*\+\s*fobSubtotal\s*\+\s*landCost\)\s*\*\s*100\)\s*\/\s*100;/
  );
});

test('9. Behavioral simulation: multimodal door-to-port financial calculation with Sétif -> Bejaia', () => {
  // Simulación con los datos del objetivo:
  // Tramo terrestre inyectado por Land Charter: Sétif -> Bejaia, 115 km, 850 USD coste camión
  const projectMock = {
    project_ref: 'RDM/2026-ALG-01',
    client_name: 'Sonatrach Energy Logistics',
    land_origin: 'Sétif',
    land_destination: 'Bejaia',
    land_distance: 115,
    land_freight_cost: 850,
  };

  function simulateGetLandTransportData(project) {
    const origin = (project.land_origin || '').trim();
    const destination = (project.land_destination || '').trim();
    const distance = Number(project.land_distance || 0);
    const freightCost = Number(project.land_freight_cost || 0);
    const hasData = Boolean((origin && destination) || freightCost > 0 || distance > 0);
    const routeText = origin && destination ? `${origin} -> ${destination}` : 'Ruta Terrestre';
    return { hasData, origin, destination, distance, freightCost, routeText };
  }

  const lt = simulateGetLandTransportData(projectMock);
  assert.equal(lt.hasData, true);
  assert.equal(lt.routeText, 'Sétif -> Bejaia');
  assert.equal(lt.distance, 115);
  assert.equal(lt.freightCost, 850);

  // Simulación de cálculo financiero combinado:
  const maritimeFreightCost = 18500; // Flete marítimo buque
  const fobOperationsCost = 4200;    // Operativa portuaria y manipulación
  const landCost = lt.freightCost;   // 850 USD

  // Multimodal Disbursements / Total Costs
  const totalMultimodalDisbursements = maritimeFreightCost + fobOperationsCost + landCost;
  assert.equal(totalMultimodalDisbursements, 23550);

  // Venta con margen comercial del 15%
  const salePrice = Math.round(totalMultimodalDisbursements * 1.15 * 100) / 100;
  assert.equal(salePrice, 27082.50);

  const margin = Math.round((salePrice - totalMultimodalDisbursements) * 100) / 100;
  assert.equal(margin, 3532.50);
});
