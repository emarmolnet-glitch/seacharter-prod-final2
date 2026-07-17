import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [coreProSource, endpointSource, dataBridgeSource, mainSource, preloadSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/core-pro-frozen-report.ts", import.meta.url), "utf8"),
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
  assert.match(coreProSource, /persistedVessels\.length !== vesselsArray\.length/);

  const statusCheckIndex = coreProSource.indexOf("if (response.status !== 200)");
  const countCheckIndex = coreProSource.indexOf("if (persistedVessels.length !== vesselsArray.length");
  const signalIndex = coreProSource.indexOf("emitCoreProLiveSync(responsePayload)");
  assert.ok(statusCheckIndex >= 0 && countCheckIndex > statusCheckIndex && signalIndex > countCheckIndex);
});

test("the backend preserves and returns the complete vessel array", () => {
  assert.match(endpointSource, /path:\s*"\/api\/core-pro-frozen-report"/);
  assert.match(endpointSource, /\.\.\.payload,[\s\S]*vessels:\s*payload\.vessels/);
  assert.match(endpointSource, /format:\s*"v2"/);
  assert.match(endpointSource, /source:\s*"Core PRO"/);
  assert.match(endpointSource, /syncId:[\s\S]*generateSyncId\(\)/);
  assert.match(endpointSource, /savedVessels\.length !== report\.vessels\.length/);
  assert.match(endpointSource, /MAX_REPORT_BYTES = 50 \* 1024 \* 1024/);
  assert.match(endpointSource, /status:\s*413/);
});

test("Data Bridge reads only the persisted frozen report endpoint", () => {
  assert.match(dataBridgeSource, /fetch\('\/api\/core-pro-frozen-report'/);
  assert.match(dataBridgeSource, /response\.status !== 200/);
  assert.match(dataBridgeSource, /Number\(payload\?\.vessel_count\) !== vessels\.length/);
  assert.match(dataBridgeSource, /fetchCoreProFrozenReport\(\)\.catch/);
});

test("Live Sync signals only the committed report and triggers one backend read", () => {
  assert.match(coreProSource, /type:\s*'CORE_PRO_FROZEN_REPORT_COMMITTED'/);
  assert.match(coreProSource, /sendVesselsForAudit\(liveSyncSignal\)/);
  assert.match(mainSource, /webContents\.send\('recibir-auditoria', liveSyncSignal\)/);
  assert.match(preloadSource, /ipcRenderer\.send\('enviar-a-auditoria', liveSyncSignal\)/);
  assert.match(dataBridgeSource, /signal\?\.type !== 'CORE_PRO_FROZEN_REPORT_COMMITTED'/);
  assert.match(dataBridgeSource, /await fetchCoreProFrozenReport\(\)/);
});
