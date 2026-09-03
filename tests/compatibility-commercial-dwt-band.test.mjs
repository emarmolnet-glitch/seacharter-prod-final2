import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COMMERCIAL_DWT_MAX_MULTIPLIER,
  COMMERCIAL_DWT_MIN_MULTIPLIER,
  filterVesselsByCommercialDwt,
  isDwtWithinCommercialBand,
  resolveCommercialDwtBounds,
  resolveVesselDwt,
} from '../cargo-taxonomy.mjs';

test('resolveCommercialDwtBounds applies a -10% / +50% band over the cargo lot', () => {
  assert.equal(COMMERCIAL_DWT_MIN_MULTIPLIER, 0.9);
  assert.equal(COMMERCIAL_DWT_MAX_MULTIPLIER, 1.5);

  assert.deepEqual(resolveCommercialDwtBounds(5000), {
    tonnage: 5000,
    minDwt: 4500,
    maxDwt: 7500,
    applied: true,
  });
  assert.deepEqual(resolveCommercialDwtBounds(10000), {
    tonnage: 10000,
    minDwt: 9000,
    maxDwt: 15000,
    applied: true,
  });

  // Without a declared cargo quantity the band cannot be resolved and stays inactive.
  assert.deepEqual(resolveCommercialDwtBounds(0), {
    tonnage: 0,
    minDwt: null,
    maxDwt: null,
    applied: false,
  });
  assert.equal(resolveCommercialDwtBounds(null).applied, false);
});

test('isDwtWithinCommercialBand rejects oversized tonnage for the requested cargo', () => {
  // Reported defect: a 58,000 DWT Supramax offered for a 5,000 MT lot.
  assert.equal(isDwtWithinCommercialBand(58000, 5000), false);
  assert.equal(isDwtWithinCommercialBand(7500, 5000), true);
  assert.equal(isDwtWithinCommercialBand(7501, 5000), false);

  // A 10% lower margin keeps short-shipment / part-cargo candidates available.
  assert.equal(isDwtWithinCommercialBand(4500, 5000), true);
  assert.equal(isDwtWithinCommercialBand(4499, 5000), false);

  // 10,000 MT lot -> 9,000 / 15,000 DWT.
  assert.equal(isDwtWithinCommercialBand(15000, 10000), true);
  assert.equal(isDwtWithinCommercialBand(16000, 10000), false);

  // An unverified DWT is not penalised, and no cargo quantity means no filtering.
  assert.equal(isDwtWithinCommercialBand(null, 5000), true);
  assert.equal(isDwtWithinCommercialBand(0, 5000), true);
  assert.equal(isDwtWithinCommercialBand(58000, 0), true);
});

test('resolveVesselDwt reads DWT from the AIS and master-record shapes', () => {
  assert.equal(resolveVesselDwt({ dwt: 6200 }), 6200);
  assert.equal(resolveVesselDwt({ deadweight: 6200 }), 6200);
  assert.equal(resolveVesselDwt({ neonDbMaster: { dwt: 6200 } }), 6200);
  assert.equal(resolveVesselDwt(6200), 6200);
  assert.equal(resolveVesselDwt({ vesselName: 'MV SIN DWT' }), null);
});

test('filterVesselsByCommercialDwt narrows an AIS fleet to commercially sized vessels', () => {
  const fleet = [
    { name: 'SUPRAMAX', dwt: 58000 },
    { name: 'MINI BULKER', dwt: 6000 },
    { name: 'COASTER', deadweight: 4700 },
    { name: 'PENDING AUDIT' },
    { name: 'HANDYSIZE', neonDbMaster: { dwt: 32000 } },
  ];

  assert.deepEqual(
    filterVesselsByCommercialDwt(fleet, 5000).map((vessel) => vessel.name),
    ['MINI BULKER', 'COASTER', 'PENDING AUDIT'],
  );

  // No cargo quantity declared: the fleet passes through untouched.
  assert.equal(filterVesselsByCommercialDwt(fleet, 0).length, fleet.length);
  assert.deepEqual(filterVesselsByCommercialDwt(null, 5000), []);
});

test('the compatibility matching engine applies the commercial band before scoring', async () => {
  const apiSource = await readFile(new URL('../netlify/functions/vessel-compatibility.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /resolveCommercialDwtBounds\(cargoVolumeMt\)/);
  assert.match(apiSource, /isDwtWithinCommercialBand\(cand\.dwt, commercialDwtBounds\.tonnage\)/);
  // The band is pushed into the vessels_master query so out-of-range tonnage is never downloaded.
  assert.match(apiSource, /dwt BETWEEN \$1 AND \$2/);

  const clientSource = await readFile(new URL('../src/compatibilidad-module.js', import.meta.url), 'utf8');
  assert.match(clientSource, /from '\.\.\/cargo-taxonomy\.mjs'/);
  assert.match(clientSource, /resolveCommercialDwtBounds\(activeOp\.cargoVolumeMt\)/);
  assert.match(clientSource, /isDwtWithinCommercialBand\(resolveVesselDwt\(ship\), commercialDwtBand\.tonnage\)/);
  assert.doesNotMatch(clientSource, /ship\.dwt \|\| ship\.deadweight \|\| 10850/);
});
