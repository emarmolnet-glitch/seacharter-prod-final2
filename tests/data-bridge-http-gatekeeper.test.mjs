import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function createClient(fetchImpl) {
  const start = indexSource.indexOf("const DATA_BRIDGE_RECEIVE_CORE_DATA_URL = '/api/databridge/receive-core-data';");
  const end = indexSource.indexOf('const DATA_BRIDGE_VESSEL_BATCH_SIZE = 50;', start);
  assert.ok(start >= 0 && end > start, 'Data Bridge HTTP client block must exist');

  const clientSource = indexSource
    .slice(start, end)
    .replace('const DATA_BRIDGE_RETRY_BASE_DELAY_MS = 300;', 'const DATA_BRIDGE_RETRY_BASE_DELAY_MS = 0;');
  let generatedSyncIds = 0;
  const context = vm.createContext({
    Response,
    fetch: fetchImpl,
    generateSyncId: () => `00000000-0000-4000-8000-${String(++generatedSyncIds).padStart(12, '0')}`,
    prepareDataBridgeVesselsForSend: (vessels) => ({
      validVessels: vessels,
      rejectedCount: 0,
      sourceCount: vessels.length,
    }),
    showToast: undefined,
    window: {},
    console,
    JSON,
    Map,
    Set,
    Math,
    Promise,
    setTimeout,
  });

  vm.runInContext(`${clientSource}\nglobalThis.__dataBridgeClient = { postDataBridgeReceiveVessels, postDataBridgeIaReport };`, context);
  return context.__dataBridgeClient;
}

function fleetRequest(payload) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

test('wraps existing fleet data with sync_id and type', async () => {
  let receivedUrl = '';
  let receivedPayload = null;
  const client = createClient(async (url, options) => {
    receivedUrl = url;
    receivedPayload = JSON.parse(options.body);
    return Response.json({ success: true }, { status: 200 });
  });

  const response = await client.postDataBridgeReceiveVessels(fleetRequest({ vessels: [{ imo: 1234567 }] }));
  const body = await response.json();

  assert.equal(receivedUrl, '/api/databridge/receive-core-data');
  assert.equal(receivedPayload.type, 'fleet');
  assert.equal(receivedPayload.sync_id, '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(receivedPayload.vessels, [{ imo: 1234567 }]);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.sync_id, receivedPayload.sync_id);
});

test('rejects every non-200 response even when fetch marks it ok', async () => {
  const client = createClient(async () => new Response(null, { status: 204 }));
  const response = await client.postDataBridgeReceiveVessels(fleetRequest({ vessels: [{ imo: 1234567 }] }));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.upstream_status, 204);
});

test('rejects HTTP 200 when success is not explicitly true', async () => {
  const client = createClient(async () => Response.json({ success: false }, { status: 200 }));
  const response = await client.postDataBridgeReceiveVessels(fleetRequest({ vessels: [{ imo: 1234567 }] }));

  assert.equal(response.status, 502);
  assert.equal((await response.json()).success, false);
});

test('retries rollback responses and preserves the same sync_id', async () => {
  const syncIds = [];
  const client = createClient(async (_url, options) => {
    syncIds.push(JSON.parse(options.body).sync_id);
    return syncIds.length < 3
      ? Response.json({ success: false }, { status: 500 })
      : Response.json({ success: true }, { status: 200 });
  });

  const response = await client.postDataBridgeReceiveVessels(fleetRequest({ vessels: [{ imo: 1234567 }] }));

  assert.equal(response.status, 200);
  assert.equal(syncIds.length, 3);
  assert.equal(new Set(syncIds).size, 1);
});

test('manual retry reuses the original in-memory sync_id', async () => {
  const syncIds = [];
  let successful = false;
  const client = createClient(async (_url, options) => {
    syncIds.push(JSON.parse(options.body).sync_id);
    return successful
      ? Response.json({ success: true }, { status: 200 })
      : Response.json({ success: false }, { status: 500 });
  });
  const request = fleetRequest({ created_at: '2026-07-18T12:00:00.000Z', vessels: [{ imo: 1234567 }] });

  const failedResponse = await client.postDataBridgeReceiveVessels(request);
  successful = true;
  const retriedResponse = await client.postDataBridgeReceiveVessels({
    ...request,
    body: JSON.stringify({ created_at: '2026-07-18T12:05:00.000Z', vessels: [{ imo: 1234567 }] }),
  });

  assert.equal(failedResponse.status, 500);
  assert.equal(retriedResponse.status, 200);
  assert.equal(new Set(syncIds).size, 1);
});

test('blocks ia_report until fleet has a strict 200 acknowledgement', async () => {
  const sentTypes = [];
  const client = createClient(async (_url, options) => {
    sentTypes.push(JSON.parse(options.body).type);
    return Response.json({ success: true }, { status: 200 });
  });
  const syncId = '00000000-0000-4000-8000-000000000099';

  await assert.rejects(
    client.postDataBridgeIaReport(syncId, { report: 'blocked' }),
    /confirmación 200 previa de fleet/,
  );
  assert.deepEqual(sentTypes, []);

  const fleetResponse = await client.postDataBridgeReceiveVessels(
    fleetRequest({ sync_id: syncId, vessels: [{ imo: 1234567 }] }),
  );
  assert.equal(fleetResponse.status, 200);

  const iaResponse = await client.postDataBridgeIaReport(syncId, { report: 'confirmed' });
  assert.equal(iaResponse.success, true);
  assert.deepEqual(sentTypes, ['fleet', 'ia_report']);
});
