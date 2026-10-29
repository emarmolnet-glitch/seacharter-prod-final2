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

test('2. Definición y lógica de buildMotherExecutiveScript con scraping visual y recomendación Risk Matrix', () => {
  assert.match(
    globalMadreDrawerSource,
    /function buildMotherExecutiveScript\s*\(/,
    'Debe definir la función buildMotherExecutiveScript'
  );

  // Verificación del scraping visual en el DOM y Risk Matrix
  assert.match(globalMadreDrawerSource, /(?:SCRAPING VISUAL DE DATOS Y ESCENARIOS DE RIESGO|EXTRACCIÓN 100% DINÁMICA DEL DOM)/);
  assert.match(globalMadreDrawerSource, /matchDays\s*=\s*domText\.match/);
  assert.match(globalMadreDrawerSource, /Dias Mar\\s\*\\\+\\s\*Puerto\\s\*\\\+\\s\*Margen Clima/);
  assert.match(globalMadreDrawerSource, /matchCargo\s*=\s*domText\.match/);
  assert.match(globalMadreDrawerSource, /matchBe\s*=\s*domText\.match/);
  assert.match(globalMadreDrawerSource, /matchOpt\s*=\s*domText\.match/);
  assert.match(globalMadreDrawerSource, /Abidjan\|Bejaia\|Argelia\|Algiers\|Oran\|Sfax\|Dakar\|Turkey\|Turquía\|Egipto\|Casablanca/);

  // Verificación de función auxiliar parseValue (respeto a decimales US y EU)
  assert.match(globalMadreDrawerSource, /const parseValue\s*=\s*\(val\)\s*=>/);
  assert.match(globalMadreDrawerSource, /clean\.lastIndexOf\(','\)\s*>\s*clean\.lastIndexOf\('\.'\)/);

  // Verificación de recomendación Risk Matrix y alerta regulatoria CBAM / EU ETS
  assert.match(globalMadreDrawerSource, /Análisis de Risk Matrix:/);
  assert.match(globalMadreDrawerSource, /Se recomienda intensificar los ritmos de carga/);
  assert.match(globalMadreDrawerSource, /Alerta regulatoria: Origen extracomunitario detectado/);
  assert.match(globalMadreDrawerSource, /Escaneo analítico completado/);
  assert.match(globalMadreDrawerSource, /El break-even/);
  assert.match(globalMadreDrawerSource, /optimiz/);
});

test('3. Definición y lógica de playNeuralMotherVoice conectando con DataBridge vía Web Audio API (Bypass CSP)', () => {
  assert.match(
    globalMadreDrawerSource,
    /async function playNeuralMotherVoice\s*\(\s*textToSpeak\s*\)/,
    'Debe definir la función playNeuralMotherVoice recibiendo directamente textToSpeak'
  );

  // Verificación de envío del texto dinámico sin hardcodear buildMotherExecutiveScript(state)
  assert.doesNotMatch(
    globalMadreDrawerSource,
    /const script = buildMotherExecutiveScript\(state\);/,
    'playNeuralMotherVoice no debe sobrescribir el texto con buildMotherExecutiveScript(state)'
  );
  assert.match(
    globalMadreDrawerSource,
    /body:\s*JSON\.stringify\(\{\s*text:\s*textToSpeak\s*\}\)/,
    'Debe enviar textToSpeak dinámicamente en el body del fetch'
  );

  // Verificación de que speakText pasa la variable limpia clean
  assert.match(
    globalMadreDrawerSource,
    /const audioInstance = await playNeuralMotherVoice\(clean\);/,
    'speakText debe invocar playNeuralMotherVoice pasando la variable clean'
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
    /if\s*\(\s*SCAN_COMMAND_REGEX\.test\(queryText\)\s*&&\s*!\/\(\?:mercado\|market\|spot\)\/i\.test\(queryText\)\s*\)\s*\{[\s\S]*?finalReply\s*=\s*buildMotherExecutiveScript\(stateForVoice\);/
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
