import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const redirectsSource = await readFile(new URL('../_redirects', import.meta.url), 'utf8');
const verifySource = await readFile(new URL('../netlify/functions/verify-connection.ts', import.meta.url), 'utf8');
const dedicatedVerifySource = await readFile(new URL('../netlify/functions/databridge-verify-connection.ts', import.meta.url), 'utf8');
const persistedStateSource = await readFile(new URL('../netlify/functions/databridge-connection-state.ts', import.meta.url), 'utf8');

test('server-side verification falls back to the deployed Data Bridge origin', () => {
  for (const source of [verifySource, dedicatedVerifySource]) {
    assert.match(source, /DEFAULT_DATA_BRIDGE_ORIGIN = "https:\/\/calm-shortbread-55bcfc\.netlify\.app"/);
    assert.match(source, /DATA_BRIDGE_PROXY_ORIGIN/);
    assert.match(source, /signal: AbortSignal\.timeout\(15_000\)/);
    assert.doesNotMatch(source, /API secret is not configured|Introduce el API Secret/);
    assert.match(source, /\.\.\.\([^\n]+ \? \{ Authorization: `Bearer \$\{[^}]+\}` \} : \{\}\)/);
  }
});

test('explicit Data Bridge actions bypass only the local network interceptor wrapper', () => {
  const clientStart = indexSource.indexOf("const DATA_BRIDGE_RECEIVE_CORE_DATA_URL = '/api/databridge/receive-core-data';");
  const clientEnd = indexSource.indexOf('const DATA_BRIDGE_VESSEL_BATCH_SIZE = 50;', clientStart);
  const clientSource = indexSource.slice(clientStart, clientEnd);
  const verifyStart = indexSource.indexOf('async function verifyDataBridgeConnection');
  const verifyEnd = indexSource.indexOf('/**', verifyStart);
  const frontendVerifySource = indexSource.slice(verifyStart, verifyEnd);

  assert.match(clientSource, /window\.__coreProNativeFetch \|\| fetch/);
  assert.match(frontendVerifySource, /window\.__coreProNativeFetch \|\| window\.fetch/);
  assert.match(frontendVerifySource, /payload\?\.status === 'connected' \|\| payload\?\.success === true/);
});

test('connection indicator restores the persisted verified state without exposing browser secrets', () => {
  assert.match(indexSource, /DATA_BRIDGE_VERIFIED_SESSION_KEY/);
  assert.match(indexSource, /DATA_BRIDGE_CONNECTION_STATE_ENDPOINT = '\/api\/databridge-connection-state'/);
  assert.match(indexSource, /DATA_BRIDGE_CONNECTION_STATE_FUNCTION_ENDPOINT = '\/\.netlify\/functions\/databridge-connection-state'/);
  assert.match(indexSource, /response\.status === 404[\s\S]*DATA_BRIDGE_CONNECTION_STATE_FUNCTION_ENDPOINT/);
  assert.match(indexSource, /function restorePersistentDataBridgeConnection\(\)/);
  assert.match(indexSource, /await verifyDataBridgeConnection\(null, \{ silent: true, restoring: true \}\)/);
  assert.match(indexSource, /function setDataBridgeVerifiedConnection\(isVerified\)/);
  assert.match(indexSource, /setDataBridgeVerifiedConnection\(true\)/);
  assert.match(indexSource, /setDataBridgeVerifiedConnection\(false\)/);
  assert.match(indexSource, /const isConnected = getVerifiedDataBridgeTimestamp\(\) > 0/);
  assert.doesNotMatch(indexSource, /const isConnected = manualExternalMode && Boolean\(getStoredDataBridgeToken\(\)\)/);
});

test('verified Data Bridge state is persisted in Netlify Database AppConfig', () => {
  assert.match(verifySource, /appConfig/);
  assert.match(verifySource, /DATA_BRIDGE_CONNECTION_CONFIG_KEY = "databridge_connection_state"/);
  assert.match(verifySource, /onConflictDoUpdate/);
  assert.match(verifySource, /persistDataBridgeConnectionState\(true\)/);
  assert.doesNotMatch(verifySource, /persistDataBridgeConnectionState\(false\)/);
  assert.match(persistedStateSource, /ensureApplicationSchema\(\)/);
  assert.match(persistedStateSource, /\.from\(appConfig\)/);
  assert.doesNotMatch(persistedStateSource, /export const config|path:/);
  assert.match(persistedStateSource, /searchParams\.has\("refresh"\)/);
  assert.match(persistedStateSource, /ttlMs: 10 \* 1000/);
  assert.doesNotMatch(persistedStateSource, /secret|token|authorization/i);
});

