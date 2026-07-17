import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [coreProSource, endpointSource, iaReportsSource, sessionSyncSource, dataBridgeSource, mainSource, preloadSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/core-pro-frozen-report.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/ia-reports.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/session-sync.ts", import.meta.url), "utf8"),
  readFile(new URL("../public/databridge.html", import.meta.url), "utf8"),
  readFile(new URL("../main.js", import.meta.url), "utf8"),
  readFile(new URL("../preload.js", import.meta.url), "utf8"),
]);

test("Core PRO uploads the complete frozen report before continuing Data Bridge sync", () => {
  assert.match(coreProSource, /function generateSyncId\(\)/);
  assert.match(coreProSource, /function createCoreProDataBridgePayload\(vessels, syncId = generateSyncId\(\)\)/);
  assert.match(coreProSource, /format:\s*'v2',[\s\S]*source:\s*'Core PRO',[\s\S]*syncId,[\s\S]*vessels:/);
  assert.match(coreProSource, /fetch\('\/api\/core-pro-frozen-report'/);
  assert.match(coreProSource, /body:\s*JSON\.stringify\(payload\)/);
  assert.match(coreProSource, /createCoreProDataBridgePayload\(vesselsArray, reportData\?\.syncId \|\| generateSyncId\(\)\)/);
  assert.match(coreProSource, /const selectedAuditReport = createCoreProDataBridgePayload\([\s\S]*JSON\.parse\(JSON\.stringify\(vesselsToSend\)\)[\s\S]*saveCoreProFrozenReport\(selectedAuditReport\);\s*await syncCoreProMatchingReport\(selectedAuditReport\);/);
  assert.match(coreProSource, /body:\s*JSON\.stringify\(createCoreProDataBridgePayload\(batch, selectedAuditReport\.syncId\)\)/);
  assert.doesNotMatch(coreProSource, /seacharter\.matching\.export\.v1|core-pro-matching-selected/);
  assert.match(coreProSource, /await syncCoreProMatchingReport\(selectedAuditReport\);[\s\S]*prepareDataBridgeVesselsForSend/);
  assert.match(coreProSource, /response\.status !== 200/);
  assert.match(coreProSource, /Respuesta de persistencia del backend/);
  assert.match(coreProSource, /responsePayload\?\.syncId !== payload\.syncId/);
  assert.match(coreProSource, /persistedVessels\.length !== vesselsArray\.length/);

  const statusCheckIndex = coreProSource.indexOf("if (response.status !== 200)");
  const confirmationCheckIndex = coreProSource.indexOf("responsePayload?.syncId !== payload.syncId");
  const signalIndex = coreProSource.indexOf("emitCoreProLiveSync(responsePayload)");
  assert.ok(statusCheckIndex >= 0 && confirmationCheckIndex > statusCheckIndex && signalIndex > confirmationCheckIndex);
});

test("the backend preserves and returns the complete vessel array", () => {
  assert.match(endpointSource, /path:\s*"\/api\/core-pro-frozen-report"/);
  assert.match(endpointSource, /\.\.\.payload,[\s\S]*vessels:\s*payload\.vessels/);
  assert.match(endpointSource, /format:\s*"v2"/);
  assert.match(endpointSource, /source:\s*"Core PRO"/);
  assert.match(endpointSource, /syncId:[\s\S]*generateSyncId\(\)/);
  assert.match(endpointSource, /savedVessels\.length !== report\.vessels\.length/);
  assert.match(endpointSource, /MAX_REPORT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(endpointSource, /status:\s*413/);
  assert.match(endpointSource, /savedSync\.lastSyncData\.syncId !== report\.syncId/);
});

test("the compatibility session endpoint keeps the complete v2 payload", () => {
  assert.match(sessionSyncSource, /MAX_SYNC_PAYLOAD_BYTES = 10 \* 1024 \* 1024/);
  assert.match(sessionSyncSource, /lastSyncData\.format !== "v2"/);
  assert.match(sessionSyncSource, /last_sync_data\.syncId must be a non-empty string/);
  assert.match(sessionSyncSource, /const completeSyncData = \{[\s\S]*\.\.\.lastSyncData,[\s\S]*syncId,[\s\S]*vessels: lastSyncData\.vessels/);
  assert.match(sessionSyncSource, /lastSyncData: completeSyncData/);
  assert.match(sessionSyncSource, /savedSync\.lastSyncData\.syncId !== syncId/);
  assert.match(sessionSyncSource, /last_sync_data: savedSync\.lastSyncData/);
});

test("Data Bridge reads only the persisted frozen report endpoint", () => {
  assert.match(dataBridgeSource, /`\/api\/core-pro-frozen-report\?t=\$\{Date\.now\(\)\}`/);
  assert.match(dataBridgeSource, /'Cache-Control': 'no-cache, no-store, must-revalidate'/);
  assert.match(dataBridgeSource, /response\.status !== 200/);
  assert.match(dataBridgeSource, /Number\(payload\?\.vessel_count\) !== vessels\.length/);
  assert.match(dataBridgeSource, /fetchCoreProFrozenReport\(\)\.catch/);
});

test("critical report endpoints disable browser and CDN caching", () => {
  assert.match(endpointSource, /"Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"/);
  assert.match(endpointSource, /"Pragma": "no-cache"/);
  assert.match(endpointSource, /"Expires": "0"/);
  assert.match(iaReportsSource, /"Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"/);
  assert.match(iaReportsSource, /"Pragma": "no-cache"/);
  assert.match(iaReportsSource, /"Expires": "0"/);
  assert.match(dataBridgeSource, /new URLSearchParams\(\{ t: String\(Date\.now\(\)\) \}\)/);
  assert.match(dataBridgeSource, /clearIaAuditState\(\);[\s\S]*return this\.fetchReports\(false\)/);
  assert.match(dataBridgeSource, /await rehydrateIaAuditState\(payload\)/);
});

test("Live Sync signals only the committed report and triggers one backend read", () => {
  assert.match(coreProSource, /type:\s*'CORE_PRO_FROZEN_REPORT_COMMITTED'/);
  assert.match(coreProSource, /sendVesselsForAudit\(liveSyncSignal\)/);
  assert.match(mainSource, /webContents\.send\('recibir-auditoria', liveSyncSignal\)/);
  assert.match(preloadSource, /ipcRenderer\.send\('enviar-a-auditoria', liveSyncSignal\)/);
  assert.match(dataBridgeSource, /signal\?\.type !== 'CORE_PRO_FROZEN_REPORT_COMMITTED'/);
  assert.match(dataBridgeSource, /await fetchCoreProFrozenReport\(\)/);
});
