import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('matching UI, send button, and export share renderedMatchingVessels', () => {
  assert.match(source, /const displayMatches = setRenderedMatchingVessels\(viableMatches, \{ source: 'matching-execution' \}\)/);
  assert.match(source, /const renderedMatches = setRenderedMatchingVessels\(matches, \{ source: 'matching-cache' \}\)/);
  assert.match(source, /function getDataBridgeTransmissionVessels\(\)[\s\S]*window\.renderedMatchingVessels/);
  assert.match(source, /function setDataBridgeTransmissionAvailability\(matchedVessels = getDataBridgeTransmissionVessels\(\)\)[\s\S]*const enabled = vessels\.length > 0[\s\S]*control\.disabled = !enabled/);
  assert.match(source, /async function exportSelectedMatchingToAudit\(\)[\s\S]*const renderedVessels = getDataBridgeTransmissionVessels\(\);[\s\S]*const vesselsToSend = JSON\.parse\(JSON\.stringify\(renderedVessels\)\)/);
  assert.doesNotMatch(source.slice(source.indexOf('async function exportSelectedMatchingToAudit()'), source.indexOf('window.exportSelectedMatchingToAudit')), /lastLocalMatchingAuditVessels|aesMatchingState|GlobalStore\.auditVessels|lastClassifiedVessels|getRawVessels/);
});

test('a cached table with 47 vessels enables transmission with the same count', () => {
  const button = {
    disabled: true,
    dataset: {},
    setAttribute(name, value) {
      this[name] = value;
    },
  };
  const resultsList = { dataset: {} };
  const window = {};
  const document = {
    getElementById(id) {
      return id === 'matching-results-list' ? resultsList : null;
    },
    querySelectorAll() {
      return [button];
    },
  };
  const start = source.indexOf('function getDataBridgeTransmissionVessels()');
  const end = source.indexOf('function updateMatchingExecutionSuccessStick', start);
  const api = new Function('window', 'document', `${source.slice(start, end)}; return { getDataBridgeTransmissionVessels, setRenderedMatchingVessels };`)(window, document);
  const visibleVessels = Array.from({ length: 47 }, (_, index) => ({ imo: String(9000000 + index) }));

  const rendered = api.setRenderedMatchingVessels(visibleVessels, { source: 'matching-cache' });

  assert.equal(rendered.length, 47);
  assert.equal(api.getDataBridgeTransmissionVessels().length, 47);
  assert.equal(resultsList.dataset.matchingResultCount, '47');
  assert.equal(button.disabled, false);
});
