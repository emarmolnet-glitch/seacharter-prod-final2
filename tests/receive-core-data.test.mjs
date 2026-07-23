import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../netlify/functions/receive-core-data.ts', import.meta.url), 'utf8');

test('receive-core-data Netlify function exports handler, default, and config', () => {
  assert.match(source, /export const handler: Handler =/);
  assert.match(source, /export default handler;/);
  assert.match(source, /export const config: Config =/);
  assert.match(source, /\/api\/receive-core-data/);
  assert.match(source, /\/\.netlify\/functions\/receive-core-data/);
  assert.match(source, /\/api\/databridge\/receive-core-data/);
});

test('receive-core-data ensures all response returns use JSON.stringify body with application/json content-type', () => {
  assert.match(source, /"Content-Type": "application\/json/);
  assert.match(source, /body: JSON\.stringify\(payload\)/);
  assert.match(source, /return createResponse\(/);
  // Verify createResponse constructs { statusCode, headers, body: JSON.stringify(payload) }
  assert.match(source, /function createResponse\(\s*statusCode: number,\s*payload: \{ success: boolean; message: string; \[key: string\]: unknown \},\s*\)/);
});

test('receive-core-data handles OPTIONS, invalid method, invalid body, fleet array, and error catch blocks', () => {
  assert.match(source, /if \(method === "OPTIONS"\)/);
  assert.match(source, /if \(method !== "POST"\)/);
  assert.match(source, /if \(!body \|\| typeof body !== "object"\)/);
  assert.match(source, /extractFleetVessels\(body\)/);
  assert.match(source, /catch \(error: unknown\)/);
});
