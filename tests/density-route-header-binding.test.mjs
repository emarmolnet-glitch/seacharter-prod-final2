import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bindingStart = source.indexOf('const formatAisHeaderDate =');
const bindingEnd = source.indexOf('// Search the list of detected vessels', bindingStart);
const bindingSource = source.slice(bindingStart, bindingEnd);

test('density route header renders canonical laycan and cancelling dates', () => {
  assert.ok(bindingStart >= 0 && bindingEnd > bindingStart);
  assert.match(bindingSource, /window\.SeaCharterStore\?\.getState\?\.\(\)/);
  assert.match(bindingSource, /voyageState\.laycanDate \|\| voyageState\.laydays \|\| voyageState\.laycan\?\.laydays/);
  assert.match(bindingSource, /voyageState\.cancellingDate \|\| voyageState\.cancelling \|\| voyageState\.laycan\?\.cancelling/);
  assert.match(bindingSource, /laycanBox\.innerText = formatAisHeaderDate\(laycanStart\)/);
  assert.match(bindingSource, /cancelBox\.innerText = formatAisHeaderDate\(cancelling\)/);
});

test('density route header subscribes to live route and date changes', () => {
  assert.match(bindingSource, /window\.SeaCharterStore\?\.subscribe\?\.\(/);
  assert.match(bindingSource, /\[state\.pol, state\.pod, state\.laycanDate, state\.cancellingDate, state\.laydays, state\.cancelling\]/);
  assert.match(bindingSource, /\(\) => window\.updateAisDetectedVesselsRoute\(\)/);
});

test('density route header repaints immediately after a voyage store update', () => {
  const elements = new Map([
    ['port-pol', { value: '' }],
    ['port-pod', { value: '' }],
    ['ais-detected-vessels-pol-box', { innerText: '' }],
    ['ais-detected-vessels-pod-box', { innerText: '' }],
    ['ais-loading-day-laycan-box', { innerText: '' }],
    ['ais-arrival-deadline-box', { innerText: '' }],
  ]);
  let voyageState = {
    pol: 'Bilbao',
    pod: 'Rotterdam',
    laycanDate: '2026-08-12',
    cancellingDate: '2026-08-18',
  };
  let storeListener = null;
  const windowMock = {
    SeaCharterStore: {
      getState: () => voyageState,
      subscribe: (_selector, listener) => {
        storeListener = listener;
      },
    },
  };
  const documentMock = { getElementById: (id) => elements.get(id) || null };

  new Function('window', 'document', bindingSource)(windowMock, documentMock);
  windowMock.updateAisDetectedVesselsRoute();

  assert.equal(elements.get('ais-loading-day-laycan-box').innerText, '12/08/2026');
  assert.equal(elements.get('ais-arrival-deadline-box').innerText, '18/08/2026');

  voyageState = { ...voyageState, laycanDate: '2026-08-14', cancellingDate: '2026-08-21' };
  storeListener();

  assert.equal(elements.get('ais-loading-day-laycan-box').innerText, '14/08/2026');
  assert.equal(elements.get('ais-arrival-deadline-box').innerText, '21/08/2026');
});

test('density route header formats ISO dates without timezone drift', () => {
  assert.match(bindingSource, /const isoMatch = normalized\.match/);
  assert.match(bindingSource, /\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)/);
  assert.match(bindingSource, /return `\$\{isoMatch\[3\]\}\/\$\{isoMatch\[2\]\}\/\$\{isoMatch\[1\]\}`/);
  assert.match(bindingSource, /timeZone: 'UTC'/);
});