test('connected Data Bridge menu action opens the deployment root', () => {
  assert.match(indexSource, /resolveViteEnvValue\(VITE_ENV\.VITE_DATA_BRIDGE_FRONTEND_URL, VITE_ENV\.VITE_DATA_BRIDGE_URL\)/);
  assert.match(indexSource, /return `\$\{url\.origin\}\/`/);
  assert.match(indexSource, /function openDataBridgeDashboard\(\) \{\s*window\.open\(DATA_BRIDGE_FRONTEND_URL, '_blank', 'noopener'\);\s*\}/);
  assert.match(indexSource, /id="btn-toggle-databridge"[^>]+onclick="openDataBridgeDashboard\(\)/);
  assert.match(indexSource, /id="databridge-connection-dot"/);
});

test('Data Bridge starts directly with HTTP polling and never initializes WebSocket', () => {
  assert.match(indexSource, /id="databridge-http-polling"/);
  assert.match(indexSource, /DATA_BRIDGE_HTTP_POLL_ENDPOINT = DATA_BRIDGE_CONNECTION_STATE_ENDPOINT/);
  assert.match(indexSource, /response\.headers\.get\('content-type'\)\?\.includes\('application\/json'\)/);
  assert.match(indexSource, /payload\?\.success === true/);
  assert.match(indexSource, /typeof payload\.connection\.connected === 'boolean'/);
  assert.match(indexSource, /payload\.connection\.connected \? 'connected' : 'disconnected'/);
  assert.match(indexSource, /DATA_BRIDGE_HTTP_POLL_INTERVAL_MS = 10_000/);
  assert.match(indexSource, /function startDataBridgeHttpPolling\(options = \{\}\)/);
  assert.match(indexSource, /window\.setTimeout\([\s\S]*DATA_BRIDGE_HTTP_POLL_INTERVAL_MS/);
  assert.match(indexSource, /window\.clearTimeout\(dataBridgeHttpPollingTimer\)/);
  assert.match(indexSource, /await restorePersistentDataBridgeConnection\(\);\s*startDataBridgeHttpPolling\(\{ immediate: true \}\)/);
  assert.match(indexSource, /function activateDataBridgeLiveTracking[\s\S]*startDataBridgeHttpPolling\(\)/);
  assert.match(indexSource, /function deactivateDataBridgeLiveTracking[\s\S]*transport: 'http-polling'/);
  assert.match(indexSource, /window\.addEventListener\('RADAR_GLOBAL_STATE_CHANGED'/);
  assert.match(indexSource, /window\.addEventListener\('pagehide', cleanupDataBridgeNorTransport\)/);
  assert.match(indexSource, /window\.addEventListener\('connection-status:unmount', cleanupDataBridgeNorTransport\)/);
  assert.match(indexSource, /window\.addEventListener\('pageshow',[\s\S]*event\.persisted[\s\S]*startDataBridgeHttpPolling\(\{ immediate: true \}\)/);
  assert.doesNotMatch(indexSource, /new WebSocket|DATA_BRIDGE_WS_URL|shouldUseDataBridgeWebSocket|wss?:\/\//);
  assert.doesNotMatch(indexSource, /route-position|databridge:route-position/);
});

test('Data Bridge header uses corporate states without saturated red fills', () => {
  assert.match(indexSource, /data-state="fallback"/);
  assert.match(indexSource, /--connection-accent: #3B6480/);
  assert.match(indexSource, /--connection-accent: #0F766E/);
  assert.match(indexSource, /secure: 'SYNC: ACTIVE'/);
  assert.match(indexSource, /fallback: 'SYNC HTTP · 10S'/);
  assert.match(indexSource, /updateDataBridgeTransportStatus\('connected'\)/);
  assert.match(indexSource, /revalidateDataBridgeConnectionState/);
  assert.match(indexSource, /--connection-accent: #64748B/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf('.connection-status-bar {'), indexSource.indexOf('@keyframes connectionPipeFlow')), /#DC2626|#991B1B|background:\s*[^;]*(red|rose|pink)/i);
});

test('polling and matching requests are protected against duplicate in-flight calls', () => {
  assert.match(indexSource, /window\.matchingLocalInFlightRequests = window\.matchingLocalInFlightRequests \|\| new Map\(\)/);
  assert.match(indexSource, /if \(existingRequest\) return existingRequest/);
  assert.match(indexSource, /if \(window\.openShipsRadarPollingActive\) return/);
  assert.match(indexSource, /window\.openShipsRadarRequestInFlight/);
});

test('Netlify serves the SPA shell for internal browser routes', () => {
  assert.match(redirectsSource, /^\/\* \/index\.html 200\s*$/m);
});
