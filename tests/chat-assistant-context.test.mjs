import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');

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

test('chat assistant builds a dynamic maritime risk audit instruction', () => {
  assert.match(backendSource, /const \{ mensaje, contexto = \{\} \} = await req\.json\(\)/);
  assert.match(backendSource, /Contexto actual de la pantalla del usuario/);
  assert.match(backendSource, /JSON\.stringify\(contexto, null, 2\)/);
  assert.match(backendSource, /Reglas Críticas de Análisis y Proactividad/);
  assert.match(backendSource, /systemInstruction: finalInstruction/);
  assert.match(backendSource, /model: "gemini-2\.5-flash"/);
});
