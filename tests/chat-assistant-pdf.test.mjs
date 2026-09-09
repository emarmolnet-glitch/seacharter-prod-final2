import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { jsPDF } from 'jspdf';

const assistantSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');

test('chat-assistant.js does not contain static top-level import of pdfjs-dist', () => {
  assert.doesNotMatch(assistantSource, /import\s+.*\s+from\s+["']pdfjs-dist/);
  assert.match(assistantSource, /import\(["']pdfjs-dist\/legacy\/build\/pdf\.mjs["']\)/);
});

test('resolvePdfDocumentLoader dynamically loads getDocument from pdfjs-dist legacy mjs', async () => {
  const code = assistantSource.slice(
    assistantSource.indexOf('export async function resolvePdfDocumentLoader'),
    assistantSource.indexOf('export function buildSystemInstruction'),
  ).replaceAll('export ', '');

  const sandbox = {
    Buffer,
    Uint8Array,
    TypeError,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${code}; this.resolve = resolvePdfDocumentLoader; this.extract = extractTextFromPDF;`, sandbox, {
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });

  const getDocument = await sandbox.resolve();
  assert.equal(typeof getDocument, 'function');
});

test('extractTextFromPDF extracts text correctly from a valid PDF buffer', async () => {
  const code = assistantSource.slice(
    assistantSource.indexOf('export async function resolvePdfDocumentLoader'),
    assistantSource.indexOf('export function buildSystemInstruction'),
  ).replaceAll('export ', '');

  const sandbox = {
    Buffer,
    Uint8Array,
    TypeError,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${code}; this.resolve = resolvePdfDocumentLoader; this.extract = extractTextFromPDF;`, sandbox, {
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });

  const doc = new jsPDF();
  doc.text('SeaCharter Critical PDF Cargo Manifest', 10, 10);
  const pdfBytes = doc.output('arraybuffer');
  const buffer = Buffer.from(pdfBytes);

  const text = await sandbox.extract(buffer);
  assert.match(text, /SeaCharter Critical PDF Cargo Manifest/);
});

test('extractTextFromPDF safely returns empty string on malformed buffer without throwing', async () => {
  const code = assistantSource.slice(
    assistantSource.indexOf('export async function resolvePdfDocumentLoader'),
    assistantSource.indexOf('export function buildSystemInstruction'),
  ).replaceAll('export ', '');

  const sandbox = {
    Buffer,
    Uint8Array,
    TypeError,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${code}; this.resolve = resolvePdfDocumentLoader; this.extract = extractTextFromPDF;`, sandbox, {
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });

  const malformedBuffer = Buffer.from('not a valid pdf content');
  const text = await sandbox.extract(malformedBuffer);
  assert.equal(text, '');
});
