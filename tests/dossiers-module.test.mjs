import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../dossiers.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../dossiers.css', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');

test('dossiers uses a light corporate hero and teal active navigation', () => {
  const viewStart = html.indexOf('<div id="view-dossiers"');
  const viewEnd = html.indexOf('</main>', viewStart);
  const view = html.slice(viewStart, viewEnd);

  assert.match(view, /dossiers-hero-card/);
  assert.doesNotMatch(view, /bg-\[#002060\]|bg-gradient|text-blue-100/);
  assert.match(styles, /#tab-btn-dossiers\.bg-blue-600\s*\{\s*background:\s*#168b7a/i);
});

test('save and new-estimation actions open the dossier modal before persistence', () => {
  assert.match(html, /window\.DossierManager\.requestNewEstimation\(\)/);
  assert.match(html, /window\.DossierManager\?\.requestSave/);
  assert.match(html, /id="dossier-save-modal"/);
  assert.match(script, /function requestSave\(\)/);
  assert.match(script, /function requestNewEstimation\(\)/);
  assert.match(script, /await persistCurrent\(clientName, internalNotes\)/);
});

test('client and notes are injected into the persisted dossier payload', () => {
  assert.match(script, /payload\.clientName = clientName/);
  assert.match(script, /payload\.internalNotes = internalNotes/);
  assert.match(script, /charterer: clientName/);
  assert.match(script, /dossier\.charterer \|\| 'Sin especificar'/);
  assert.match(schema, /internalNotes: text\("internal_notes"\)/);
});
