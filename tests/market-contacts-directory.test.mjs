import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexHtml, directoryScript, directoryStyles, endpointSource, schemaSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../market-contacts.js', import.meta.url), 'utf8'),
  readFile(new URL('../market-contacts.css', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/market-contacts.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/schema.ts', import.meta.url), 'utf8'),
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

test('database schema and endpoint include linked_imos array and fleet lookup from vessels_master', () => {
  // Schema defines marketContacts with linkedImos array
  assert.match(schemaSource, /export const marketContacts = pgTable\("Market_Contacts"/);
  assert.match(schemaSource, /linkedImos:\s*text\("linked_imos"\)\.array\(\)/);
  assert.match(schemaSource, /SHIPMANAGEMENT/);

  // Endpoint handles linked_imos in payload, insert, and update
  assert.match(endpointSource, /linked_imos/);
  assert.match(endpointSource, /cleanImos/);
  assert.match(endpointSource, /"SHIPMANAGEMENT"/);

  // Endpoint queries vessels_master when action=fleet or imos parameter is provided
  assert.match(endpointSource, /vessels_master/);
  assert.match(endpointSource, /action.*===.*["']fleet["']|has\(["']imos["']\)/);
  assert.match(endpointSource, /vessel_name/);
  assert.match(endpointSource, /imo_number/);
});

test('directory editor supports tag inputs for linking IMO numbers to shipowner/management contacts', () => {
  // Tags input element and list in the DOM template
  assert.match(directoryScript, /id="market-contact-tags-box"/);
  assert.match(directoryScript, /id="market-contact-tags-list"/);
  assert.match(directoryScript, /id="market-contact-imo-input"/);
  assert.match(directoryScript, /market-contact-tag/);
  assert.match(directoryScript, /addImosFromText/);
  assert.match(directoryScript, /cleanImo/);
  assert.match(directoryScript, /data-remove-imo/);

  // Styles for tags input
  assert.match(directoryStyles, /\.market-contact-tags-box/);
  assert.match(directoryStyles, /\.market-contact-tag/);
  assert.match(directoryStyles, /\.market-contact-tag-remove/);
});

test('directory renders Flota Gestionada with vessel name and IMO pills when contact is expanded', () => {
  // Expansion toggle and detail row
  assert.match(directoryScript, /data-toggle-details/);
  assert.match(directoryScript, /market-directory-detail-row/);
  assert.match(directoryScript, /toggleContactDetails/);
  assert.match(directoryScript, /fetchFleetForContact/);

  // Flota Gestionada section and vessel pills
  assert.match(directoryScript, /Flota Gestionada/);
  assert.match(directoryScript, /market-fleet-card/);
  assert.match(directoryScript, /market-fleet-card-name/);
  assert.match(directoryScript, /market-fleet-card-imo/);

  // Styles for Flota Gestionada
  assert.match(directoryStyles, /\.market-directory-fleet-section/);
  assert.match(directoryStyles, /\.market-directory-fleet-title/);
  assert.match(directoryStyles, /\.market-fleet-card/);
  assert.match(directoryStyles, /\.market-fleet-card-name/);
  assert.match(directoryStyles, /\.market-fleet-card-imo/);
});

