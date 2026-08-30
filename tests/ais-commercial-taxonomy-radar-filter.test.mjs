import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isCommercialCargoVessel,
  isCommercialVessel as isCommercialVesselTaxonomy,
  filterCommercialVessels as filterCommercialVesselsTaxonomy
} from '../cargo-taxonomy.mjs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mapLoaderSource = readFileSync(new URL('../map_loader.js', import.meta.url), 'utf8');

test('map_loader.js defines robust commercial cargo taxonomy filters and strict exclusion patterns', () => {
  assert.match(mapLoaderSource, /STRICT_EXCLUSION_PATTERN\s*=\s*\/\\b\(fishing\|pesquero/i, 'Has strict exclusion pattern');
  assert.match(mapLoaderSource, /port hand mark|starboard hand mark|special mark|reference point|isolated danger/i, 'Pattern excludes Navigational Marks and Aids');
  assert.match(mapLoaderSource, /manned vts|vts/i, 'Pattern excludes VTS');
  assert.match(mapLoaderSource, /fishing|trawler/i, 'Pattern excludes Fishing vessels');
  assert.match(mapLoaderSource, /tug|tugboat/i, 'Pattern excludes Tugs');
  assert.match(mapLoaderSource, /yacht|pleasure craft|sailing/i, 'Pattern excludes Yachts and pleasure craft');
  assert.match(mapLoaderSource, /STRICT_COMMERCIAL_WHITELIST_PATTERN\s*=\s*\/\\b\(bulk carrier\|bulker/i, 'Has strict commercial whitelist pattern');
  assert.match(mapLoaderSource, /container ship|tanker|heavy load carrier|break bulk|ro-ro cargo/i, 'Whitelist includes Container, Tanker, Heavy Load, Break Bulk, Ro-Ro');
  assert.match(mapLoaderSource, /function isCommercialVessel\(ship\)/, 'isCommercialVessel function exists');
  assert.match(mapLoaderSource, /function filterCommercialVessels\(vessels\)/, 'filterCommercialVessels function exists');
});

test('cargo-taxonomy.mjs classifies and filters non-commercial vs commercial whitelist vessels', () => {
  // Non-commercial vessels and noise to strictly reject
  const tug = { name: 'Sea Tug 1', vessel_type: 'Tug', ShipType: 52 };
  const yacht = { name: 'Ocean Luxury', vessel_type: 'Pleasure Craft', ShipType: 37 };
  const sailing = { name: 'Wind Spirit', vessel_type: 'Sailing Vessel', ShipType: 36 };
  const sar = { name: 'SAR Guard 101', vessel_type: 'Search and Rescue', ShipType: 51 };
  const fishing = { name: 'North Sea Fisher', vessel_type: 'Fishing', ShipType: 30 };
  const passenger = { name: 'Royal Ferry', vessel_type: 'Passenger', ShipType: 60 };
  const dredger = { name: 'Port Dredger', vessel_type: 'Dredger', ShipType: 33 };
  const pilot = { name: 'Pilot Alpha', vessel_type: 'Pilot Boat', ShipType: 50 };
  const military = { name: 'Naval Patrol', vessel_type: 'Military Ops', ShipType: 35 };
  const vts = { name: 'VTS Harbor Station', vessel_type: 'Manned VTS', ShipType: 0 };
  const portHandMark = { name: 'Channel Beacon 1', vessel_type: 'Port Hand Mark', ShipType: 0 };
  const starboardMark = { name: 'Channel Beacon 2', vessel_type: 'Starboard Hand Mark', ShipType: 0 };
  const seaFarm = { name: 'Aquaculture Zone', vessel_type: 'Special Mark - Sea Farm', ShipType: 0 };
  const refPoint = { name: 'Fairway Gateway', vessel_type: 'Reference Point', ShipType: 0 };
  const danger = { name: 'Sunken Rock', vessel_type: 'Isolated Danger', ShipType: 0 };
  const other = { name: 'Unknown Target', vessel_type: 'Other', ShipType: 0 };
  const unknown = { name: 'Ghost Contact', vessel_type: 'Unknown', ShipType: 0 };

  assert.equal(isCommercialCargoVessel(tug), false, 'Tugs must be excluded');
  assert.equal(isCommercialCargoVessel(yacht), false, 'Pleasure Craft must be excluded');
  assert.equal(isCommercialCargoVessel(sailing), false, 'Sailing vessels must be excluded');
  assert.equal(isCommercialCargoVessel(sar), false, 'Search & Rescue must be excluded');
  assert.equal(isCommercialCargoVessel(fishing), false, 'Fishing vessels must be excluded');
  assert.equal(isCommercialCargoVessel(passenger), false, 'Passenger vessels must be excluded');
  assert.equal(isCommercialCargoVessel(dredger), false, 'Dredgers must be excluded');
  assert.equal(isCommercialCargoVessel(pilot), false, 'Pilot boats must be excluded');
  assert.equal(isCommercialCargoVessel(military), false, 'Military Ops must be excluded');
  assert.equal(isCommercialCargoVessel(vts), false, 'Manned VTS must be excluded');
  assert.equal(isCommercialCargoVessel(portHandMark), false, 'Port Hand Mark must be excluded');
  assert.equal(isCommercialCargoVessel(starboardMark), false, 'Starboard Hand Mark must be excluded');
  assert.equal(isCommercialCargoVessel(seaFarm), false, 'Special Mark - Sea Farm must be excluded');
  assert.equal(isCommercialCargoVessel(refPoint), false, 'Reference Point must be excluded');
  assert.equal(isCommercialCargoVessel(danger), false, 'Isolated Danger must be excluded');
  assert.equal(isCommercialCargoVessel(other), false, 'Other must be excluded');
  assert.equal(isCommercialCargoVessel(unknown), false, 'Unknown must be excluded');

  // Commercial cargo whitelist vessels to strictly retain
  const bulkCarrier = { name: 'Capesize Leader', vessel_type: 'Bulk Carrier', dwt: 180000, ShipType: 70 };
  const supramax = { name: 'Pacific Bulk', vessel_type: 'Supramax', dwt: 58000, ShipType: 70 };
  const generalCargo = { name: 'Atlantic Trader', vessel_type: 'General Cargo', dwt: 7500, ShipType: 70 };
  const containerShip = { name: 'Pacific Box', vessel_type: 'Container Ship', dwt: 65000, ShipType: 71 };
  const tanker = { name: 'Nordic Clean', vessel_type: 'Tanker', dwt: 45000, ShipType: 80 };
  const heavyLoad = { name: 'Mammoth Carrier', vessel_type: 'Heavy Load Carrier', dwt: 22000, ShipType: 70 };
  const breakBulk = { name: 'Breakbulk Explorer', vessel_type: 'Break Bulk', dwt: 14000, ShipType: 70 };
  const roro = { name: 'Euro Transport', vessel_type: 'Ro-Ro Cargo', dwt: 19000, ShipType: 70 };

  assert.equal(isCommercialCargoVessel(bulkCarrier), true, 'Bulk Carrier must be accepted');
  assert.equal(isCommercialCargoVessel(supramax), true, 'Supramax must be accepted');
  assert.equal(isCommercialCargoVessel(generalCargo), true, 'General Cargo must be accepted');
  assert.equal(isCommercialCargoVessel(containerShip), true, 'Container Ship must be accepted');
  assert.equal(isCommercialCargoVessel(tanker), true, 'Tanker must be accepted');
  assert.equal(isCommercialCargoVessel(heavyLoad), true, 'Heavy Load Carrier must be accepted');
  assert.equal(isCommercialCargoVessel(breakBulk), true, 'Break Bulk must be accepted');
  assert.equal(isCommercialCargoVessel(roro), true, 'Ro-Ro Cargo must be accepted');

  const mixedFleet = [
    tug, bulkCarrier, yacht, generalCargo, sailing, sar, containerShip,
    fishing, tanker, passenger, heavyLoad, dredger, breakBulk, vts,
    portHandMark, roro, starboardMark, seaFarm, refPoint, danger, other, unknown
  ];
  const filtered = filterCommercialVesselsTaxonomy(mixedFleet);

  assert.equal(filtered.length, 7, 'Exactly 7 commercial whitelist vessels should be retained');
  assert.deepEqual(filtered.map(v => v.name), [
    'Capesize Leader',
    'Atlantic Trader',
    'Pacific Box',
    'Nordic Clean',
    'Mammoth Carrier',
    'Breakbulk Explorer',
    'Euro Transport'
  ]);
});

test('index.html applies commercial taxonomy filter at radar sweep capture (POL & POD 10 NM)', () => {
  // runAisZoneSearch filters non-commercial traffic
  assert.match(indexHtml, /const commercialVessels\s*=\s*vessels\.filter\(vessel\s*=>\s*\{/, 'runAisZoneSearch filters non-commercial vessels');
  assert.match(indexHtml, /window\.esBuqueComercialRelevante\(vessel\)/, 'uses esBuqueComercialRelevante');
  assert.match(indexHtml, /return commercialVessels;/, 'runAisZoneSearch returns clean commercial vessels');

  // esBuqueComercialRelevante definition
  assert.match(indexHtml, /window\.esBuqueComercialRelevante\s*=\s*function\(buque\)/, 'esBuqueComercialRelevante is defined');
  assert.match(indexHtml, /MapLoader\.isCommercialVessel\(buque\)/, 'delegates to MapLoader.isCommercialVessel');
});

test('Clean synchronization: Density table, Offer Coefficient, POD Backhaul, and Fair Freight receive filtered fleet', () => {
  // Density table rendering
  assert.match(indexHtml, /function renderDensityVesselsTable\(_vessels, _options = \{\}\)\s*\{\s*const displayVessels = getDensityReactiveVessels\(\);/, 'Density table renders pure commercial fleet');

  // Fair freight and supply coefficient
  assert.match(indexHtml, /const totalLocalSupply = nearbyVessels\.length \+ podBackhaulCandidates\.length;/, 'Local market supply computes from filtered commercial fleet');
  assert.match(indexHtml, /let coefficient = 1\.00 \+ \(baseline - totalDetectedCount\) \* 0\.02;/, 'Offer coefficient is computed from real commercial density');
  assert.match(indexHtml, /document\.getElementById\('ais-rate-fair'\)/, 'Updates Fair Freight band');
  assert.match(indexHtml, /renderPodBackhaulOpportunities\(podBackhaulCandidates\)/, 'POD Backhaul opportunities are rendered from commercial vessels');
});

