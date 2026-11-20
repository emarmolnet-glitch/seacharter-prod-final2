import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const drawerSource = readFileSync(new URL('../src/components/GlobalMadreDrawer.jsx', import.meta.url), 'utf8');

test('1. ACTIVAR VOZ NEURONAL EN RESPUESTAS CORTAS: Eliminación de desincronización por inputValue y llamada a playNeuralMotherVoice', () => {
  // Asegurar que el useEffect de eventos no tiene [inputValue] como dependencia
  // para evitar que el cleanup ejecute stopCurrentAudio() al hacer setInputValue('') al enviar
  assert.match(
    drawerSource,
    /window\.removeEventListener\('madre:scan',\s*handleScanEvent\);\s*stopCurrentAudio\(\);\s*\};\s*\}, \[\]\);/,
    'El useEffect de listeners debe tener array de dependencias vacío [] para no invalidar el playback al limpiar el input'
  );

  // Asegurar uso de inputValueRef para capturar el valor más reciente sin recrear el listener
  assert.match(
    drawerSource,
    /inputValueRef\.current/,
    'Debe usar inputValueRef.current para capturar el valor del input sin recrear listeners'
  );

  // Asegurar condición para invocar voz con data.voiceSummary || data.mensaje_voz || finalReply
  assert.match(
    drawerSource,
    /const textToVocalize = data\.voiceSummary \|\| data\.mensaje_voz \|\| finalReply;/,
    'Debe definir textToVocalize usando voiceSummary, mensaje_voz o finalReply'
  );

  // Asegurar que se invoca speakText siempre que el altavoz no esté silenciado y exista textToVocalize
  assert.match(
    drawerSource,
    /if\s*\(!voiceStateRef\.current\.muted\s*&&\s*textToVocalize\)\s*\{/,
    'Debe verificar únicamente que no esté silenciado y que exista texto, sin exigir longitud mínima'
  );

  // Asegurar reanudación de AudioContext en playNeuralMotherVoice si está suspended
  assert.match(
    drawerSource,
    /if\s*\(audioCtx\s*&&\s*audioCtx\.state\s*===\s*['"]suspended['"]/,
    'playNeuralMotherVoice debe reanudar audioCtx si su estado es suspended'
  );
});

test('2. AUDIO CONTEXT: Reanudación explícita en onClick y onSubmit del botón Enviar antes de fetch', () => {
  // Función handleAudioUnlock definida
  assert.match(
    drawerSource,
    /const handleAudioUnlock = \(\) => \{/,
    'Debe existir la función handleAudioUnlock para desbloquear AudioContext'
  );

  // handleAudioUnlock invocado en handleSubmit
  assert.match(
    drawerSource,
    /const handleSubmit = async\s*\(e,\s*overridePrompt\)\s*=>\s*\{[\s\S]*?handleAudioUnlock\(\);/,
    'handleSubmit debe invocar handleAudioUnlock antes de enviar'
  );

  // handleAudioUnlock invocado en el evento onClick del botón Enviar
  assert.match(
    drawerSource,
    /<button[^>]*type="submit"[^>]*onClick=\{handleAudioUnlock\}/,
    'El botón Enviar debe tener onClick={handleAudioUnlock} para desbloqueo por interacción directa de usuario'
  );
});

test('3. EVITAR MODO STANDBY EN MENSAJES ESCRITOS POR TECLADO: Flags de interacción manual y bypass_wake_word', () => {
  // Asegurar flags de interacción manual y desactivación de wake-word en el payload raíz
  assert.match(drawerSource, /bypass_wake_word:\s*true/);
  assert.match(drawerSource, /wake_word:\s*false/);
  assert.match(drawerSource, /tipo_interaccion:\s*["']manual["']/);
  assert.match(drawerSource, /modo:\s*["']manual["']/);
  assert.match(drawerSource, /interaccion_manual:\s*true/);
  assert.match(drawerSource, /chat_activo:\s*true/);
  assert.match(drawerSource, /input_source:\s*["']chat["']/);
  assert.match(drawerSource, /input_type:\s*["']text["']/);
  assert.match(drawerSource, /tipo_entrada:\s*["']teclado["']/);

  // Asegurar que contexto_ui también transporta bypass_wake_word y modo manual
  assert.match(
    drawerSource,
    /payload\.contexto_ui\s*=\s*\{[\s\S]*?bypass_wake_word:\s*true[\s\S]*?wake_word:\s*false/
  );
});
