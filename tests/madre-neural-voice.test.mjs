import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const globalMadreDrawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');

test('1. Eliminación total de window.speechSynthesis en GlobalMadreDrawer', () => {
  assert.doesNotMatch(
    globalMadreDrawerSource,
    /window\.speechSynthesis/,
    'GlobalMadreDrawer no debe usar window.speechSynthesis bajo ninguna circunstancia'
  );
  assert.doesNotMatch(
    globalMadreDrawerSource,
    /SpeechSynthesisUtterance/,
    'GlobalMadreDrawer no debe crear SpeechSynthesisUtterance'
  );
});

test('2. Definición y lógica de buildMotherExecutiveScript con ROI automatizado', () => {
  assert.match(
    globalMadreDrawerSource,
    /function buildMotherExecutiveScript\s*\(/,
    'Debe definir la función buildMotherExecutiveScript'
  );

  // Verificación de los cálculos de ROI y texto
  assert.match(globalMadreDrawerSource, /horasAhorradas\s*=\s*2\.4/);
  assert.match(globalMadreDrawerSource, /ahorroAdmin\s*=\s*horasAhorradas\s*\*\s*45/);
  assert.match(globalMadreDrawerSource, /fugas\s*=\s*state(?:\?\.|\.)pdaInyectada\s*\?\s*2300\s*:\s*0/);
  assert.match(globalMadreDrawerSource, /Escaneo completado/);
  assert.match(globalMadreDrawerSource, /El break-even del armador se sitúa en/);
  assert.match(globalMadreDrawerSource, /dólares por tonelada/);
  assert.match(globalMadreDrawerSource, /Atención:/);
  assert.match(globalMadreDrawerSource, /Impacto de esta estimación: se han ahorrado/);
  assert.match(globalMadreDrawerSource, /prevenido posibles fugas por valor de/);
  assert.match(globalMadreDrawerSource, /Operación validada/);
});

test('3. Definición y lógica de playNeuralMotherVoice conectando con DataBridge vía Web Audio API (Bypass CSP)', () => {
  assert.match(
    globalMadreDrawerSource,
    /async function playNeuralMotherVoice\s*\(/,
    'Debe definir la función playNeuralMotherVoice'
  );

  // Verificación del endpoint madre-voice y reproducción directa con Web Audio API (Bypass CSP media-src)
  assert.match(globalMadreDrawerSource, /\/\.netlify\/functions\/madre-voice/);
  assert.match(globalMadreDrawerSource, /response\.arrayBuffer\(\)/);
  assert.match(globalMadreDrawerSource, /new AudioContext\(\)/);
  assert.match(globalMadreDrawerSource, /audioCtx\.decodeAudioData\(/);
  assert.match(globalMadreDrawerSource, /audioCtx\.createBufferSource\(\)/);
  assert.match(globalMadreDrawerSource, /source\.start\(0\)/);

  // Asegurar que NO se usa blob ni URL.createObjectURL ni new Audio
  assert.doesNotMatch(globalMadreDrawerSource, /response\.blob\(\)/);
  assert.doesNotMatch(globalMadreDrawerSource, /URL\.createObjectURL/);
  assert.doesNotMatch(globalMadreDrawerSource, /new Audio\(/);
});

test('4. Limpieza de impresión en el Chat: Escaneo de pantalla muestra el guion ejecutivo idéntico a la voz', () => {
  assert.match(
    globalMadreDrawerSource,
    /if\s*\(\s*SCAN_COMMAND_REGEX\.test\(queryText\)\s*\)\s*\{[\s\S]*?replyText\s*=\s*buildMotherExecutiveScript\(stateForVoice\);/
  );
  assert.match(
    globalMadreDrawerSource,
    /setMessages\(\(prev\)\s*=>\s*\[\.\.\.prev,\s*assistantMessage\]\);/
  );
});

test('5. Exportación y exposición global de funciones y botón de escaneo', () => {
  assert.match(globalMadreDrawerSource, /window\.buildMotherExecutiveScript\s*=\s*buildMotherExecutiveScript/);
  assert.match(globalMadreDrawerSource, /window\.playNeuralMotherVoice\s*=\s*playNeuralMotherVoice/);
  assert.match(globalMadreDrawerSource, /buildMotherExecutiveScript/);
  assert.match(globalMadreDrawerSource, /playNeuralMotherVoice/);
  assert.match(globalMadreDrawerSource, /id="btn-madre-scan-screen"/);
});

test('6. Asincronía, Latencia, Await en voz y Auto-envío en micrófono', () => {
  // Función asíncrona handleSendMessage parametrizada
  assert.match(globalMadreDrawerSource, /const\s+handleSendMessage\s*=\s*async\s*\(\s*overrideText\s*=\s*null\s*\)\s*=>/);
  
  // Await en la reproducción de voz
  assert.match(globalMadreDrawerSource, /await\s+speakText\(/);
  
  // No hay console.log imprimiendo la promesa
  assert.doesNotMatch(globalMadreDrawerSource, /console\.log\([^)]*playNeuralMotherVoice/);
  assert.doesNotMatch(globalMadreDrawerSource, /console\.log\([^)]*speakText/);

  // Estado visual de carga y bloqueo de inputs
  assert.match(globalMadreDrawerSource, /disabled=\{isLoading\}/);
  assert.match(globalMadreDrawerSource, /Procesando audio\.\.\./);

  // Auto-envío en micrófono al finalizar dictado (isFinal)
  assert.match(globalMadreDrawerSource, /if\s*\(\s*event\.results\[0\]\.isFinal\s*\)\s*\{[\s\S]*?await\s+handleSendMessage\(transcript\);/);
});
