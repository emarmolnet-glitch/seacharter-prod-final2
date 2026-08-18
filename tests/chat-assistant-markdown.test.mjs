import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../assets/css/sea-assistant.css', import.meta.url), 'utf8');

test('assistant responses render sanitized Markdown while user messages remain text', () => {
  assert.match(frontendSource, /import DOMPurify from "dompurify"/);
  assert.match(frontendSource, /import \{ marked \} from "marked"/);
  assert.match(frontendSource, /role === "assistant" && !options\.error/);
  assert.match(frontendSource, /DOMPurify\.sanitize\(marked\.parse\(text/);
  assert.match(frontendSource, /bubble\.textContent = text/);
  assert.match(frontendSource, /noopener noreferrer/);
});

test('assistant Markdown has isolated typography for rich content', () => {
  assert.match(stylesheet, /\.sca-markdown h1,/);
  assert.match(stylesheet, /\.sca-markdown strong/);
  assert.match(stylesheet, /\.sca-markdown ul,/);
  assert.match(stylesheet, /\.sca-markdown li::marker/);
  assert.match(stylesheet, /\.sca-markdown pre/);
});
