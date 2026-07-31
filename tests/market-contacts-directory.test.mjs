import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexHtml, directoryScript, directoryStyles, endpointSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../market-contacts.js', import.meta.url), 'utf8'),
  readFile(new URL('../market-contacts.css', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/market-contacts.ts', import.meta.url), 'utf8'),
]);

test('advanced settings menu exposes the broker directory overlay', () => {
  assert.match(indexHtml, /Agenda de Brokers/);
  assert.match(indexHtml, /openMarketContactsDirectory/);
  assert.match(indexHtml, /market-contacts\.css/);
  assert.match(indexHtml, /market-contacts\.js/);
});

test('directory supports instant search, role filters and quick contact actions', () => {
  assert.match(directoryScript, /addEventListener\('input'/);
  assert.match(directoryScript, /data-role=/);
  assert.match(directoryScript, /navigator\.clipboard\.writeText/);
  assert.match(directoryScript, /mailto:/);
  assert.match(directoryScript, /method: state\.editingId \? 'PATCH' : 'POST'/);
  assert.match(directoryStyles, /\.market-directory-table/);
  assert.match(directoryStyles, /padding: clamp\(4rem, 8vh, 6rem\)/);
  assert.match(directoryStyles, /padding: 2rem 1\.5rem 1\.4rem/);
  assert.match(directoryStyles, /padding: clamp\(4rem, 8vh, 6rem\) 1\.25rem 1\.5rem/);
  assert.match(directoryStyles, /\.market-contact-editor-header[\s\S]*padding: 2rem 1\.25rem 1\.2rem/);
  assert.match(directoryStyles, /\.market-contact-editor-card[\s\S]*grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(directoryStyles, /\.market-contact-field select option[\s\S]*background: #fff !important/);
  assert.match(directoryStyles, /color-scheme: light/);
  assert.match(directoryScript, /editor\.scrollTop = 0/);
  assert.match(directoryStyles, /\.market-directory-header-actions[\s\S]*flex: 0 0 auto/);
  assert.match(directoryStyles, /@media \(max-width: 900px\)/);
});

test('contact endpoint reads and writes the existing Market_Contacts table safely', () => {
  assert.match(endpointSource, /FROM "Market_Contacts"/);
  assert.match(endpointSource, /INSERT INTO "Market_Contacts"/);
  assert.match(endpointSource, /UPDATE "Market_Contacts"/);
  assert.match(endpointSource, /\$1::uuid/);
  assert.match(endpointSource, /CONTACT_ROLES/);
});
