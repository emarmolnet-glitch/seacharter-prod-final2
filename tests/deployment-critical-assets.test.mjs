import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const viteSource = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const assistantSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const cerebroSource = await readFile(new URL('../netlify/functions/cerebro-ia.js', import.meta.url), 'utf8');
const frontendAssistantSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

for (const asset of ['network-resilience.js', 'project-cargo-engine.js', 'dossiers.js', 'dossiers.css']) {
  test(`${asset} is copied as a production legacy asset`, () => {
    assert.match(viteSource, new RegExp(`"${asset.replace('.', '\\.')}"`));
  });
}

test('classic scripts remain JavaScript files and keep their production references', () => {
  assert.match(indexSource, /src="\/network-resilience\.js/);
  assert.match(indexSource, /src="\.\/project-cargo-engine\.js"/);
  assert.match(indexSource, /src="\.\/dossiers\.js"/);
  assert.doesNotMatch(indexSource, /(?:network-resilience|project-cargo-engine|dossiers)\.jsx/);
});

test('Cerebro IA uses the local function and a fixed supported Gemini Pro model', () => {
  assert.match(assistantSource, /CHAT_ASSISTANT_MODEL = "gemini-3\.1-pro-preview"/);
  assert.match(assistantSource, /model: CHAT_ASSISTANT_MODEL/);
  assert.match(cerebroSource, /import chatAssistant from "\.\/chat-assistant\.js"/);
  assert.match(cerebroSource, /req\.formData\(\)/);
  assert.match(frontendAssistantSource, /DEFAULT_CEREBRO_IA_ENDPOINT = "\/api\/cerebro-ia"/);
  assert.match(indexSource, /return configuredEndpoint \|\| '\/api\/cerebro-ia'/);
  assert.doesNotMatch(frontendAssistantSource, /calm-shortbread-55bcfc.*cerebro-ia/);
});
