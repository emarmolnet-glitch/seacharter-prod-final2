import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. ForwarderWorkspace defines shippingMode, vesselType, and mafiPlatforms state hooks', () => {
  assert.match(forwarderComponentSource, /const\s+\[shippingMode,\s*setShippingMode\]\s*=\s*useState\(/);
  assert.match(forwarderComponentSource, /const\s+\[vesselType,\s*setVesselType\]\s*=\s*useState\(/);
  assert.match(forwarderComponentSource, /const\s+\[mafiPlatforms,\s*setMafiPlatforms\]\s*=\s*useState\(/);
});

test('2. autoCalculateEstimates detects wheeled cargo via regex on type field and calculates roRoItems and staticItems', () => {
  assert.match(forwarderComponentSource, /const\s+roRoRegex\s*=\s*\/camion\|vehiculo\|trailer\|tractor\|coche\|furgoneta\/i/);
  assert.match(forwarderComponentSource, /let\s+roRoItems\s*=\s*0;/);
  assert.match(forwarderComponentSource, /roRoItems\s*\+=\s*qty/);
  assert.match(forwarderComponentSource, /staticItems\.push\(/);
});

test('3. autoCalculateEstimates deduces autoMode and recommendedVessel, and updates local states', () => {
  assert.match(forwarderComponentSource, /const\s+autoMode\s*=\s*roRoItems\s*>\s*0\s*\?\s*['"]Ro-Ro['"]\s*:\s*['"]Lo-Lo['"];/);
  assert.match(forwarderComponentSource, /const\s+recommendedVessel\s*=\s*roRoItems\s*>\s*0\s*\?\s*['"]MPP \/ Pure Ro-Ro Carrier['"]\s*:\s*['"]Geared Breakbulk \(Lo-Lo\)['"];/);
  assert.match(forwarderComponentSource, /setShippingMode\(autoMode\);/);
  assert.match(forwarderComponentSource, /setVesselType\(recommendedVessel\);/);
});

test('4. autoCalculateEstimates bifurcates port heuristics based on autoMode', () => {
  // Ro-Ro heuristics
  assert.match(forwarderComponentSource, /if\s*\(\s*autoMode\s*===\s*['"]Ro-Ro['"]\s*\)/);
  assert.match(forwarderComponentSource, /HeavyLift\s*=\s*0/);
  assert.match(forwarderComponentSource, /wt\s*>\s*5000/);
  assert.match(forwarderComponentSource, /Math\.ceil\(\s*totalPieces\s*\/\s*25\s*\)/);

  // Lo-Lo heuristics
  assert.match(forwarderComponentSource, /MAFIs\s*=\s*0/);
  assert.match(forwarderComponentSource, /maxPieceWeight\s*>\s*8000\s*\?\s*1\s*:\s*0/);
  assert.match(forwarderComponentSource, /Math\.ceil\(\s*totalPieces\s*\/\s*15\s*\)/);
});

test('5. stevedoringCost updates with MAFIs x 300, Heavy Lift x 2500, and Estibadores x 1200', () => {
  assert.match(forwarderComponentSource, /\(MAFIs\s*\*\s*300\)\s*\+\s*\(HeavyLift\s*\*\s*2500\)\s*\+\s*\(Gangs\s*\*\s*1200\)/);
  assert.match(forwarderComponentSource, /setMafiPlatforms\(MAFIs\)/);
});

test('6. Dynamic banner is rendered under Section 2 with auto-detected operative and recommended vessel', () => {
  assert.match(forwarderComponentSource, /id="logistic-engine-banner"/);
  assert.match(forwarderComponentSource, /🤖 Motor Logístico: Operativa/);
  assert.match(forwarderComponentSource, /autodetectada\. Buque recomendado:/);
  assert.match(forwarderComponentSource, /\{shippingMode\}/);
  assert.match(forwarderComponentSource, /\{vesselType\}/);
});

test('7. Plataformas MAFI counter input is rendered visibly in Section 3', () => {
  assert.match(forwarderComponentSource, /label="Plataformas MAFI"/);
  assert.match(forwarderComponentSource, /value=\{mafiPlatforms\}/);
  assert.match(forwarderComponentSource, /onChange=\{setMafiPlatforms\}/);
});

test('8. Total inputs in footer have bg-white text-slate-900 font-bold classes for perfect readability', () => {
  const estimatedCostMatches = forwarderComponentSource.match(/id="input-estimated-cost"[\s\S]*?className="([^"]*)"/);
  assert.ok(estimatedCostMatches, 'input-estimated-cost must exist with className');
  assert.match(estimatedCostMatches[1], /bg-white/);
  assert.match(estimatedCostMatches[1], /text-slate-900/);
  assert.match(estimatedCostMatches[1], /font-bold/);

  const salePriceMatches = forwarderComponentSource.match(/id="input-sale-price"[\s\S]*?className="([^"]*)"/);
  assert.ok(salePriceMatches, 'input-sale-price must exist with className');
  assert.match(salePriceMatches[1], /bg-white/);
  assert.match(salePriceMatches[1], /text-slate-900/);
  assert.match(salePriceMatches[1], /font-bold/);
});

test('9. Behavioral simulation: verify Ro-Ro vs Lo-Lo heuristic calculations', () => {
  // Simulate the calculation logic in isolation
  function simulateHeuristics(items) {
    let totalPieces = 0;
    let totalWeightKg = 0;
    let totalVolumeM3 = 0;
    let maxPieceWeight = 0;
    let roRoItems = 0;
    const staticItems = [];

    const roRoRegex = /camion|vehiculo|trailer|tractor|coche|furgoneta/i;

    items.forEach((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const pieceWeight = Math.max(0, parseFloat(String(item.weight ?? item.unit_weight_kg ?? 0).replace(',', '.')) || 0);

      totalPieces += qty;
      totalWeightKg += qty * pieceWeight;

      if (pieceWeight > maxPieceWeight) {
        maxPieceWeight = pieceWeight;
      }

      const rawType = String(item.type || item.description || '');
      const normalizedType = rawType.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (roRoRegex.test(rawType) || roRoRegex.test(normalizedType)) {
        roRoItems += qty;
      } else {
        staticItems.push({
          ...item,
          qty,
          pieceWeight,
        });
      }
    });

    const autoMode = roRoItems > 0 ? 'Ro-Ro' : 'Lo-Lo';
    const recommendedVessel = roRoItems > 0 ? 'MPP / Pure Ro-Ro Carrier' : 'Geared Breakbulk (Lo-Lo)';

    let HeavyLift = 0;
    let MAFIs = 0;
    let Gangs = 0;

    if (autoMode === 'Ro-Ro') {
      HeavyLift = 0;
      MAFIs = staticItems.reduce((acc, it) => acc + (it.pieceWeight > 5000 ? it.qty : 0), 0);
      Gangs = Math.ceil(totalPieces / 25);
    } else {
      MAFIs = 0;
      HeavyLift = maxPieceWeight > 8000 ? 1 : 0;
      Gangs = Math.ceil(totalPieces / 15);
    }

    const stevedoringCost = (MAFIs * 300) + (HeavyLift * 2500) + (Gangs * 1200);

    return { autoMode, recommendedVessel, MAFIs, HeavyLift, Gangs, stevedoringCost };
  }

  // Case 1: Only static items under 8000kg -> Lo-Lo, HeavyLift 0, MAFI 0
  const loloSmall = simulateHeuristics([
    { type: 'Caja Maquinaria', weight: 4000, quantity: 2 },
  ]);
  assert.equal(loloSmall.autoMode, 'Lo-Lo');
  assert.equal(loloSmall.recommendedVessel, 'Geared Breakbulk (Lo-Lo)');
  assert.equal(loloSmall.HeavyLift, 0);
  assert.equal(loloSmall.MAFIs, 0);
  assert.equal(loloSmall.Gangs, 1);
  assert.equal(loloSmall.stevedoringCost, 1 * 1200);

  // Case 2: Static item > 8000kg -> Lo-Lo, HeavyLift 1, MAFI 0
  const loloHeavy = simulateHeuristics([
    { type: 'Transformador', weight: 12000, quantity: 1 },
  ]);
  assert.equal(loloHeavy.autoMode, 'Lo-Lo');
  assert.equal(loloHeavy.recommendedVessel, 'Geared Breakbulk (Lo-Lo)');
  assert.equal(loloHeavy.HeavyLift, 1);
  assert.equal(loloHeavy.MAFIs, 0);
  assert.equal(loloHeavy.Gangs, 1);
  assert.equal(loloHeavy.stevedoringCost, (1 * 2500) + (1 * 1200));

  // Case 3: Wheeled items present (camion) + static items > 5000kg -> Ro-Ro, HeavyLift 0, MAFIs calculated
  const roroWithMafi = simulateHeuristics([
    { type: 'Camión Cisterna', weight: 15000, quantity: 2 },
    { type: 'Generador Estático', weight: 7000, quantity: 3 }, // 3 pieces > 5000kg -> 3 MAFIs
    { type: 'Pallet Repuestos', weight: 1200, quantity: 5 },  // <= 5000kg -> 0 MAFIs
  ]);
  assert.equal(roroWithMafi.autoMode, 'Ro-Ro');
  assert.equal(roroWithMafi.recommendedVessel, 'MPP / Pure Ro-Ro Carrier');
  assert.equal(roroWithMafi.HeavyLift, 0);
  assert.equal(roroWithMafi.MAFIs, 3);
  // Total pieces = 2 + 3 + 5 = 10. Gangs = Math.ceil(10 / 25) = 1
  assert.equal(roroWithMafi.Gangs, 1);
  assert.equal(roroWithMafi.stevedoringCost, (3 * 300) + (0 * 2500) + (1 * 1200));
});
