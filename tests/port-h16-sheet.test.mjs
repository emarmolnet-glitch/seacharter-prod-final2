import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  adjustDraftForWaterDensity,
  buildPortH16Badges,
  evaluateRoutePortRestrictions,
  parseH16PortSheet,
  resolvePortH16Profile,
} from "../shared/port-h16-sheet.mjs";

const require = createRequire(import.meta.url);

// Real ports_master.source_payload.h16_port_sheet payloads (official WPI).
const DOUALA_SHEET = {
  h16_version: "1.0",
  data_confidence: "OFFICIAL_WPI",
  quoting_and_operations: {
    max_loa_m: 225,
    max_beam_m: 34.6,
    operational_warnings: [
      "Requiere cálculo de ventana de marea para navegación y desatraque (Rango de marea: 0.91m).",
      "Densidad de agua reducida (1.005 t/m³): verificar calado en agua dulce (Fresh Water Draft).",
      "Navegación nocturna no permitida o restringida a criterio de capitanía.",
    ],
    geared_vessel_required: false,
  },
  restrictions_and_tides: {
    berth_draft_m: 13.11,
    tidal_range_m: 0.91,
    water_density: 1.005,
    channel_draft_low_m: 6.4,
    channel_draft_high_m: 7.62,
    tidal_window_required: true,
    night_navigation_allowed: false,
  },
};

const ORAN_SHEET = {
  h16_version: "1.0",
  data_confidence: "OFFICIAL_WPI",
  quoting_and_operations: { max_loa_m: 175, max_beam_m: 26.9, operational_warnings: [], geared_vessel_required: false },
  restrictions_and_tides: {
    berth_draft_m: 10.06,
    tidal_range_m: 0.3,
    water_density: 1.025,
    channel_draft_low_m: 23.16,
    channel_draft_high_m: 28,
    tidal_window_required: false,
    night_navigation_allowed: null,
  },
};

test("parseH16PortSheet accepts objects, serialized JSON strings and wrapped source_payload", () => {
  assert.deepEqual(parseH16PortSheet(DOUALA_SHEET), DOUALA_SHEET);
  assert.deepEqual(parseH16PortSheet(JSON.stringify(DOUALA_SHEET)), DOUALA_SHEET);
  assert.deepEqual(parseH16PortSheet(JSON.stringify(JSON.stringify(DOUALA_SHEET))), DOUALA_SHEET);
  assert.deepEqual(parseH16PortSheet({ h16_port_sheet: JSON.stringify(DOUALA_SHEET) }), DOUALA_SHEET);
  assert.equal(parseH16PortSheet("{not json"), null);
  assert.equal(parseH16PortSheet(null), null);
});

test("effective draft is the minimum of berth and high-water channel draft", () => {
  const douala = resolvePortH16Profile({ h16Sheet: JSON.stringify(DOUALA_SHEET) });
  assert.equal(douala.effectiveDraftM, 7.62);
  assert.equal(douala.effectiveDraftSource, "channel_high");
  assert.equal(douala.effectiveDraftLabel, "Canal pleamar");
  assert.equal(douala.lowWaterDraftM, 6.4);
  assert.equal(douala.maxLoaM, 225);
  assert.equal(douala.maxBeamM, 34.6);
  assert.equal(douala.waterDensity, 1.005);
  assert.equal(douala.tidalWindowRequired, true);
  assert.equal(douala.nightNavigationAllowed, false);
  assert.equal(douala.operationalWarnings.length, 3);
  assert.deepEqual(buildPortH16Badges(douala).map((badge) => badge.label), [
    "Ventana de marea",
    "Agua dulce/salobre 1.005",
    "Sin nav. nocturna",
  ]);

  const oran = resolvePortH16Profile({ source_payload: { h16_port_sheet: ORAN_SHEET } });
  assert.equal(oran.effectiveDraftM, 10.06);
  assert.equal(oran.effectiveDraftSource, "berth");
  assert.equal(oran.lowWaterDraftM, null);
  assert.equal(oran.maxLoaM, 175);
  assert.deepEqual(buildPortH16Badges(oran), []);
});

test("fresh water draft correction only applies below 1.025", () => {
  assert.equal(adjustDraftForWaterDensity(9.91, 1.025), 9.91);
  assert.ok(Math.abs(adjustDraftForWaterDensity(9.91, 1.005) - 10.1072) < 1e-3);
});

