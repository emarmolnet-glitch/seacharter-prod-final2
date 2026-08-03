import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, scriptSource, stylesSource, endpointSource, migrationSource, norSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.css', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/voyage-tracking.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/database/migrations/20260801150000_extend_voyage_live_tracking/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/tender-nor.ts', import.meta.url), 'utf8'),
]);

test('primary navigation exposes Tracking without duplicating it in advanced settings', () => {
  assert.match(indexSource, /\{ id: 'tracking', label: 'Tracking', presentation: 'dialog' \}/);
  assert.doesNotMatch(indexSource, /id="open-tracking-live-btn"/);
  assert.doesNotMatch(indexSource, /const trackingLiveItem = document\.createElement/);
  assert.match(indexSource, /tracking-live\.css/);
  assert.match(indexSource, /tracking-live\.js/);
});

test('tracking open and close events synchronize the active header module', () => {
  assert.match(scriptSource, /CustomEvent\('tracking-live:open'\)/);
  assert.match(scriptSource, /CustomEvent\('tracking-live:close'\)/);
  assert.match(indexSource, /updateNavigationContext\('tracking'\)/);
  assert.match(indexSource, /document\.addEventListener\('tracking-live:close', restoreActiveViewNavigation\)/);
});

test('tracking console supports contract lookup, polling and all six operational phases', () => {
  assert.match(scriptSource, /\/api\/v1\/voyage\/tracking\/\$\{encodeURIComponent\(contractRef\)\}/);
  assert.match(scriptSource, /TRACKING_POLL_INTERVAL = 30_000/);
  assert.match(scriptSource, /case 1:/);
  assert.match(scriptSource, /case 6:/);
  assert.match(scriptSource, /Alertas en tiempo real/);
  assert.match(stylesSource, /\.tracking-stepper/);
  assert.match(stylesSource, /data-level="critical"/);
});

test('tracking console renders alert and audit collections dynamically', () => {
  assert.match(scriptSource, /tracking-alert-count\$\{alerts\.length \? ' has-alerts' : ''\}/);
  assert.match(scriptSource, />\$\{escapeTrackingHtml\(alerts\.length\)\}<\/span>/);
  assert.match(scriptSource, /alerts\.map\(renderTrackingAlert\)/);
  assert.match(scriptSource, /timeline\.map\(renderTrackingEvent\)/);
  assert.match(scriptSource, /event\?\.occurred_at/);
  assert.match(scriptSource, /event\?\.description \|\| event\?\.summary/);
  assert.match(stylesSource, /\.tracking-alert-count\.has-alerts/);
  assert.match(stylesSource, /\.tracking-event-time[\s\S]*font: 850/);
});

test('tracking console uses the SeaCharter light corporate theme', () => {
  assert.match(stylesSource, /--tracking-bg: #f1f5f9/);
  assert.match(stylesSource, /--tracking-surface: #ffffff/);
  assert.match(stylesSource, /--tracking-text: #0f172a/);
  assert.match(stylesSource, /--tracking-primary: #004e64/);
  assert.match(stylesSource, /\.tracking-live-topbar[\s\S]*background: rgba\(255, 255, 255, 0\.96\)/);
  assert.match(stylesSource, /\.tracking-voyage-card,[\s\S]*background: var\(--tracking-surface\)/);
  assert.doesNotMatch(stylesSource, /#06131d|#0b1b27|#102635|#071722/);
});

test('tracking endpoint uses pg safely and returns the dashboard payload shape', () => {
  assert.match(endpointSource, /import \{ Pool \} from "pg"/);
  assert.match(endpointSource, /path: "\/api\/v1\/voyage\/tracking\/\*"/);
  assert.match(endpointSource, /decodeURIComponent\(encodedParam\)/);
  assert.match(endpointSource, /SELECT \* FROM voyages_tracking WHERE contract_ref = \$1 LIMIT 1/);
  assert.doesNotMatch(endpointSource, /"contractRef"/);
  assert.match(endpointSource, /contract:/);
  assert.match(endpointSource, /live:/);
  assert.match(endpointSource, /milestones:/);
  assert.match(endpointSource, /timeline:/);
  assert.doesNotMatch(endpointSource, /password|api_key|secret/i);
});

test('incremental schema preserves applied migrations and adds an auditable event stream', () => {
  assert.match(migrationSource, /ALTER TABLE "voyages"/);
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS "contract_ref"/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS "voyage_tracking_events"/);
  assert.match(migrationSource, /voyage_tracking_events_timeline_idx/);
  assert.match(norSource, /NOR_POD_TENDERED/);
  assert.match(norSource, /nor_pod_tendered_at/);
});
