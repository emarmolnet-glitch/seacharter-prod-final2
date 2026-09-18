import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const rootWorkspaceSource = readFileSync(new URL('../ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. COMMODITY_TARIFFS catalog is exported and contains all required FSPE subsidized items', () => {
  assert.match(workspaceSource, /export const COMMODITY_TARIFFS\s*=\s*\{/);
  assert.match(rootWorkspaceSource, /export const COMMODITY_TARIFFS\s*=\s*\{/);

  const expectedKeys = [
    "CEM I 52,5N BIGBAG",
    "CEM I 52,5N SAC 50KG",
    "CEM I 42,5N/R BIGBAG",
    "CEM I 42,5N/R SAC 50KG",
    "CEM II 52.5N/R 50KG",
    "CEM II 52.5N BIGBAG",
    "CEM II 42,5N/R FARDILISE",
    "CEM II 42,5N/R FARDILLISE TAVCIM",
    "CEM II 42,5 VRAC",
    "CEM II 42,5 R BIGBAG",
    "CEM I 52,5 R BIGBAG"
  ];

  for (const key of expectedKeys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(workspaceSource, new RegExp(`"${escapedKey}"\\s*:\\s*\\{`));
  }
});

test('2. ForwarderWorkspace declares isCommodityTariffActive state hook', () => {
  assert.match(workspaceSource, /const\s+\[isCommodityTariffActive,\s*setIsCommodityTariffActive\]\s*=\s*useState\(false\);/);
});

test('3. Packing List Tipo/Modelo input links to datalist id="commodity-list"', () => {
  assert.match(workspaceSource, /<input[^>]*list="commodity-list"[^>]*value=\{item\.type\s*\|\|\s*''\}/);
  assert.match(workspaceSource, /<datalist\s+id="commodity-list">/);
  assert.match(workspaceSource, /Object\.keys\(COMMODITY_TARIFFS\)\.map/);
});

test('4. Calculation bypass validator safely handles undefined/empty type without crashing', () => {
  assert.match(workspaceSource, /const\s+rawType\s*=\s*String\(cargoItems\[0\]\?\.type\s*\|\|\s*''\)\.toUpperCase\(\)\.trim\(\);/);
  assert.match(workspaceSource, /const\s+appliedTariff\s*=\s*COMMODITY_TARIFFS\[rawType\]\s*\|\|\s*null;/);
  assert.match(workspaceSource, /if\s*\(\s*appliedTariff\s*\)\s*\{/);
  assert.match(workspaceSource, /setIsCommodityTariffActive\(true\);/);
  assert.match(workspaceSource, /setIsCommodityTariffActive\(false\);/);
});

test('5. Subsidized flat rates override inland freight and dynamic port/FOB costs', () => {
  assert.match(workspaceSource, /totalWeightTons\s*\*\s*appliedTariff\.inlandUsdMt/);
  assert.match(workspaceSource, /totalWeightTons\s*\*\s*\(\s*appliedTariff\.portDuesUsdMt\s*\+\s*appliedTariff\.customsUsdMt\s*\+\s*appliedTariff\.packagingUsdMt\s*\)/);
});

test('6. Section 5 Desglose Financiero renders visual feedback banner when isCommodityTariffActive is true', () => {
  assert.match(
    workspaceSource,
    /\{isCommodityTariffActive\s*&&\s*\(\s*<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg mb-4 text-xs font-bold">\s*💡 Tarifa de Convenio Comercial \/ FSPE Aplicada\. Los cálculos dinámicos de km y estiba han sido sustituidos por tarifas netas de commodity\.\s*<\/div>\s*\)\}/
  );
});

test('7. DataBridge button is compacted to ⚡ Sync DataBridge with whitespace-nowrap', () => {
  assert.match(workspaceSource, /id="btn-update-calculator-data"[^>]*whitespace-nowrap/);
  assert.match(workspaceSource, /<span>⚡ Sync DataBridge<\/span>/);
});

test('8. Category selector label is shortened with whitespace-nowrap on label and container', () => {
  assert.match(workspaceSource, /<div className="flex items-center gap-1\.5 bg-slate-50 border border-slate-200 rounded-lg px-2\.5 py-1 whitespace-nowrap">/);
  assert.match(workspaceSource, /<label htmlFor="cargo-category-select-section1" className="text-\[11px\] font-bold text-slate-600 whitespace-nowrap">Tarifa:<\/label>/);
});

test('9. Functional simulation: empty or undefined type item does not crash autoCalculateEstimates logic', () => {
  const COMMODITY_TARIFFS = {
    "CEM I 52,5N BIGBAG": { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 },
  };

  const emptyCargoItems = [{ id: '1', category: 'Equipos de Proceso', quantity: 1, type: '' }];
  const rawType = String(emptyCargoItems[0]?.type || '').toUpperCase().trim();
  const appliedTariff = COMMODITY_TARIFFS[rawType] || null;

  assert.equal(appliedTariff, null);

  const undefinedTypeCargoItems = [{ id: '2', category: 'Equipos de Proceso', quantity: 1 }];
  const rawType2 = String(undefinedTypeCargoItems[0]?.type || '').toUpperCase().trim();
  const appliedTariff2 = COMMODITY_TARIFFS[rawType2] || null;

  assert.equal(appliedTariff2, null);
});

test('10. FSPE commodity tariff unconditionally includes merchandise cost (customsCost) in calculatedFobOperations', () => {
  assert.match(
    workspaceSource,
    /calculatedFobOperations\s*=\s*totalWeightTons\s*\*\s*\(\s*appliedTariff\.portDuesUsdMt\s*\+\s*appliedTariff\.customsUsdMt\s*\+\s*appliedTariff\.packagingUsdMt\s*\)\s*\+\s*\(\s*Number\(\s*customsCost\s*\)\s*\|\|\s*0\s*\);/,
    'calculatedFobOperations under FSPE must explicitly add customsCost (Mercancía USD)'
  );
});

test('11. Indicator "FOB + Mercancía Unitario" divides real subtotalFobOperations by total metric tons', () => {
  assert.match(
    workspaceSource,
    /Number\(\s*subtotalFobOperations\s*\)\s*\/\s*totalTons/,
    'FOB + Mercancía Unitario indicator must divide subtotalFobOperations by totalTons'
  );
});

test('12. Functional simulation: FSPE flat rates correctly pass through cargo merchandise value into subtotal and unit ratio', () => {
  const COMMODITY_TARIFFS = {
    "CEM I 52,5N BIGBAG": { inlandUsdMt: 3.00, portDuesUsdMt: 2.00, customsUsdMt: 0.25, packagingUsdMt: 3.50 },
  };

  const totalWeightTons = 1000;
  const customsCost = 75000; // Mercancía (USD)
  const rawType = "CEM I 52,5N BIGBAG";
  const appliedTariff = COMMODITY_TARIFFS[rawType];

  const flatFobPortOps = totalWeightTons * (appliedTariff.portDuesUsdMt + appliedTariff.customsUsdMt + appliedTariff.packagingUsdMt);
  assert.equal(flatFobPortOps, 5750, 'Base FSPE flat operational tariff is 5,750 USD');

  const calculatedFobOperations = flatFobPortOps + (Number(customsCost) || 0);
  assert.equal(calculatedFobOperations, 80750, 'Subtotal FOB operations must be 80,750 USD (flat operations + merchandise)');

  const fobMasMercanciaUnitario = totalWeightTons > 0 ? (calculatedFobOperations / totalWeightTons) : 0;
  assert.equal(fobMasMercanciaUnitario, 80.75, 'FOB + Mercancía Unitario must be 80.75 USD/MT');
});

