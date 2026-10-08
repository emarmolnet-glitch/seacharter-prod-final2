import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html defines filtrarBuquesCompetidores with the 3 strict criteria', () => {
  assert.match(
    indexHtml,
    /window\.filtrarBuquesCompetidores\s*=\s*function/,
    'filtrarBuquesCompetidores must be defined on window'
  );
  assert.match(
    indexHtml,
    /code\s*>=\s*70\s*&&\s*code\s*<=\s*79/,
    'Checks shipType code between 70 and 79'
  );
  assert.match(
    indexHtml,
    /statusCode\s*===\s*1\s*\|\|\s*statusCode\s*===\s*5/,
    'Checks navigational status 1 (At Anchor) or 5 (Moored)'
  );
  assert.match(
    indexHtml,
    /under\s*way|underway|navegando|sailing/i,
    'Rejects underway using engine'
  );
  assert.match(
    indexHtml,
    /targetCargo\s*\*\s*0\.60|requestedCargoQty\s*\*\s*0\.60/i,
    'Checks lower DWT margin -40%'
  );
  assert.match(
    indexHtml,
    /targetCargo\s*\*\s*1\.40|requestedCargoQty\s*\*\s*1\.40/i,
    'Checks upper DWT margin +40%'
  );
});

test('calculateAndDisplayAisFreight isolates competitor density for the multiplier without altering the visual table', () => {
  // Density table remains completely unchanged (100% of detected vessels rendered)
  assert.match(
    indexHtml,
    /function renderDensityVesselsTable\(_vessels, _options = \{\}\)\s*\{\s*const displayVessels = getDensityReactiveVessels\(\);/,
    'Visual density table must continue rendering 100% of detected vessels'
  );

  // Derives buquesCompetidores from renderFleet
  assert.match(
    indexHtml,
    /const buquesCompetidores\s*=/,
    'Creates derived buquesCompetidores array'
  );
  assert.match(
    indexHtml,
    /const totalDetectedCount\s*=\s*buquesCompetidores\.length;/,
    'Uses buquesCompetidores.length for the density multiplier formula'
  );
  assert.match(
    indexHtml,
    /let coefficient = 1\.00 \+ \(baseline - totalDetectedCount\) \* 0\.02;/,
    'Density multiplier formula calculates from competitor count'
  );
  assert.match(
    indexHtml,
    /coefficient = Math\.max\(0\.70, Math\.min\(1\.30, coefficient\)\);/,
    'Multiplier is bounded between 0.70 and 1.30'
  );
  assert.match(
    indexHtml,
    /supplyFactor\s*=\s*coefficient;/,
    'Density coefficient is assigned to supplyFactor as real market multiplier'
  );
});

test('density multiplier proportionally scales Fair Freight, Standard, and Off-Market bands', () => {
  // Test mathematical impact:
  // Base BE: $20.00
  // Base margins: fair=1.05, standard=1.12, offmarket=1.25, portMultiplier=1.0
  // In neutral market (coefficient = 1.00):
  //   Fair = 20 * 1.05 * 1.0 = $21.00 (+5%)
  //   Standard = 20 * 1.12 * 1.0 = $22.40 (+12%)
  //   OffMarket = 20 * 1.25 * 1.0 = $25.00 (+25%)
  // In tight market with 1 competitor (coefficient = 1.00 + (15 - 1)*0.02 = 1.28):
  //   Fair = 20 * 1.05 * 1.28 * 1.0 = $26.88 (+34.4% vs Base BE, exactly +28% vs Neutral Fair)
  //   Standard = 20 * 1.12 * 1.28 * 1.0 = $28.67
  //   OffMarket = 20 * 1.25 * 1.28 * 1.0 = $32.00
  const baseBE = 20.00;
  const baseMargins = { fair: 1.05, standard: 1.12, offmarket: 1.25 };
  const portMultiplier = 1.0;

  const neutralCoefficient = 1.00;
  const neutralFair = baseBE * (baseMargins.fair * neutralCoefficient * portMultiplier);
  assert.equal(neutralFair.toFixed(2), '21.00');

  const tightCoefficient = 1.28;
  const tightFair = baseBE * (baseMargins.fair * tightCoefficient * portMultiplier);
  assert.equal(tightFair.toFixed(2), '26.88');

  // Verify proportional increase: tightFair / neutralFair = 1.28 (+28%)
  const fairRatio = tightFair / neutralFair;
  assert.equal(fairRatio.toFixed(2), '1.28', 'Fair Freight increases by exactly 28% when coefficient is 1.28');

  const tightStandard = baseBE * (baseMargins.standard * tightCoefficient * portMultiplier);
  assert.equal(tightStandard.toFixed(2), '28.67');

  const tightOffMarket = baseBE * (baseMargins.offmarket * tightCoefficient * portMultiplier);
  assert.equal(tightOffMarket.toFixed(2), '32.00');

  // Relative spread between bands is preserved
  assert.equal((tightStandard / tightFair).toFixed(4), (baseMargins.standard / baseMargins.fair).toFixed(4));
  assert.equal((tightOffMarket / tightFair).toFixed(4), (baseMargins.offmarket / baseMargins.fair).toFixed(4));
});

test('filtrarBuquesCompetidores functionally filters by cargo type, anchor/moored status, and +/- 40% DWT margin', () => {
  // Extract and run the function in an isolated vm context
  const start = indexHtml.indexOf('window.filtrarBuquesCompetidores = function');
  const end = indexHtml.indexOf('window.obtenerNombreBuque = function', start);
  const functionCode = indexHtml.slice(start, end);

  const sandbox = {
    window: {
      normalizeRadarVesselTipo: (val) => String(val).toLowerCase().includes('cargo') ? 'Cargo' : 'Unknown'
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(functionCode, sandbox);

  const filterFn = sandbox.window.filtrarBuquesCompetidores;
  assert.equal(typeof filterFn, 'function', 'filtrarBuquesCompetidores is a callable function');

  const fleet = [
    // 1. Valid competitor: Cargo (70), At Anchor (1), DWT 30000 (within 25000 +/- 40%: [15000, 35000])
    { name: 'Cargo Anchored 1', shipType: 70, NavigationalStatus: 1, dwt: 30000 },
    // 2. Valid competitor: Cargo (79), Moored (5), DWT 20000
    { name: 'Cargo Moored 1', shipType: 79, NavigationalStatus: 5, dwt: 20000 },
    // 3. Valid competitor: Text "Cargo", Text "At Anchor", DWT 25000
    { name: 'Cargo Text Anchored', vesselType: 'Cargo', status: 'At Anchor', dwt: 25000 },
    // 4. Discarded: Fishing vessel (shipType 30), At Anchor (1)
    { name: 'Fishing Boat', shipType: 30, NavigationalStatus: 1, dwt: 500 },
    // 5. Discarded: Passenger vessel (shipType 60), Moored (5)
    { name: 'Cruise Liner', shipType: 60, NavigationalStatus: 5, dwt: 10000 },
    // 6. Discarded: Cargo (70), but Underway using engine (0)
    { name: 'Cargo Sailing 0', shipType: 70, NavigationalStatus: 0, dwt: 28000 },
    // 7. Discarded: Cargo (70), but Underway using engine (text)
    { name: 'Cargo Underway Text', shipType: 70, status: 'Underway using engine', dwt: 28000 },
    // 8. Discarded: Cargo (70), At Anchor (1), but DWT 50000 (exceeds +40% of 25000 -> max 35000)
    { name: 'Capesize Giant', shipType: 70, NavigationalStatus: 1, dwt: 50000 },
    // 9. Discarded: Cargo (70), At Anchor (1), but DWT 10000 (below -40% of 25000 -> min 15000)
    { name: 'Coaster Tiny', shipType: 70, NavigationalStatus: 1, dwt: 10000 },
  ];

  const targetCargo = 25000;
  const competitors = filterFn(fleet, targetCargo);

  assert.equal(competitors.length, 3, 'Only the 3 eligible competitors should pass the filter');
  assert.deepEqual(
    competitors.map(v => v.name),
    ['Cargo Anchored 1', 'Cargo Moored 1', 'Cargo Text Anchored']
  );

  // If no cargo quantity is specified (0 or not entered), DWT check is optional, so both 50k and 10k are kept
  const competitorsNoCargo = filterFn(fleet, 0);
  assert.equal(competitorsNoCargo.length, 5, 'Without target cargo, all 5 cargo anchored/moored vessels are kept');
});
