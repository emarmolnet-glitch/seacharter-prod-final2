import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const moduleJs = readFileSync(new URL('../src/compatibilidad-module.js', import.meta.url), 'utf8');

test('Compatibilidad module transfers vessel object (Nombre, IMO, Propietario, DWT, Calado) on handleTriggerDueDiligence', () => {
  assert.match(moduleJs, /handleTriggerDueDiligence\(imo\)/, 'Must define handleTriggerDueDiligence');
  assert.match(moduleJs, /candidateVessel\s*=\s*\{/, 'Must build candidateVessel state payload');
  assert.match(moduleJs, /ownerManager|propietario|owner:/, 'Must map vessel owner/propietario');
  assert.match(moduleJs, /dwt:/, 'Must map vessel DWT');
  assert.match(moduleJs, /draft|draftMeters:/, 'Must map vessel draft/calado');
  assert.match(moduleJs, /window\.SeaCharterStore\.set/, 'Must persist to SeaCharterStore');
  assert.match(moduleJs, /window\.GlobalStore\.activeVessel\s*=/, 'Must update GlobalStore.activeVessel');
  assert.match(moduleJs, /window\.GlobalStore\.auditVessel\s*=/, 'Must update GlobalStore.auditVessel');
  assert.match(moduleJs, /window\.activeAuditVessel\s*=/, 'Must update activeAuditVessel');
  assert.match(moduleJs, /audit-vessel-inherited/, 'Must dispatch audit-vessel-inherited event');
  assert.match(moduleJs, /window\.switchTab\('auditor'\)/, 'Must navigate to auditor tab');
});

test('index.html contains audit-active-vessel-panel to display inherited vessel dossier instead of empty state', () => {
  assert.match(indexHtml, /id="audit-active-vessel-panel"/, 'Must contain audit-active-vessel-panel');
  assert.match(indexHtml, /id="audit-vessel-name-heading"/, 'Must contain vessel name heading');
  assert.match(indexHtml, /id="audit-vessel-owner"/, 'Must contain owner/propietario field');
  assert.match(indexHtml, /id="audit-vessel-dwt"/, 'Must contain DWT field');
  assert.match(indexHtml, /id="audit-vessel-draft"/, 'Must contain draft/calado field');
  assert.match(indexHtml, /id="audit-vessel-flag-year"/, 'Must contain flag and year field');
  assert.match(indexHtml, /id="audit-vessel-compat-score"/, 'Must contain compatibility score');
  assert.match(indexHtml, /function renderAuditorVesselDossier\(vessel\)/, 'Must implement renderAuditorVesselDossier');
  assert.match(indexHtml, /emptyState\.classList\.add\('hidden'\)/, 'Must hide empty state when vessel dossier is rendered');
});

test('index.html provides interactive button Consultar Datos Barco and Equasis lookup integration', () => {
  assert.match(indexHtml, /id="btn-consultar-datos-barco"/, 'Must have btn-consultar-datos-barco button');
  assert.match(indexHtml, /Consultar Datos Barco/, 'Button must be labeled Consultar Datos Barco');
  assert.match(indexHtml, /function openEquasisLookup\(imo\)/, 'Must implement openEquasisLookup');
  assert.match(indexHtml, /https:\/\/www\.equasis\.org\/EquasisWeb\/public\/HomePage\?fs=CompanyInfo/, 'Must reference Equasis search URL');
  assert.match(indexHtml, /P_IMO=/, 'Must include IMO parameter in Equasis URL lookup');
});

test('switchTab renders inherited vessel dossier when switching to auditor tab', () => {
  const switchStart = indexHtml.indexOf('function switchTab(tabId)');
  const switchEnd = indexHtml.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = indexHtml.slice(switchStart, switchEnd);

  assert.match(switchSource, /tabId === 'auditor'/, 'switchTab must handle auditor tab');
  assert.match(switchSource, /renderAuditorVesselDossier\(inheritedVessel\)/, 'switchTab must trigger renderAuditorVesselDossier for inherited vessel');
});

test('Audit active vessel card header enforces high-contrast white titles and clear subtitles', () => {
  const compatCss = readFileSync(new URL('../compatibilidad.css', import.meta.url), 'utf8');

  // Verify CSS classes exist in HTML
  assert.match(indexHtml, /class="[^"]*audit-vessel-header[^"]*"/, 'Header must have audit-vessel-header class');
  assert.match(indexHtml, /class="[^"]*audit-vessel-title[^"]*"/, 'Title must have audit-vessel-title class');
  assert.match(indexHtml, /class="[^"]*audit-vessel-subtitle[^"]*"/, 'Subtitle must have audit-vessel-subtitle class');
  assert.match(indexHtml, /class="[^"]*audit-vessel-origin[^"]*"/, 'Origin label must have audit-vessel-origin class');
  assert.match(indexHtml, /class="[^"]*audit-vessel-badge[^"]*"/, 'Badge must have audit-vessel-badge class');

  // Verify high contrast CSS rules in index.html and compatibilidad.css
  assert.match(indexHtml, /#audit-active-vessel-panel .audit-vessel-header h3[\s\S]*color:\s*#FFFFFF\s*!important/, 'Title in index.html must be white (#FFFFFF !important)');
  assert.match(indexHtml, /#audit-active-vessel-panel .audit-vessel-header p[\s\S]*color:\s*#BAE6FD\s*!important/, 'Subtitle in index.html must be light sky blue (#BAE6FD !important)');
  assert.match(compatCss, /#audit-active-vessel-panel \.audit-vessel-title[\s\S]*color:\s*#ffffff\s*!important/, 'Title in compatibilidad.css must be #ffffff !important');
  assert.match(compatCss, /#audit-active-vessel-panel \.audit-vessel-subtitle[\s\S]*color:\s*#bae6fd\s*!important/, 'Subtitle in compatibilidad.css must be #bae6fd !important');
});

