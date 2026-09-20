import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('forwarder-projects resolves Netlify Database connection string across standard env variables', async () => {
  const source = await readFile(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');
  
  assert.match(source, /DATABASE_URL/);
  assert.match(source, /NETLIFY_DATABASE_URL/);
  assert.match(source, /NETLIFY_DB_URL/);
  assert.match(source, /NEON_DATABASE_URL/);
  assert.match(source, /connectionTimeoutMillis:\s*5000/);
  assert.match(source, /pool\.on\(['"]error['"]/);
});

test('sea-assistant-entry sanitizes chat context with recursion depth limit and circular reference guard', async () => {
  const source = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

  assert.match(source, /function sanitizeAiContextValue\(/);
  assert.match(source, /sanitizedPayload\.contexto = sanitizeAiContextValue\(collectChatContext\(\)\)/);
  assert.match(source, /visited = new WeakSet\(\)/);
  assert.match(source, /maxDepth <= 0/);
});
