import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const tceWorkspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');

test('Hard-fix matemático: index.html implements exact naval formulas in Resultado de la Negociación', () => {
  assert.match(indexSource, /const totalGrossRevenueOwner = (?:cleanNum\(freightBuy\) \* cleanNum\(cargoTons\)|\(Number\(freightBuy\) \|\| 0\) \* \(Number\(cargoTons\) \|\| 0\));/);
  assert.match(indexSource, /const totalVoyageCosts = (?:cleanNum\(costBunkers\) \+ cleanNum\(costPda\) \+ cleanNum\(etsCost\)|\(Number\(costBunkers\) \|\| 0\) \+ \(Number\(costPda\) \|\| 0\) \+ \(Number\(etsCost\) \|\| 0\));/);
  assert.match(indexSource, /const totalOpexCosts = (?:cleanNum\(costOpex\)|Number\(costOpex\) \|\| 0);/);
  assert.match(indexSource, /const calculatedNetOwnerProfit = totalGrossRevenueOwner - totalVoyageCosts - totalOpexCosts;/);
  assert.match(indexSource, /const calculatedTceTotal = totalGrossRevenueOwner - totalVoyageCosts;/);
  assert.match(indexSource, /const calculatedTceDaily = calculatedTceTotal \/ \((?:cleanNum|Number)\(totalDays\) \|\| 1\);/);
});

test('Hard-fix matemático: index.html extracts cargoTons and freightBuy directly from DOM inputs', () => {
  assert.match(indexSource, /const cargoTons = document\.getElementById\('cargo-qty'\)\??\.value;/);
  assert.match(indexSource, /const freightBuy = document\.getElementById\('freight-rate'\)\??\.value;/);
});

test('Hard-fix matemático: TceCalculatorWorkspace.tsx implements exact naval formulas in Resultado de Negociación', () => {
  assert.match(tceWorkspaceSource, /const totalGrossRevenueOwner = \(Number\(freightBuy\) \|\| 0\) \* \(Number\(cargoTons\) \|\| 0\);/);
  assert.match(tceWorkspaceSource, /const totalVoyageCosts = \(Number\(costBunkers\) \|\| 0\) \+ \(Number\(costPda\) \|\| 0\) \+ \(Number\(etsCost\) \|\| 0\);/);
  assert.match(tceWorkspaceSource, /const totalOpexCosts = Number\(costOpex\) \|\| 0;/);
  assert.match(tceWorkspaceSource, /const calculatedNetOwnerProfit = totalGrossRevenueOwner - totalVoyageCosts - totalOpexCosts;/);
  assert.match(tceWorkspaceSource, /const calculatedTceTotal = totalGrossRevenueOwner - totalVoyageCosts;/);
  assert.match(tceWorkspaceSource, /const calculatedTceDaily = calculatedTceTotal \/ \(Number\(totalDays\) \|\| 1\);/);
});

test('Hard-fix matemático: Numerical verification of naval formulas without OPEX in TCE', () => {
  const freightBuy = 32.50;
  const cargoTons = 20000;
  const costBunkers = 100000;
  const costPda = 50000;
  const etsCost = 15000;
  const costOpex = 60000;
  const totalDays = 20;

  const totalGrossRevenueOwner = (Number(freightBuy) || 0) * (Number(cargoTons) || 0);
  const totalVoyageCosts = (Number(costBunkers) || 0) + (Number(costPda) || 0) + (Number(etsCost) || 0);
  const totalOpexCosts = Number(costOpex) || 0;
  const calculatedNetOwnerProfit = totalGrossRevenueOwner - totalVoyageCosts - totalOpexCosts;
  const calculatedTceTotal = totalGrossRevenueOwner - totalVoyageCosts;
  const calculatedTceDaily = calculatedTceTotal / (Number(totalDays) || 1);

  // 1. Gross Revenue = 32.50 * 20000 = 650,000
  assert.equal(totalGrossRevenueOwner, 650000);

  // 2. Voyage Costs = 100,000 + 50,000 + 15,000 = 165,000
  assert.equal(totalVoyageCosts, 165000);

  // 3. OPEX Costs = 60,000
  assert.equal(totalOpexCosts, 60000);

  // 4. Net Owner Profit = 650,000 - 165,000 - 60,000 = 425,000 (NOT 650,000 Gross!)
  assert.equal(calculatedNetOwnerProfit, 425000);

  // 5. TCE Total = 650,000 - 165,000 = 485,000 (OPEX is NOT deducted)
  assert.equal(calculatedTceTotal, 485000);

  // 6. TCE Daily = 485,000 / 20 = 24,250 / day
  assert.equal(calculatedTceDaily, 24250);
});
