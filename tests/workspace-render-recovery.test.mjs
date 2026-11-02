import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('index.html', 'utf8');

test('all inline classic and module scripts parse, including full Data Bridge controller', () => {
  let scripts = 0;
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=|type=["']application\//i.test(match[1])) continue;
    const line = source.slice(0, match.index).split('\n').length;
    if (/type=["']module/i.test(match[1])) {
      const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: match[2], encoding: 'utf8' });
      assert.equal(result.status, 0, `Module at line ${line}: ${result.stderr}`);
    } else {
      assert.doesNotThrow(() => new vm.Script(match[2]), `Script at line ${line}`);
    }
    scripts++;
  }
  assert.ok(scripts > 10);
});

function view(id, classes = []) {
  const values = new Set(classes);
  return { id, hidden: true, classList: {
    contains: name => values.has(name),
    add: name => values.add(name),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle: (name, enabled) => enabled ? values.add(name) : values.delete(name)
  }, removeAttribute(name) { if (name === 'hidden') this.hidden = false; } };
}
function setup(views) {
  const start = source.indexOf('        function restoreWorkspaceVisibility(');
  const end = source.indexOf('        function switchTab(', start);
  const context = vm.createContext({ document: {
    querySelectorAll: () => views,
    getElementById: id => views.find(item => item.id === id)
  } });
  vm.runInContext(source.slice(start, end), context);
  return context.restoreWorkspaceVisibility;
}

test('missing active view recovers calculator and removes CSS and HTML hiding', () => {
  const estimator = view('view-estimator', ['hidden']);
  const decisions = view('view-decisiones', ['hidden']);
  assert.equal(setup([estimator, decisions])(), 'estimator');
  assert.equal(estimator.classList.contains('hidden'), false);
  assert.equal(estimator.classList.contains('active-block'), true);
  assert.equal(estimator.hidden, false);
  assert.equal(decisions.classList.contains('hidden'), true);
});

test('active decisions panel recovers without showing other views', () => {
  const estimator = view('view-estimator');
  const decisions = view('view-decisiones', ['active-block', 'hidden']);
  assert.equal(setup([estimator, decisions])(), 'decisiones');
  assert.equal(decisions.classList.contains('hidden'), false);
  assert.equal(decisions.classList.contains('active-block'), true);
  assert.equal(estimator.classList.contains('hidden'), true);
});

test('explicit reset recovers calculator from another module', () => {
  const estimator = view('view-estimator', ['hidden']);
  const map = view('view-map', ['active-block']);
  assert.equal(setup([estimator, map])('estimator'), 'estimator');
  assert.equal(map.classList.contains('active-block'), false);
  assert.equal(estimator.classList.contains('active-block'), true);
});
