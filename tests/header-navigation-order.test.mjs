import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function readFunctionSource(functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  const end = source.indexOf(`function ${nextFunctionName}`, start);
  assert.notEqual(start, -1, `${functionName} must exist`);
  assert.notEqual(end, -1, `${nextFunctionName} must follow ${functionName}`);
  return source.slice(start, end);
}

test('header modules use the required visual order and stable text identifiers', () => {
  const modulesStart = source.indexOf('const PRIMARY_MODULES = [');
  const modulesEnd = source.indexOf('];', modulesStart) + 2;
  const primaryModulesSource = source.slice(modulesStart, modulesEnd);

  assert.equal(primaryModulesSource, `const PRIMARY_MODULES = [
            { id: 'map', label: 'Mapa' },
            { id: 'estimator', label: 'Calculadora' },
            { id: 'decisiones', label: 'Decisiones' },
            { id: 'tracking', label: 'Tracking', presentation: 'dialog' },
            { id: 'ais', label: 'Densidad' },
            { id: 'matching', label: 'Coincidencia' },
            { id: 'gencon', label: 'Editor' },
            { id: 'auditor', label: 'Auditoría' },
        ];`);
  assert.doesNotMatch(primaryModulesSource, /\[[0-9]+\]|id:\s*[0-9]+/);
});

test('tracking uses the shared top-level navigation factory and dialog action', () => {
  const createButtonSource = readFunctionSource('createModuleButton', 'getPrimaryNavigationModules');

  assert.match(createButtonSource, /moduleConfig\.presentation === 'dialog'/);
  assert.match(createButtonSource, /window\.openTrackingLive\?\.\(\)/);
  assert.match(createButtonSource, /aria-haspopup', 'dialog'/);
  assert.match(createButtonSource, /aria-controls', 'tracking-live-overlay'/);
});

test('tab switching remains identifier-based and does not clear persisted matching state', () => {
  const switchTabSource = readFunctionSource('switchTab', 'closeMobileSessionMenu');

  assert.match(switchTabSource, /function switchTab\(tabId\)/);
  assert.match(switchTabSource, /document\.getElementById\(`view-\$\{tabId\}`\)/);
  assert.doesNotMatch(switchTabSource, /activeTab\s*===\s*[0-9]+|tabs\[[0-9]+\]|switchTab\([0-9]+\)/);
  assert.doesNotMatch(switchTabSource, /sessionStorage\.(?:clear|removeItem)|matchingRequest\s*=\s*null/);
});
