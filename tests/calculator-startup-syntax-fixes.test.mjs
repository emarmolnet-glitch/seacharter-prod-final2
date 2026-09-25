import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('1. SyntaxError fix: tceOwner is declared only once in runEngine scope', () => {
  const runEngineMatch = indexSource.match(/function runEngine\(\) \{([\s\S]*?)\n\s*function/);
  assert.ok(runEngineMatch, 'runEngine must exist in index.html');
  const runEngineBody = runEngineMatch[1];
  const tceOwnerDeclarations = runEngineBody.match(/(?:const|let|var)\s+tceOwner\b/g);
  assert.equal(tceOwnerDeclarations?.length, 1, 'tceOwner must be declared exactly once in runEngine');
});

test('2. ReferenceError fix: applyBunkerIndexData is exposed globally on window and safely callable in applyHydratedBunkers', () => {
  assert.match(indexSource, /window\.applyBunkerIndexData\s*=\s*applyBunkerIndexData;/, 'applyBunkerIndexData must be assigned to window');
  assert.match(indexSource, /const applyFn = typeof applyBunkerIndexData === 'function'/);
  assert.match(indexSource, /applyFn\(\{/);
});

test('3. No SyntaxError in entire index.html main script', () => {
  const startIdx = indexSource.indexOf('function runEngine() {');
  let openBraces = 0;
  let endIdx = -1;
  for (let i = startIdx; i < indexSource.length; i++) {
    if (indexSource[i] === '{') openBraces++;
    else if (indexSource[i] === '}') {
      openBraces--;
      if (openBraces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  assert.ok(endIdx > startIdx, 'Must find valid closing brace for runEngine');
  const runEngineCode = indexSource.slice(startIdx, endIdx);
  assert.doesNotThrow(() => {
    new Function(runEngineCode);
  }, 'runEngine must parse without any SyntaxError');
});
