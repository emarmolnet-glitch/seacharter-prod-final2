import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const filterSource = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');

function loadDisplayHelpers() {
  const start = indexSource.indexOf('function normalizeMatchingSourceMetadata');
  const end = indexSource.indexOf('function normalizeAiAisFilterMatch', start);
  assert.ok(start >= 0 && end > start);
  const windowMock = { matchingStrictTechnicalFilter: false };
  return new Function('window', `${indexSource.slice(start, end)}; return {
    isPendingLiveRadarAuditCandidate,
    getMatchingFleetSegment,
    orderMatchingVesselsForDisplay,
    renderMatchingFleetSegmentHeader
  };`)(windowMock);
}

test('matching hydrates Laydays and Cancelling on initial mount', () => {
  assert.match(indexSource, /\(state\) => \[state\.pol, state\.pod, state\.laycanDate, state\.cancellingDate, state\.laydays, state\.cancelling, state\.laycan\?\.laydays, state\.laycan\?\.cancelling\]/);
  assert.match(indexSource, /const hydrateMatchingRouteSummaryOnMount = \(\) => \{/);
  assert.match(indexSource, /hydrateMatchingRouteSummaryOnMount\(\);[\s\S]*requestAnimationFrame\?\.\(hydrateMatchingRouteSummaryOnMount\)/);
});

test('live radar vessels without DWT remain visible as pending audit', () => {
  const helpers = loadDisplayHelpers();
  const pendingLive = {
    source: 'DATALASTIC_AIS',
    vessel: { vesselName: 'RADAR CONTACT', dwt: null },
    ais: { currentDistanceToLoadPort: 18 },
  };

  assert.equal(helpers.isPendingLiveRadarAuditCandidate(pendingLive), true);
  assert.match(indexSource, /status: 'PENDING_AUDIT', label: 'DWT pendiente de auditar'/);
  assert.match(indexSource, /DWT pendiente de auditar/);
  assert.match(indexSource, /En radar · Telemetría real/);
  assert.match(filterSource, /const telemetryVisibleWithoutDwt = isLiveRadarTelemetry && !hasVerifiedDwt && hasVerifiedVesselType/);
  assert.match(filterSource, /match\.audit\?\.operationallyEligible === true \|\| match\.audit\?\.telemetryVisible === true/);
});

test('filter-off display groups live before historical and sorts each segment by POL proximity', () => {
  const helpers = loadDisplayHelpers();
  const candidates = [
    { source: 'DATABRIDGE', vessel: { dwt: 12000 }, ais: { currentDistanceToLoadPort: 5 } },
    { source: 'DATALASTIC_AIS', vessel: { dwt: null }, ais: { currentDistanceToLoadPort: 40 } },
    { source: 'AIS_LIVE', vessel: { dwt: 11000 }, ais: { currentDistanceToLoadPort: 12 } },
    { source: 'DATABRIDGE', vessel: { dwt: 13000 }, ais: { currentDistanceToLoadPort: 70 } },
  ];
  const ordered = helpers.orderMatchingVesselsForDisplay(candidates, false);

  assert.deepEqual(ordered.map(helpers.getMatchingFleetSegment), ['LIVE', 'LIVE', 'HISTORICAL', 'HISTORICAL']);
  assert.deepEqual(ordered.map(item => item.ais.currentDistanceToLoadPort), [12, 40, 5, 70]);
  assert.match(helpers.renderMatchingFleetSegmentHeader(ordered[0], 0, ordered), /En radar \(Live\)/);
  assert.match(helpers.renderMatchingFleetSegmentHeader(ordered[2], 2, ordered), /En cartera \(Histórico\)/);
});
