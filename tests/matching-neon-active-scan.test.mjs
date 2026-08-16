import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, matchingLocalSource, scanResultsSource, aiFilterSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/scan-results.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8'),
]);

test('manual synchronization requests the strict latest scan_results snapshot', () => {
  const syncStart = indexSource.indexOf('async function syncMatchingCandidatesFromNeon');
  const syncEnd = indexSource.indexOf('window.syncMatchingCandidatesFromNeon', syncStart);
  const syncSource = indexSource.slice(syncStart, syncEnd);

  assert.match(syncSource, /requestMatchingLocal\('snapshot', \[\],/);
  assert.match(syncSource, /window\.currentCoreProSyncId = payload\.scanId/);
  assert.doesNotMatch(syncSource, /requestDataBridgeReadSync/);
});

test('fresh Neon synchronization is available without route or browser cache guards', () => {
  const buttonStart = indexSource.indexOf('function syncMatchingButtonWithCachedResults');
  const buttonEnd = indexSource.indexOf('window.syncMatchingButtonWithCachedResults', buttonStart);
  const buttonSource = indexSource.slice(buttonStart, buttonEnd);

  assert.match(buttonSource, /button\.disabled = !neonCandidatesAvailable/);
  assert.doesNotMatch(buttonSource, /button\.disabled =[^;]*hasActiveCalculation/);
  assert.doesNotMatch(buttonSource, /button\.disabled =[^;]*matchingSelectionPending/);
  assert.doesNotMatch(buttonSource, /button\.disabled =[^;]*count === 0/);
});

test('matching-local reads scan_results and never session_sync for synchronization', () => {
  assert.match(matchingLocalSource, /import \{ getLatestScanResults \} from "\.\.\/\.\.\/db\/scan-results\.js"/);
  assert.match(matchingLocalSource, /if \(operation === "snapshot"\)/);
  assert.match(matchingLocalSource, /const activeScan = await readLatestNeonScan\(matchingPayload\)/);
  assert.match(matchingLocalSource, /radarSnapshot:\s*activeScan\.vessels/);
  assert.doesNotMatch(matchingLocalSource, /session-sync|getLatestMatchingScan/);
});

test('latest scan query is isolated by scan_id and filters passenger vessel types for unitized cargo', () => {
  assert.match(scanResultsSource, /FROM scan_results/);
  assert.match(scanResultsSource, /GROUP BY scan_id/);
  assert.match(scanResultsSource, /ORDER BY latest_created_at DESC, scan_id DESC/);
  assert.match(scanResultsSource, /JOIN scan_results result ON result\.scan_id = scan\.scan_id/);
  assert.match(scanResultsSource, /ro\[ -\]\?ro\|passenger\|ferr\(y\|ies\)/);
  assert.match(scanResultsSource, /uniti\[sz\]ada\|big\\s\*bags\?/);
});

test('scan_results candidates retain live-position matching behavior', () => {
  assert.match(aiFilterSource, /NEON_\(\?:ACTIVE_SCAN\|SCAN_RESULTS\)/);
});