test("Orán → Douala with 34,500 DWT / 9.91 m flags a critical draft restriction at POD only", () => {
  const result = evaluateRoutePortRestrictions(
    [
      { role: "POL", name: "Oran (DZ)", port: { h16Sheet: ORAN_SHEET } },
      { role: "POD", name: "Douala (CM)", port: { h16Sheet: JSON.stringify(DOUALA_SHEET) } },
    ],
    { draftM: 9.91, cargoTons: 30000 },
    { bufferDaysPerPort: 0.5 },
  );
  const [pol, pod] = result.ports;
  assert.equal(pol.fit.isCritical, false);
  assert.equal(pol.fit.draftMarginM, 0.15);
  assert.equal(pol.fit.bufferDays, 0);

  assert.equal(pod.fit.isCritical, true);
  assert.equal(pod.fit.densityCorrectionApplied, true);
  assert.equal(pod.fit.adjustedDraftM, 10.11);
  assert.equal(pod.fit.draftExcessM, 2.49);
  assert.ok(pod.fit.draftOvercapacityPct > 32);
  assert.equal(pod.fit.cargoCutTons, null, "no TPC and no LOA/beam → only % overcapacity");
  assert.equal(pod.fit.bufferDays, 0.5);

  assert.equal(result.hasCritical, true);
  assert.deepEqual(result.criticalPorts, ["POD"]);
  assert.equal(result.totalBufferDays, 0.5);
});

test("cargo cut is estimated from TPC when available", () => {
  const result = evaluateRoutePortRestrictions(
    [{ role: "POD", name: "Douala (CM)", port: { h16Sheet: DOUALA_SHEET } }],
    { draftM: 9.91, tpc: 45, cargoTons: 30000 },
  );
  const fit = result.ports[0].fit;
  // 2.4872 m × 100 cm × 45 t/cm × (1.005 / 1.025)
  assert.ok(Math.abs(fit.cargoCutTons - 10974) <= 2, `unexpected cut ${fit.cargoCutTons}`);
  assert.ok(fit.cargoCutPct > 36 && fit.cargoCutPct < 37);
});

test("LOA and beam breaches are critical", () => {
  const result = evaluateRoutePortRestrictions(
    [{ role: "POL", name: "Oran (DZ)", port: { h16Sheet: ORAN_SHEET } }],
    { draftM: 9.0, loaM: 180, beamM: 28 },
  );
  assert.equal(result.hasCritical, true);
  assert.deepEqual(result.ports[0].fit.breaches.map((breach) => breach.type), ["loa", "beam"]);
});

test("risk matrix switches from VIABLE to port restriction and adds H16 buffer to base/stress", () => {
  const engine = require("../voyage-cost-engine.js");
  const baseVoyage = {
    cargo: 30000,
    daysSea: 10,
    daysPort: 6,
    totalDays: 16,
    totalBunkers: 300000,
    opex: 6000,
    loadRate: 10000,
    dischRate: 10000,
    breakEvenArmador: 25,
    netProfitOwner: 200000,
    ownerNetBreakdown: { grossRevenue: 950000, bunkerAndPortCosts: 650000, operatingCapitalCosts: 100000 },
    fuelBreakdown: { totalCost: 300000, navigation: { cost: 250000 }, port: { cost: 50000 } },
  };
  const clean = engine.runSensitivityBatch(baseVoyage);
  assert.equal(clean.risk.label, "VIABLE");

  const portRestrictions = evaluateRoutePortRestrictions(
    [
      { role: "POL", name: "Oran (DZ)", port: { h16Sheet: ORAN_SHEET } },
      { role: "POD", name: "Douala (CM)", port: { h16Sheet: DOUALA_SHEET } },
    ],
    { draftM: 9.91, cargoTons: 30000 },
  );
  const restricted = engine.runSensitivityBatch(baseVoyage, { portRestrictions });
  assert.equal(restricted.risk.label, "RESTRICCIÓN DE PUERTO · NO VIABLE A PLENA CARGA");
  assert.equal(restricted.risk.status, "red");
  assert.match(restricted.risk.message, /POD Douala \(CM\): calado \+2\.49 m/);
  assert.equal(restricted.base.addedPortDelayDays, 0.5);
  assert.equal(restricted.stress.addedPortDelayDays, 2.5);
  assert.ok(restricted.base.projectedBreakEven > clean.base.projectedBreakEven);

  const advice = engine.buildFixtureClauseAdvice({ pod: "Douala (CM)" }, {}, portRestrictions);
  assert.match(advice, /\+2\.5 días/);
  assert.match(advice, /ventana de marea/i);
  assert.match(advice, /sin navegación nocturna/i);
  assert.match(advice, /buffer operativo de \+0\.50 días/);
  assert.match(advice, /FWA/);
});

test("port restriction keeps blocking save when the stress scenario is loss-making", () => {
  const engine = require("../voyage-cost-engine.js");
  const portRestrictions = evaluateRoutePortRestrictions(
    [{ role: "POD", name: "Douala (CM)", port: { h16Sheet: DOUALA_SHEET } }],
    { draftM: 9.91 },
  );
  const profitable = engine.evaluateRisk({ fleteBruto: 1000000 }, { beneficioNeto: 200000 }, {}, portRestrictions);
  assert.equal(profitable.portRestricted, true);
  assert.equal(profitable.blocksSave, false);
  const loss = engine.evaluateRisk({ fleteBruto: 1000000 }, { beneficioNeto: -5000 }, {}, portRestrictions);
  assert.equal(loss.portRestricted, true);
  assert.equal(loss.blocksSave, true);
});
