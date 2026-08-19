import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../assets/css/sea-assistant.css', import.meta.url), 'utf8');

test('chat header exposes an accessible close control', () => {
  assert.match(frontendSource, /class="sca-close"/);
  assert.match(frontendSource, /aria-label="Cerrar asistente"/);
  assert.match(frontendSource, /closeButton\.addEventListener\("click", \(\) => setOpen\(false\)\)/);
  assert.match(stylesheet, /\.sca-close/);
});

test('chat header uses a compact single-row layout with truncated text', () => {
  assert.match(stylesheet, /\.sca-header\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-start;[^}]*gap:\s*8px;/s);
  assert.match(stylesheet, /\.sca-heading\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*line-height:\s*1\.1;/s);
  assert.match(stylesheet, /\.sca-status\s*\{[^}]*font-size:\s*0\.75rem;[^}]*white-space:\s*nowrap;/s);
  assert.match(stylesheet, /\.sca-status\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s);
});

test('chat exposes stop and automatic latest-message controls', () => {
  assert.match(frontendSource, /class="sca-stop"/);
  assert.match(frontendSource, /activeRequestController\?\.abort\(\)/);
  assert.match(frontendSource, /cancelSpeech\(\)/);
  assert.match(frontendSource, /messagesEndRef\.scrollIntoView\(\{ behavior: "smooth", block: "end" \}\)/);
  assert.match(frontendSource, /new MutationObserver\(scrollToLatest\)/);
  assert.match(stylesheet, /\.sca-stop\[hidden\]/);
});
