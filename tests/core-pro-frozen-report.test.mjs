import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [coreProSource, endpointSource, healthCheckSource, iaReportsSource, sessionSyncSource, sessionSyncDatabaseSource, dataBridgeSource, corsSource, mainSource, preloadSource, netlifyConfigSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/core-pro-frozen-report.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/verify-connection.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/ia-reports.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/session-sync.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/session-sync.ts", import.meta.url), "utf8"),
  readFile(new URL("../public/databridge.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/_shared/cors.ts", import.meta.url), "utf8"),
  readFile(new URL("../main.js", import.meta.url), "utf8"),
  readFile(new URL("../preload.js", import.meta.url), "utf8"),
  readFile(new URL("../netlify.toml", import.meta.url), "utf8"),
]);

test("Core PRO uploads the complete frozen report before continuing Data Bridge sync", () => {
  assert.match(coreProSource, /function generateSyncId\(\)/);
  assert.match(coreProSource, /function createCoreProDataBridgePayload\(vessels, syncId = generateSyncId\(\)\)/);
  assert.match(coreProSource, /format:\s*'v2',[\s\S]*source:\s*'Core PRO',[\s\S]*syncId,[\s\S]*vessels:/);
  assert.match(coreProSource, /fetch\('\/api\/core-pro-frozen-report'/);
  assert.match(coreProSource, /body:\s*JSON\.stringify\(payload\)/);
  assert.match(coreProSource, /const vesselsWithCoordinates = vesselsArray\.map\(normalizeCoreProVesselCoordinates\)/);
  assert.match(coreProSource, /createCoreProDataBridgePayload\(vesselsWithCoordinates, reportData\?\.syncId \|\| reportData\?\.sync_id \|\| generateSyncId\(\)\)/);
  assert.match(coreProSource, /const selectedAuditReport = createCoreProDataBridgePayload\([\s\S]*JSON\.parse\(JSON\.stringify\(vesselsToSend\)\)[\s\S]*const persistedReport = await syncCoreProMatchingReport\(selectedAuditReport\);/);
  assert.doesNotMatch(coreProSource, /seacharter\.matching\.export\.v1|core-pro-matching-selected/);
  assert.doesNotMatch(coreProSource, /core_pro_frozen_report|saveCoreProFrozenReport|readValidatedCoreProFrozenReport/);
  assert.doesNotMatch(coreProSource, /createCoreProDataBridgePayload\(batch, selectedAuditReport\.syncId\)/);
  assert.match(coreProSource, /response\.status !== 200/);
  assert.match(coreProSource, /Respuesta de persistencia del backend/);
  assert.match(coreProSource, /responsePayload\?\.syncId !== payload\.syncId/);
  assert.match(coreProSource, /persistedVessels\.length !== vesselsArray\.length/);

  const statusCheckIndex = coreProSource.indexOf("if (response.status !== 200)");
  const confirmationCheckIndex = coreProSource.indexOf("responsePayload?.syncId !== payload.syncId");
  const signalIndex = coreProSource.indexOf("emitCoreProLiveSync(responsePayload)");
  assert.ok(statusCheckIndex >= 0 && confirmationCheckIndex > statusCheckIndex && signalIndex > confirmationCheckIndex);
});

test("the matching engine persists evaluated vessels before reporting completion", () => {
  assert.match(coreProSource, /const matches = deduplicatedMatches;[\s\S]*window\.lastMatchingEngineResults = matches;/);
  assert.match(coreProSource, /const currentSyncId = generateSyncId\(\);[\s\S]*source: 'Core PRO',[\s\S]*syncId: currentSyncId,[\s\S]*format: 'v2',[\s\S]*vessels: matches/);
  assert.match(coreProSource, /persistedMatchingReport = await syncCoreProMatchingReport\(persistencePayload\);/);
  assert.match(coreProSource, /window\.currentCoreProSyncId = currentSyncId;/);

  const engineFetchIndex = coreProSource.indexOf("fetch('/api/ai-ais-filter'");
  const engineStateIndex = coreProSource.indexOf("window.lastMatchingEngineResults = matches", engineFetchIndex);
  const persistenceIndex = coreProSource.indexOf("persistedMatchingReport = await syncCoreProMatchingReport(persistencePayload)", engineStateIndex);
  const completionIndex = coreProSource.indexOf("Auditoría completada.", persistenceIndex);
  assert.ok(engineFetchIndex >= 0 && engineStateIndex > engineFetchIndex && persistenceIndex > engineStateIndex && completionIndex > persistenceIndex);
});

test("the backend preserves and returns the complete vessel array", () => {
  assert.match(endpointSource, /path:\s*"\/api\/core-pro-frozen-report"/);
  assert.match(endpointSource, /normalizeSessionSyncVessels\(payload\.vessels\)/);
  assert.match(endpointSource, /format:\s*"v2"/);
  assert.match(endpointSource, /source:\s*"Core PRO"/);
  assert.match(endpointSource, /payload\.sync_id[\s\S]*generateSyncId\(\)/);
  assert.match(endpointSource, /savedVessels\.length !== report\.vessels\.length/);
  assert.match(endpointSource, /MAX_REPORT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(endpointSource, /status:\s*413/);
  assert.match(endpointSource, /getFleetRowBySyncId\(report\.syncId \|\| ""\)/);
  assert.match(endpointSource, /committedSync\?\.syncId !== report\.syncId/);
  assert.match(endpointSource, /syncId:\s*requestedSyncId \|\| null/);
});

test("the compatibility session endpoint keeps the complete v2 payload", () => {
  assert.match(sessionSyncSource, /MAX_SYNC_PAYLOAD_BYTES = 10 \* 1024 \* 1024/);
  assert.match(sessionSyncSource, /lastSyncData\.format !== "v2"/);
  assert.match(sessionSyncSource, /last_sync_data\.syncId must be a non-empty string/);
  assert.match(sessionSyncSource, /lastSyncData\.sync_id/);
  assert.match(sessionSyncSource, /const completeSyncData = \{[\s\S]*\.\.\.canonicalSyncData,[\s\S]*syncId,[\s\S]*vessels: normalizedVessels\.vessels/);
  assert.match(sessionSyncSource, /lastSyncData: completeSyncData/);
  assert.match(sessionSyncSource, /savedSync\.lastSyncData\.syncId !== syncId/);
  assert.match(sessionSyncSource, /last_sync_data: savedSync\.lastSyncData/);
});

test("session persistence writes the required relational sync id", () => {
  assert.match(sessionSyncDatabaseSource, /last_sync_data\.syncId must be a non-empty string/);
  assert.match(sessionSyncDatabaseSource, /INSERT INTO session_sync \(user_id, sync_id, last_sync_data, last_action_module, updated_at\)/);
  assert.match(sessionSyncDatabaseSource, /sync_id = EXCLUDED\.sync_id/);
  assert.match(sessionSyncDatabaseSource, /normalizeSessionSyncVessels\(input\.lastSyncData\.vessels\)/);
  assert.match(sessionSyncDatabaseSource, /return \{ \.\.\.vessel, latitude, longitude \}/);
  assert.match(sessionSyncDatabaseSource, /WHERE user_id = \$1 AND sync_id = \$2/);
});

test("Data Bridge reads only the persisted frozen report endpoint", () => {
  assert.match(dataBridgeSource, /CORE_PRO_PRODUCTION_ORIGIN = 'https:\/\/neon-seachartercorepro-4ce09d\.netlify\.app'/);
  assert.match(dataBridgeSource, /createCoreProApiUrl\('\/api\/core-pro-frozen-report'\)/);
  assert.match(dataBridgeSource, /if \(expectedSyncId\) url\.searchParams\.append\('sync_id', expectedSyncId\)/);
  assert.match(dataBridgeSource, /url\.searchParams\.append\('t', String\(Date\.now\(\)\)\)/);
  assert.match(dataBridgeSource, /fetch\(url\.toString\(\), \{/);
  assert.match(dataBridgeSource, /'Cache-Control': 'no-cache, no-store, must-revalidate'/);
  assert.match(dataBridgeSource, /response\.status !== 200/);
  assert.match(dataBridgeSource, /Number\(payload\?\.vessel_count\) !== vessels\.length/);
  assert.match(dataBridgeSource, /fetchCoreProFrozenReport\(\)\.catch/);
  assert.doesNotMatch(dataBridgeSource, /core_pro_frozen_report|localStorage|sessionStorage/);
});

test("critical report endpoints disable browser and CDN caching", () => {
  assert.match(endpointSource, /"Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"/);
  assert.match(endpointSource, /"Pragma": "no-cache"/);
  assert.match(endpointSource, /"Expires": "0"/);
  assert.match(iaReportsSource, /"Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"/);
  assert.match(iaReportsSource, /"Pragma": "no-cache"/);
  assert.match(iaReportsSource, /"Expires": "0"/);
  assert.match(dataBridgeSource, /createCoreProApiUrl\('\/api\/ia-reports'\)/);
  assert.match(dataBridgeSource, /url\.searchParams\.append\('sync_id', currentSyncId\)/);
  assert.match(dataBridgeSource, /url\.searchParams\.append\('t', String\(Date\.now\(\)\)\)/);
  assert.match(dataBridgeSource, /if \(!currentSyncId\) return \[\];/);
  assert.match(dataBridgeSource, /currentSyncId = nextSyncId;[\s\S]*await SyncService\.refresh\(\)/);
  assert.doesNotMatch(dataBridgeSource, /\/api\/ia-reports\?\$\{/);
  assert.doesNotMatch(dataBridgeSource, /\/api\/core-pro-frozen-report\?t=/);
  assert.doesNotMatch(dataBridgeSource, /return this\.fetchReports\(false\)/);
  assert.match(dataBridgeSource, /await rehydrateIaAuditState\(payload\)/);
});

test("central APIs dynamically allow Data Bridge production, previews, and localhost", () => {
  assert.match(corsSource, /https:\/\/neon-seachartercorepro-4ce09d\.netlify\.app/);
  assert.match(corsSource, /https:\/\/calm-shortbread-55bcfc\.netlify\.app/);
  assert.match(corsSource, /CORE_PRO_CORS_ORIGINS/);
  assert.match(corsSource, /deploy-preview-\[a-z0-9-\]\+--calm-shortbread-55bcfc/);
  assert.match(corsSource, /url\.hostname === "localhost"/);
  assert.match(corsSource, /headers\["Access-Control-Allow-Origin"\] = requestOrigin/);
  assert.doesNotMatch(corsSource, /"Access-Control-Allow-Origin": "\*"/);
  assert.doesNotMatch(corsSource, /: DEFAULT_ALLOWED_ORIGINS\[0\]/);
  assert.match(corsSource, /"Access-Control-Allow-Headers": "Content-Type, Authorization, Pragma, Cache-Control, X-Requested-With"/);
  assert.match(endpointSource, /createCorsHeaders\(req, "GET, POST, PUT, OPTIONS"\)/);
  assert.match(healthCheckSource, /createCorsHeaders\(req, "GET, POST, OPTIONS"\)/);
  assert.match(iaReportsSource, /createCorsHeaders\(req, "GET, OPTIONS"\)/);
  assert.match(endpointSource, /req\.method === "OPTIONS"[\s\S]*status: 204/);
  assert.match(healthCheckSource, /req\.method === "OPTIONS"[\s\S]*status: 204/);
  assert.match(iaReportsSource, /req\.method === "OPTIONS"[\s\S]*status: 204/);
});

test("Netlify static headers never override API CORS", () => {
  assert.doesNotMatch(netlifyConfigSource, /Access-Control-Allow-Origin/i);
  assert.doesNotMatch(netlifyConfigSource, /\[\[headers\]\][\s\S]*?for\s*=\s*["']\/api\//i);
});

test("Core PRO toasts stay below the header and support manual dismissal", () => {
  assert.doesNotMatch(coreProSource, /id="toast"[^>]*\bbottom-/);
  assert.match(coreProSource, /id="toast-close"[\s\S]*?onclick="dismissToast\(\)"/);
  assert.match(coreProSource, /header\.getBoundingClientRect\(\)\.bottom \+ 12/);
  assert.match(coreProSource, /new ResizeObserver\(updateToastPosition\)\.observe\(appHeader\)/);
});

test("Live Sync signals only the committed report and triggers one backend read", () => {
  assert.match(coreProSource, /type:\s*'CORE_PRO_FROZEN_REPORT_COMMITTED'/);
  assert.match(coreProSource, /syncId:\s*persistedReport\?\.syncId \|\| null/);
  assert.match(coreProSource, /sendVesselsForAudit\(liveSyncSignal\)/);
  assert.match(mainSource, /webContents\.send\('recibir-auditoria', liveSyncSignal\)/);
  assert.match(preloadSource, /ipcRenderer\.send\('enviar-a-auditoria', liveSyncSignal\)/);
  assert.match(dataBridgeSource, /signal\?\.type !== 'CORE_PRO_FROZEN_REPORT_COMMITTED'/);
  assert.match(dataBridgeSource, /await fetchCoreProFrozenReport\(signal\.syncId \|\| ''\)/);
});
