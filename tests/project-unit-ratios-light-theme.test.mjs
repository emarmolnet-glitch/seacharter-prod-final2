import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. Unit ratios boxes use clean light theme design without intrusive dark backgrounds', () => {
  const summaryBlockMatch = forwarderSource.match(/id="financial-unit-ratios-summary"[\s\S]*?<\/div>\s*\)\}/);
  assert.ok(summaryBlockMatch, 'financial-unit-ratios-summary container must exist');
  const summaryBlock = summaryBlockMatch[0];

  // Must NOT have dark background classes in the summary container cards
  assert.doesNotMatch(summaryBlock, /bg-slate-800/, 'Must not use dark bg-slate-800 background');
  assert.doesNotMatch(summaryBlock, /bg-slate-900/, 'Must not use dark bg-slate-900 background');
  assert.doesNotMatch(summaryBlock, /bg-black/, 'Must not use dark bg-black background');

  // Must use light background (e.g. bg-white or bg-slate-50) and clean border (border-slate-200)
  assert.match(summaryBlock, /bg-white/, 'Must use clean light background bg-white');
  assert.match(summaryBlock, /border\s+border-slate-200/, 'Must use clean border border-slate-200');

  // Must use dark corporate typography for labels and numbers
  assert.match(summaryBlock, /text-slate-700/, 'Must use text-slate-700 for labels');
  assert.match(summaryBlock, /text-slate-900/, 'Must use text-slate-900 for numbers');

  // Must include elegant accents for Flete Unitario (sky) and FOB + Mercancía Unitario (amber)
  assert.match(summaryBlock, /bg-sky-500/, 'Must include sky indicator accent for Flete Unitario');
  assert.match(summaryBlock, /bg-amber-500/, 'Must include amber indicator accent for FOB + Mercancía');
  assert.match(summaryBlock, /text-sky-700/, 'Must include text-sky-700 for Flete USD/MT badge');
  assert.match(summaryBlock, /text-amber-800/, 'Must include text-amber-800 for FOB USD/MT badge');
});
