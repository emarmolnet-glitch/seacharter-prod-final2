import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../assets/css/sea-assistant.css', import.meta.url), 'utf8');

test('assistant exposes a compatible Spanish speech recognition control', () => {
  assert.match(frontendSource, /id="sea-assistant-mic-btn"/);
  assert.match(frontendSource, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(frontendSource, /recognition\.lang = "es-ES"/);
  assert.match(frontendSource, /micButton\.hidden = false/);
  assert.match(frontendSource, /recognition\.start\(\)/);
  assert.match(frontendSource, /recognition\.stop\(\)/);
});

test('voice transcripts remain editable and synchronize the composer state', () => {
  assert.match(frontendSource, /recognition\.onresult/);
  assert.match(frontendSource, /insertTranscript\(transcript\)/);
  assert.match(frontendSource, /input\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/);
  assert.match(frontendSource, /input\.setSelectionRange\(cursorPosition, cursorPosition\)/);
});

test('microphone communicates listening and error states accessibly', () => {
  assert.match(frontendSource, /aria-pressed="false"/);
  assert.match(frontendSource, /recognition\.onerror/);
  assert.match(frontendSource, /El navegador no tiene permiso para usar el micrófono/);
  assert.match(stylesheet, /\.sca-mic\.is-listening/);
  assert.match(stylesheet, /@keyframes sca-listening-ring/);
  assert.match(stylesheet, /\.sca-mic\[hidden\]/);
});
