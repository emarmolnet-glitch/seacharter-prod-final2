import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('matching radar button exposes idle and loading labels without frozen copy', () => {
  const componentStart = source.indexOf('window.RadarGlobalControl = (() => {');
  const componentEnd = source.indexOf('window.toggleLiveTracking', componentStart);
  const componentSource = source.slice(componentStart, componentEnd);
  assert.match(componentSource, /context === 'matching'/);
  assert.match(componentSource, /EJECUTAR BARRIDO RADAR/);
  assert.match(componentSource, /Escaneando zona\.\.\./);
  assert.match(componentSource, /timestamp\.hidden = isMatchingControl/);
  assert.match(componentSource, /window\.getMatchingRadarPolContext\?\.\(\)\.valid === true/);
  assert.match(componentSource, /isMatchingControl \? \(matchingPolReady \? 'live' : 'frozen'\) : state\.mode/);
});

test('matching radar fetches AIS and OpenShips then commits dynamic results', () => {
  const processorStart = source.indexOf('function processMatchingRadarResponse');
  const processorEnd = source.indexOf('window.processMatchingRadarResponse = processMatchingRadarResponse;', processorStart)
    + 'window.processMatchingRadarResponse = processMatchingRadarResponse;'.length;
  const processorSource = source.slice(processorStart, processorEnd);
  const handlerStart = source.indexOf('window.executeMatchingRadarSweep = async function');
  const handlerEnd = source.indexOf('window.startRadarLive = async function', handlerStart);
  const handlerSource = source.slice(handlerStart, handlerEnd);

  assert.match(handlerSource, /window\.addEventListener\('ais:matching-state-updated', captureMatchingState\)/);
  assert.match(handlerSource, /Promise\.all\(\[[\s\S]*window\.startRadarLive\(\{ source: 'matching-radar-sweep', refresh: true, radarContext \}\)/);
  assert.match(handlerSource, /window\.updateOpenShipsRadar\?\.\(\{ refreshGlobe: false, refresh: true, polContext, radarContext \}\)/);
  assert.match(handlerSource, /window\.aisMatchingExecutionState\.forceNextExecution = true/);
  assert.match(handlerSource, /calculateAndDisplayAisFreight\(\)/);
  assert.match(handlerSource, /latestMatchingDetail\?\.nearbyVessels/);
  assert.match(handlerSource, /processMatchingRadarResponse\(\{[\s\S]*openShipsVessels,[\s\S]*nearbyVessels/);

  assert.match(processorSource, /normalizeMatchingRadarCandidates\(\[\.\.\.polScopedAisVessels, \.\.\.openShipsVessels, \.\.\.predictiveVessels\]\)/);
  assert.match(processorSource, /window\.matchingRadarDataSources = \{/);
  assert.match(processorSource, /window\.matchingResultsState = \{[\s\S]*vessels: matches\.slice\(\)/);
  assert.match(processorSource, /window\.GlobalStore\.setRadarVessels\?\.\(matches, \{[\s\S]*source: 'matching-radar-sweep'/);
  assert.match(processorSource, /renderCachedMatchingResults\(matches, \{[\s\S]*allowPolOnly: true/);
  assert.match(processorSource, /resultSourceLabel: 'Ranking Radar AIS \/ OpenShips'/);
  assert.match(processorSource, /showDueDiligence: true/);
  assert.match(processorSource, /renderMatchingRadarSourceIntegrity\(sourceCounts, matches\.length, polContext\)/);
  assert.match(processorSource, /syncMatchingButtonWithCachedResults\?\.\(matches\.length\)/);
  assert.match(processorSource, /sort\(\(first, second\) =>/);
  assert.match(processorSource, /window\.expandMatchingResultsRanking\?\.\(\)/);
});

test('radar candidate normalization maps real vessels and removes duplicates', () => {
  const normalizerStart = source.indexOf('function normalizeMatchingRadarCandidates');
  const normalizerEnd = source.indexOf('window.normalizeMatchingRadarCandidates = normalizeMatchingRadarCandidates;', normalizerStart)
    + 'window.normalizeMatchingRadarCandidates = normalizeMatchingRadarCandidates;'.length;
  const normalizerSource = source.slice(normalizerStart, normalizerEnd);
  const windowMock = {};
  new Function('window', 'normalizeAiAisFilterMatch', normalizerSource)(windowMock, vessel => ({
    vessel: {
      imo: vessel.imo || '',
      mmsi: vessel.mmsi || '',
      vesselName: vessel.vesselName || '',
    },
    source: vessel.source,
  }));

  const matches = windowMock.normalizeMatchingRadarCandidates([
    { imo: 'IMO-1', vesselName: 'REAL ONE' },
    { imo: 'IMO-1', vesselName: 'REAL ONE DUPLICATE' },
    { mmsi: '222', vesselName: 'REAL TWO' },
  ]);

  assert.equal(matches.length, 2);
  assert.equal(matches[0].source, 'AIS_LIVE');
  assert.equal(matches[1].vessel.mmsi, '222');
});
