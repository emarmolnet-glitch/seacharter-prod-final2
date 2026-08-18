import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const assistantStyles = await readFile(new URL('../assets/css/sea-assistant.css', import.meta.url), 'utf8');
const overlaySource = await readFile(new URL('../dual-mode-overlay.js', import.meta.url), 'utf8');

test('chat assistant sends the complete screen context with each message', () => {
  assert.match(frontendSource, /function collectChatContext\(\)/);
  assert.match(frontendSource, /const activeModule = getActiveModule\(\)/);
  assert.match(frontendSource, /modulo: activeModule/);
  assert.match(frontendSource, /rol: roleMode === "charterer"/);
  assert.match(frontendSource, /operativos: \{/);
  assert.match(frontendSource, /financieros: \{/);
  assert.match(frontendSource, /contrato: \{/);
  assert.match(frontendSource, /JSON\.stringify\(\{ mensaje: userText, contexto \}\)/);
});

test('chat assistant stays operable and contextual while Dual Mode is open', () => {
  assert.match(frontendSource, /function getDualModeContext\(\)/);
  assert.match(frontendSource, /#dual-mode-overlay dual-trading-chartering-view/);
  assert.match(frontendSource, /dualView\?\.getAssistantContext\?\.\(\)/);
  assert.match(frontendSource, /\.\.\.\(dualModeContext \? \{ modoDual: dualModeContext \} : \{\}\)/);
  assert.match(frontendSource, /window\.addEventListener\("sea-assistant:open", openFromContext\)/);
  assert.match(frontendSource, /input\.setSelectionRange\(input\.value\.length, input\.value\.length\)/);
  assert.match(assistantStyles, /z-index:\s*2147483500/);
  assert.match(overlaySource, /event\.target instanceof Element && event\.target\.closest\('\.sca-root'\)/);
});

test('chat assistant builds a dynamic maritime risk audit instruction', () => {
  assert.match(backendSource, /const \{ mensaje, contexto = \{\} \} = await req\.json\(\)/);
  assert.match(backendSource, /Contexto actual de la pantalla del usuario/);
  assert.match(backendSource, /JSON\.stringify\(contexto, null, 2\)/);
  assert.match(backendSource, /Reglas Críticas de Análisis y Proactividad/);
  assert.match(backendSource, /Contexto Dinámico y Financiero/);
  assert.match(backendSource, /Optimización de Operaciones Portuarias \(Eficiencia vs\. Coste\)/);
  assert.match(backendSource, /Defensa en Negociaciones Comerciales \(Llamar el Farol\)/);
  assert.match(backendSource, /Precio COA \(Contract of Affreightment\)/);
  assert.match(backendSource, /Precio Backhaul \(Viaje de Retorno\)/);
  assert.match(backendSource, /baseInstruction \+ contextInstruction \+ expertRules/);
  assert.match(backendSource, /systemInstruction: finalInstruction/);
  assert.match(backendSource, /model: "gemini-2\.5-flash"/);
});
