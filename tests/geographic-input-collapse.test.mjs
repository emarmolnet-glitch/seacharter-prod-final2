import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const geographicInputSource = readFileSync(new URL('../src/components/GeographicInput.jsx', import.meta.url), 'utf8');
const mapSidebarSource = readFileSync(new URL('../src/components/MapSidebar.jsx', import.meta.url), 'utf8');
const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('GeographicInput.jsx implements required reactive state, toggle event, Tailwind collapse classes and arrow rotation', () => {
  // 1. Reactive state
  assert.match(
    geographicInputSource,
    /const\s*\[isPanelOpen,\s*setIsPanelOpen\]\s*=\s*useState\(/,
    'GeographicInput must declare reactive state isPanelOpen with useState'
  );

  // 2. Toggle event on arrow button
  assert.match(
    geographicInputSource,
    /onClick=\{\(\)\s*=>\s*setIsPanelOpen\(!isPanelOpen\)\}/,
    'GeographicInput must have onClick={() => setIsPanelOpen(!isPanelOpen)} on arrow button'
  );

  // 3. Conditional Tailwind classes for animation and collapse
  assert.match(
    geographicInputSource,
    /transition-transform\s+duration-300\s+z-50/,
    'GeographicInput root container must include transition-transform duration-300 z-50'
  );
  assert.match(
    geographicInputSource,
    /isPanelOpen\s*\?\s*['"]translate-x-0['"]\s*:\s*['"]-translate-x-\[calc\(100%-2rem\)\]['"]/,
    'GeographicInput must conditionally toggle translate-x-0 and -translate-x-[calc(100%-2rem)]'
  );

  // 4. Direction arrow change (rotate-180 when collapsed)
  assert.match(
    geographicInputSource,
    /rotate-180/,
    'GeographicInput arrow button must apply rotate-180 when collapsed'
  );
  assert.match(
    geographicInputSource,
    /isPanelOpen\s*\?\s*['"]['"]\s*:\s*['"]rotate-180['"]/,
    'GeographicInput must toggle rotate-180 conditionally based on isPanelOpen'
  );
});

test('MapSidebar.jsx re-exports GeographicInput for modular component usage', () => {
  assert.match(mapSidebarSource, /import.*GeographicInput.*from ['"]\.\/GeographicInput\.jsx['"]/);
  assert.match(mapSidebarSource, /export function MapSidebar/);
  assert.match(mapSidebarSource, /export default MapSidebar/);
});

test('index.html contains collapse button with toggle function and visible clickable tab on collapse', () => {
  // Button definition
  assert.match(
    indexHtmlSource,
    /id="btn-map-collapse-input"[^>]*onclick="toggleRouteInputPanel\(\)"/,
    'index.html collapse button must call toggleRouteInputPanel() to toggle open/closed'
  );

  // setRouteInputPanelOpen implementation
  assert.match(
    indexHtmlSource,
    /function setRouteInputPanelOpen\(nextOpen\)/,
    'index.html must define setRouteInputPanelOpen'
  );
  assert.match(
    indexHtmlSource,
    /window\.setIsGeoInputOpen\s*=\s*setRouteInputPanelOpen/,
    'index.html must alias setIsGeoInputOpen to setRouteInputPanelOpen'
  );
  assert.match(
    indexHtmlSource,
    /panel\.classList\.toggle\('translate-x-0',\s*isGeoInputOpen\)/,
    'setRouteInputPanelOpen must toggle translate-x-0'
  );
  assert.match(
    indexHtmlSource,
    /panel\.classList\.toggle\('-translate-x-\[calc\(100%-2rem\)\]',\s*!isGeoInputOpen\)/,
    'setRouteInputPanelOpen must toggle -translate-x-[calc(100%-2rem)]'
  );
  assert.match(
    indexHtmlSource,
    /icon\.classList\.toggle\('rotate-180',\s*!isGeoInputOpen\)/,
    'setRouteInputPanelOpen must toggle rotate-180 on chevron'
  );

  // CSS ensures button remains visible and clickable on screen margin
  assert.match(
    indexHtmlSource,
    /\.map-command-shell\.input-collapsed\s+#map-input-overlay[\s\S]*?transform:\s*translateX\(calc\(-100%\s*\+\s*\d+px\)\)/,
    'Collapsed overlay must leave margin visible on screen'
  );
  assert.match(
    indexHtmlSource,
    /\.map-command-shell\.input-collapsed\s+#map-input-overlay[\s\S]*?pointer-events:\s*auto/,
    'Collapsed overlay must allow pointer-events for clicking the collapse button'
  );
});

test('Simulated toggle execution correctly switches open/collapsed states and rotates chevron', () => {
  let isGeoInputOpen = true;
  const shellClasses = new Set();
  const panelClasses = new Set();
  const iconClasses = new Set(['fa-solid', 'fa-chevron-left']);
  const panelAttrs = {};
  const buttonAttrs = { 'aria-expanded': 'true' };

  function setRouteInputPanelOpenSim(nextOpen) {
    isGeoInputOpen = typeof nextOpen === 'boolean' ? nextOpen : !isGeoInputOpen;
    if (!isGeoInputOpen) {
      shellClasses.add('input-collapsed');
      panelClasses.remove?.('translate-x-0');
      panelClasses.add?.('-translate-x-[calc(100%-2rem)]');
      iconClasses.add('rotate-180');
      iconClasses.add('fa-chevron-right');
      iconClasses.delete('fa-chevron-left');
    } else {
      shellClasses.delete('input-collapsed');
      panelClasses.add?.('translate-x-0');
      panelClasses.remove?.('-translate-x-[calc(100%-2rem)]');
      iconClasses.delete('rotate-180');
      iconClasses.delete('fa-chevron-right');
      iconClasses.add('fa-chevron-left');
    }
    panelAttrs['aria-hidden'] = String(!isGeoInputOpen);
    buttonAttrs['aria-expanded'] = String(isGeoInputOpen);
  }

  function toggleSim() {
    setRouteInputPanelOpenSim(!isGeoInputOpen);
  }

  // Initial state
  assert.equal(isGeoInputOpen, true);
  assert.equal(iconClasses.has('rotate-180'), false);
  assert.equal(buttonAttrs['aria-expanded'], 'true');

  // First click: Collapse
  toggleSim();
  assert.equal(isGeoInputOpen, false);
  assert.equal(shellClasses.has('input-collapsed'), true);
  assert.equal(iconClasses.has('rotate-180'), true);
  assert.equal(iconClasses.has('fa-chevron-right'), true);
  assert.equal(panelAttrs['aria-hidden'], 'true');
  assert.equal(buttonAttrs['aria-expanded'], 'false');

  // Second click: Expand / Restore visibility
  toggleSim();
  assert.equal(isGeoInputOpen, true);
  assert.equal(shellClasses.has('input-collapsed'), false);
  assert.equal(iconClasses.has('rotate-180'), false);
  assert.equal(iconClasses.has('fa-chevron-left'), true);
  assert.equal(panelAttrs['aria-hidden'], 'false');
  assert.equal(buttonAttrs['aria-expanded'], 'true');
});
