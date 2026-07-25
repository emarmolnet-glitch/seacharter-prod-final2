import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('getSafetyBadge renders dynamic Tailwind badges for PSC safety statuses', async () => {
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify function definition exists in index.html
  assert.match(indexSource, /function getSafetyBadge\s*\(/);
  assert.match(indexSource, /getSafetyBadge\s*=\s*getSafetyBadge/);

  // Extract getSafetyBadge function definition
  const startIdx = indexSource.indexOf('function getSafetyBadge(');
  assert.ok(startIdx !== -1, 'getSafetyBadge function declaration found in index.html');
  const assignIdx = indexSource.indexOf('getSafetyBadge = getSafetyBadge', startIdx);
  let funcCode = indexSource.slice(startIdx, assignIdx);
  // Trim trailing if (typeof window...
  funcCode = funcCode.slice(0, funcCode.lastIndexOf('}') + 1);

  const evalFunc = new Function(`${funcCode}; return getSafetyBadge;`)();

  // Test HIGH RISK / DETAINED
  const highRiskBadge = evalFunc('HIGH RISK');
  assert.match(highRiskBadge, /bg-red-50/);
  assert.match(highRiskBadge, /text-red-700/);
  assert.match(highRiskBadge, /border-red-200/);
  assert.match(highRiskBadge, /animate-pulse/);
  assert.match(highRiskBadge, /<svg/);
  assert.match(highRiskBadge, /HIGH RISK/);

  const detainedBadge = evalFunc('DETAINED');
  assert.match(detainedBadge, /bg-red-50/);
  assert.match(detainedBadge, /text-red-700/);
  assert.match(detainedBadge, /animate-pulse/);
  assert.match(detainedBadge, /DETAINED/);

  // Test MODERATE DEFICIENCIES
  const moderateBadge = evalFunc('MODERATE DEFICIENCIES');
  assert.match(moderateBadge, /bg-orange-50/);
  assert.match(moderateBadge, /text-orange-700/);
  assert.match(moderateBadge, /border-orange-200/);
  assert.match(moderateBadge, /<svg/);
  assert.match(moderateBadge, /MODERATE DEFICIENCIES/);

  // Test CLEAR / NO DEFICIENCIES
  const clearBadge = evalFunc('CLEAR');
  assert.match(clearBadge, /bg-emerald-50/);
  assert.match(clearBadge, /text-emerald-700/);
  assert.match(clearBadge, /border-emerald-200/);
  assert.match(clearBadge, /<svg/);
  assert.match(clearBadge, /CLEAR/);

  const noDefBadge = evalFunc('NO DEFICIENCIES');
  assert.match(noDefBadge, /bg-emerald-50/);
  assert.match(noDefBadge, /NO DEFICIENCIES/);

  // Base structure check
  const baseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold shadow-sm';
  assert.ok(highRiskBadge.includes(baseClasses), 'Contains base badge classes');
  assert.ok(moderateBadge.includes(baseClasses), 'Contains base badge classes');
  assert.ok(clearBadge.includes(baseClasses), 'Contains base badge classes');
});
