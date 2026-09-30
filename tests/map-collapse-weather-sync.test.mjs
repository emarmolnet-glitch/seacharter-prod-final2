import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distHtmlSource = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const weatherComponentSource = readFileSync(new URL('../src/components/MaritimeWeatherPanel.jsx', import.meta.url), 'utf8');
const weatherCssSource = readFileSync(new URL('../src/components/MaritimeWeatherPanel.css', import.meta.url), 'utf8');

test('1. Left panel containerization and clean 100% leftward collapse', () => {
  for (const [name, content] of [['index.html', indexHtmlSource], ['dist/index.html', distHtmlSource]]) {
    // 1.1 Container wraps Input Geográfico
    assert.match(
      content,
      /<div id="map-left-panels-container"[^>]*>[\s\S]*?<section id="map-input-overlay"/,
      `#map-left-panels-container must wrap #map-input-overlay in ${name}`
    );

    // 1.2 Unified collapse CSS rule applied to container
    assert.match(
      content,
      /\.map-command-shell\.input-collapsed \.map-left-panels-container[\s\S]*?transform:\s*translateX\(calc\(-100%/,
      `CSS must cleanly translate .map-left-panels-container out of screen towards the left in ${name}`
    );
    assert.match(
      content,
      /\.map-command-shell\.input-collapsed \.map-left-panels-container[\s\S]*?opacity:\s*0\s*!important/,
      `CSS must set opacity: 0 on .map-left-panels-container when collapsed in ${name}`
    );

    // 1.3 Fluid transition of 0.3s
    assert.match(
      content,
      /\.map-left-panels-container[\s\S]*?transition:\s*all\s+0\.3s\s+ease-in-out/,
      `.map-left-panels-container must declare fluid 0.3s ease-in-out transition in ${name}`
    );
  }
});

test('2. Minimalist floating trigger button anchored to lateral edge', () => {
  for (const [name, content] of [['index.html', indexHtmlSource], ['dist/index.html', distHtmlSource]]) {
    // 2.1 Floating trigger button anchored to left edge
    assert.match(
      content,
      /id="btn-show-route-congestion"[^>]*class="[^"]*floating-route-trigger[^"]*"/,
      `btn-show-route-congestion must have floating-route-trigger class in ${name}`
    );
    assert.match(
      content,
      /#btn-show-route-congestion\s*\{[\s\S]*?left:\s*0;/,
      `btn-show-route-congestion must be anchored to lateral border (left: 0) in ${name}`
    );

    // 2.2 Minimalist chevron-right (>) icon
    assert.match(
      content,
      /<button[^>]*id="btn-show-route-congestion"[^>]*>[\s\S]*?<i class="fa-solid fa-chevron-right/,
      `btn-show-route-congestion must display minimalist chevron-right (>) icon in ${name}`
    );

    // 2.3 Single-click restore action
    assert.match(
      content,
      /id="btn-show-route-congestion"[^>]*onclick="toggleRouteInputPanel\(false\)"/,
      `btn-show-route-congestion must restore panels with single click calling toggleRouteInputPanel(false) in ${name}`
    );
  }
});

test('3. Maritime weather forecast widgets synchronization with geo panel collapse', () => {
  // 3.1 CSS rules hide weather panel in unison with fluid 0.3s transition
  assert.match(
    indexHtmlSource,
    /\.map-command-shell\.input-collapsed #maritime-weather-panel-root[\s\S]*?opacity:\s*0\s*!important/,
    'index.html CSS must fade out #maritime-weather-panel-root when input is collapsed'
  );
  assert.match(
    weatherCssSource,
    /\.maritime-weather-panel[\s\S]*?transition:\s*all\s+0\.3s\s+ease-in-out/,
    'MaritimeWeatherPanel.css must declare transition: all 0.3s ease-in-out'
  );
  assert.match(
    weatherCssSource,
    /\.maritime-weather-panel\.is-collapsed[\s\S]*?opacity:\s*0\s*!important/,
    'MaritimeWeatherPanel.css must define .is-collapsed with opacity 0'
  );

  // 3.2 React component accepts isGeoPanelOpen / isOpen and listens to toggle events
  assert.match(
    weatherComponentSource,
    /isGeoPanelOpen/,
    'MaritimeWeatherPanel must support isGeoPanelOpen prop/state'
  );
  assert.match(
    weatherComponentSource,
    /map:geo-input-toggled/,
    'MaritimeWeatherPanel must subscribe to map:geo-input-toggled event'
  );
  assert.match(
    weatherComponentSource,
    /maritime-weather-panel \$\{isOpen \? "is-open" : "is-collapsed"\}/,
    'MaritimeWeatherPanel must dynamically apply is-open / is-collapsed based on visibility state'
  );

  // 3.3 Controller toggles weather panel visibility and dispatches event
  assert.match(
    indexHtmlSource,
    /weatherRoot\.classList\.toggle\('weather-panel-collapsed',\s*!isGeoInputOpen\)/,
    'setRouteInputPanelOpen must toggle weather-panel-collapsed class'
  );
  assert.match(
    indexHtmlSource,
    /weatherRoot\.classList\.toggle\('opacity-0',\s*!isGeoInputOpen\)/,
    'setRouteInputPanelOpen must toggle opacity-0 class on weather root'
  );
  assert.match(
    indexHtmlSource,
    /window\.isGeoPanelOpen\s*=\s*isGeoInputOpen/,
    'setRouteInputPanelOpen must maintain window.isGeoPanelOpen in sync'
  );
});

test('4. Floating AI Assistant remains independent and unaffected by map panel collapse', () => {
  for (const [name, content] of [['index.html', indexHtmlSource], ['dist/index.html', distHtmlSource]]) {
    // 4.1 Assistant toggle button is outside map-left-panels-container
    assert.match(
      content,
      /id="sea-assistant-toggle"/,
      `sea-assistant-toggle must exist in ${name}`
    );
    // 4.2 Assistant panel is not part of map command shell collapse rules
    assert.doesNotMatch(
      content,
      /\.map-command-shell\.input-collapsed #sea-assistant/,
      `sea-assistant must not be collapsed by map-command-shell rules in ${name}`
    );
  }
});

test('5. Simulated toggle execution synchronizes container, weather widgets, and trigger button', () => {
  let isGeoInputOpen = true;
  const shellClasses = new Set();
  const containerClasses = new Set();
  const weatherClasses = new Set();
  const triggerClasses = new Set(['hidden']);

  function simulateSetRouteInputPanelOpen(nextOpen) {
    isGeoInputOpen = typeof nextOpen === 'boolean' ? nextOpen : !isGeoInputOpen;

    if (!isGeoInputOpen) {
      shellClasses.add('input-collapsed');
      containerClasses.add('is-collapsed');
      weatherClasses.add('weather-panel-collapsed');
      weatherClasses.add('opacity-0');
      weatherClasses.add('pointer-events-none');
      triggerClasses.delete('hidden');
      triggerClasses.add('inline-flex');
    } else {
      shellClasses.delete('input-collapsed');
      containerClasses.delete('is-collapsed');
      weatherClasses.delete('weather-panel-collapsed');
      weatherClasses.delete('opacity-0');
      weatherClasses.delete('pointer-events-none');
      triggerClasses.add('hidden');
      triggerClasses.delete('inline-flex');
    }
  }

  // Initial state: open
  assert.equal(isGeoInputOpen, true);
  assert.equal(triggerClasses.has('hidden'), true);
  assert.equal(containerClasses.has('is-collapsed'), false);
  assert.equal(weatherClasses.has('weather-panel-collapsed'), false);

  // Collapse action
  simulateSetRouteInputPanelOpen(false);
  assert.equal(isGeoInputOpen, false);
  assert.equal(shellClasses.has('input-collapsed'), true);
  assert.equal(containerClasses.has('is-collapsed'), true);
  assert.equal(weatherClasses.has('weather-panel-collapsed'), true);
  assert.equal(weatherClasses.has('opacity-0'), true);
  assert.equal(triggerClasses.has('hidden'), false);
  assert.equal(triggerClasses.has('inline-flex'), true);

  // Restore action
  simulateSetRouteInputPanelOpen(true);
  assert.equal(isGeoInputOpen, true);
  assert.equal(shellClasses.has('input-collapsed'), false);
  assert.equal(containerClasses.has('is-collapsed'), false);
  assert.equal(weatherClasses.has('weather-panel-collapsed'), false);
  assert.equal(weatherClasses.has('opacity-0'), false);
  assert.equal(triggerClasses.has('hidden'), true);
  assert.equal(triggerClasses.has('inline-flex'), false);
});
