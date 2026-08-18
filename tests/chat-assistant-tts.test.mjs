import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('/opt/build/repo/src/sea-assistant-entry.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('/opt/build/repo/assets/css/sea-assistant.css', import.meta.url), 'utf8');

test('assistant exposes a persistent speech synthesis toggle', () => {
  assert.match(frontendSource, /class="sca-speech-toggle"/);
  assert.match(frontendSource, /SPEECH_PREFERENCE_KEY/);
  assert.match(frontendSource, /window\.speechSynthesis/);
  assert.match(frontendSource, /new window\.SpeechSynthesisUtterance\(cleanText\)/);
  assert.match(frontendSource, /utterance\.lang = "es-ES"/);
  assert.match(frontendSource, /utterance\.rate = 1\.1/);
  assert.match(frontendSource, /utterance\.pitch = 1/);
});

test('speech is cleaned and cancelled on mute or close', () => {
  assert.match(frontendSource, /cleanTextForSpeech/);
  assert.match(frontendSource, /container\.textContent/);
  assert.match(frontendSource, /speechSynthesis\.cancel\(\)/);
  assert.match(frontendSource, /if \(!speechEnabled\) cancelSpeech\(\)/);
  assert.match(frontendSource, /if \(isListening\) recognition\?\.stop\(\);\s+cancelSpeech\(\)/s);
  assert.match(frontendSource, /replaceWithAssistantMessage\(thinkingMessage, payload\.respuesta\.trim\(\)/);
  assert.match(frontendSource, /history\.appendChild\(message\);\s+if \(!options\.error\) speakText\(text\)/s);
});

test('speech control has active, disabled, and focus styles', () => {
  assert.match(stylesheet, /\.sca-speech-toggle\.is-active/);
  assert.match(stylesheet, /\.sca-speech-toggle:disabled/);
  assert.match(stylesheet, /\.sca-speech-toggle:focus-visible/);
});
