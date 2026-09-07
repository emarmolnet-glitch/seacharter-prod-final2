import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProjectInstruction } from '../src/utils/agenteProyectosParser.mjs';

const widgetSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const widgetCssSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.css', import.meta.url), 'utf8');

test('1. parseProjectInstruction extracts "almacenaje 5 días" without parroting', () => {
  const result = parseProjectInstruction('almacenaje 5 días');
  assert.equal(result.payload.storageDays, 5);
  assert.ok(result.detectedActions.some(a => a.toLowerCase().includes('5 día')));
  assert.ok(!result.agentResponse.includes('Procesando orden para proyectos: "almacenaje 5 días"'));
  assert.ok(result.agentResponse.includes('Almacenaje configurado a 5 días'));
});

test('2. parseProjectInstruction extracts "surveyor 1500" correctly', () => {
  const result = parseProjectInstruction('surveyor 1500');
  assert.equal(result.payload.surveyorCost, 1500);
  assert.ok(result.detectedActions.some(a => a.includes('1500') || a.includes('1.500')));
  assert.ok(result.agentResponse.includes('surveyor') && (result.agentResponse.includes('1500') || result.agentResponse.includes('1.500')));
});

test('3. parseProjectInstruction extracts "añadir pieza" with structured newPiece and forceOpenModal', () => {
  const result = parseProjectInstruction('añadir pieza');
  assert.equal(result.payload.addPiece, true);
  assert.equal(result.payload.forceOpenModal, true);
  assert.ok(result.payload.newPiece);
  assert.equal(result.payload.newPiece.category, 'Equipos de Proceso');
  assert.ok(result.payload.newPiece.weight);
  assert.ok(result.agentResponse.includes('Project Cargo Builder'));
});

test('4. parseProjectInstruction handles combined multi-intent input', () => {
  const result = parseProjectInstruction('almacenaje 7 días, surveyor 2000 y añadir transformador de 40000 kg');
  assert.equal(result.payload.storageDays, 7);
  assert.equal(result.payload.surveyorCost, 2000);
  assert.equal(result.payload.addPiece, true);
  assert.equal(result.payload.newPiece.weight, '40000');
  assert.ok(result.payload.newPiece.type.includes('Transformador'));
  assert.equal(result.payload.forceOpenModal, true);
});

test('5. parseProjectInstruction provides helpful conversational reply when intent is general', () => {
  const result = parseProjectInstruction('hola, que puedes hacer?');
  assert.ok(!result.payload.storageDays);
  assert.ok(!result.payload.surveyorCost);
  assert.ok(result.agentResponse.includes('Puedes pedirme órdenes concretas'));
  assert.ok(!result.agentResponse.includes('Procesando orden para proyectos:'));
});

test('6. AgenteProyectosWidget renders floating button and header controls for minimize and hide', () => {
  // Verifies minimize button and hide button in header
  assert.match(widgetSource, /handleMinimize/);
  assert.match(widgetSource, /handleClose/);
  assert.match(widgetSource, /title="Minimizar agente"/);
  assert.match(widgetSource, /title="Ocultar agente"/);
  assert.match(widgetSource, /🗕/);
  assert.match(widgetSource, /✕/);

  // Verifies aesthetic floating button with label
  assert.match(widgetSource, /className="project-agent-floating-btn"/);
  assert.match(widgetSource, /Agente de Proyectos/);
  assert.match(widgetSource, /handleRestore/);
});

test('7. ForwarderWorkspace handleApplyProjectPayload applies setters and forces modal open on structural/piece changes', () => {
  // Check setters are present in handleApplyProjectPayload
  assert.match(workspaceSource, /setStorageDays\(Number\(payload\.storageDays\)\)/);
  assert.match(workspaceSource, /setSurveyorCost\(Number\(payload\.surveyorCost\)\)/);
  assert.match(workspaceSource, /userEditedSurveyor\.current\s*=\s*true/);
  assert.match(workspaceSource, /setInlandCost\(/);
  assert.match(workspaceSource, /setCustomsCost\(/);
  assert.match(workspaceSource, /setCargoItems\(/);
  assert.match(workspaceSource, /setDunnageWood\(/);
  assert.match(workspaceSource, /setHighCapacitySlings\(/);
  assert.match(workspaceSource, /setChainsBinders\(/);
  assert.match(workspaceSource, /setStevedoreGangs\(/);
  assert.match(workspaceSource, /setHeavyLiftCrane\(/);
  assert.match(workspaceSource, /setMafiPlatforms\(/);

  // Check conditional modal force open
  assert.match(workspaceSource, /if\s*\(\s*structuralModified\s*\|\|\s*payload\.forceOpenModal\s*\)\s*\{\s*setIsCargoModalOpen\(true\);/);
});

test('8. ForwarderWorkspace connects AgenteProyectosWidget with onUpdatePayload and visibility sync', () => {
  assert.match(workspaceSource, /<AgenteProyectosWidget[\s\S]*?onUpdatePayload=\{handleApplyProjectPayload\}[\s\S]*?isOpen=\{isAgentVisible\}[\s\S]*?onToggleOpen=\{setIsAgentVisible\}/);
  assert.match(workspaceSource, /const\s+\[isAgentVisible,\s*setIsAgentVisible\]\s*=\s*useState\(true\);/);
});

test('9. AgenteProyectosWidget collapsed floating button is elevated (bottom-24 / 96px) to avoid overlapping the global assistant globe', () => {
  assert.match(widgetCssSource, /\.project-agent-floating-btn\s*\{[\s\S]*?bottom:\s*(?:96px|6rem)/);
  assert.match(widgetCssSource, /bottom-24/);
});

