import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BALLAST_DRAFT_RATIO_THRESHOLD,
  BALLAST_DRAFT_RATIO_THRESHOLD_ESTIMATED,
  DEFAULT_BALLAST_SPEED_KNOTS,
  LADEN_DISCHARGE_ALLOWANCE_DAYS,
  SPOT_PROXIMITY_NM,
  classifyNavigationalStatus,
  classifyVesselOpenness,
  estimateMaxDraftFromDwt,
  evaluateBallastStatus,
  evaluateLaycanFit,
  formatOpennessDate,
  projectTransitToPol,
  resolveCurrentDraftMeters,
  resolveDestination,
  resolveMaxDraftMeters,
  resolveNavigationalStatus,
  resolveSpeedKnots,
} from '../vessel-openness-engine.mjs';

const NOW = '2026-09-03T00:00:00.000Z';

test('the engine reads the AIS/Datalastic proximity payload field aliases', () => {
  // Shape returned by aisCoordinator normalizeTelemetry + radar-enrichment merge.
  const radarVessel = {
    draught: 5.2,
    maxDraught: 10.4,
    navigationStatus: 'Under way using engine',
    speedKnots: 11.5,
    destination: 'BEJAIA',
  };
  assert.equal(resolveCurrentDraftMeters(radarVessel), 5.2);
  assert.equal(resolveMaxDraftMeters(radarVessel), 10.4);
  assert.equal(resolveNavigationalStatus(radarVessel), 'Under way using engine');
  assert.equal(resolveSpeedKnots(radarVessel), 11.5);
  assert.equal(resolveDestination(radarVessel), 'BEJAIA');

  // Raw Datalastic snake_case shape.
  const rawVessel = { draft: 6.1, summer_draft: 9.8, nav_status: 5, sog: 0, destination_port: 'ALMERIA' };
  assert.equal(resolveCurrentDraftMeters(rawVessel), 6.1);
  assert.equal(resolveMaxDraftMeters(rawVessel), 9.8);
  assert.equal(resolveNavigationalStatus(rawVessel), 5);
  assert.equal(resolveSpeedKnots(rawVessel), 0);
  assert.equal(resolveDestination(rawVessel), 'ALMERIA');

  // Nested containers used by the compatibility matches.
  assert.equal(resolveCurrentDraftMeters({ radarLive: { draught_average: 7.4 } }), 7.4);
  assert.equal(resolveMaxDraftMeters({ neonDbMaster: { draftMeters: 9.5 } }), 9.5);

  // Absent signals resolve to null rather than to a fabricated default.
  assert.equal(resolveCurrentDraftMeters({ vesselName: 'MV SIN CALADO' }), null);
  assert.equal(resolveMaxDraftMeters({}), null);
  assert.equal(resolveSpeedKnots({}), null);
  assert.equal(resolveDestination({ destination: '   ' }), null);
});

test('navigational status maps AIS codes and free text to operational states', () => {
  // Numeric AIS codes.
  assert.equal(classifyNavigationalStatus(1), 'ANCHORED');
  assert.equal(classifyNavigationalStatus(5), 'MOORED');
  assert.equal(classifyNavigationalStatus(0), 'UNDER_WAY');
  assert.equal(classifyNavigationalStatus(8), 'UNDER_WAY');
  assert.equal(classifyNavigationalStatus(2), 'RESTRICTED');
  assert.equal(classifyNavigationalStatus('5'), 'MOORED');

  // Datalastic English text.
  assert.equal(classifyNavigationalStatus('Moored'), 'MOORED');
  assert.equal(classifyNavigationalStatus('At anchor'), 'ANCHORED');
  assert.equal(classifyNavigationalStatus('Under way using engine'), 'UNDER_WAY');

  // Spanish strings produced inside the compatibility module.
  assert.equal(classifyNavigationalStatus('En fondeo / Rada POL'), 'ANCHORED');
  assert.equal(classifyNavigationalStatus('En aproximación POL'), 'UNDER_WAY');
  assert.equal(classifyNavigationalStatus('Atracado en muelle'), 'MOORED');

  // "Disponible" is the placeholder for master records with no AIS signal.
  assert.equal(classifyNavigationalStatus('Disponible'), 'UNKNOWN');
  assert.equal(classifyNavigationalStatus(''), 'UNKNOWN');
  assert.equal(classifyNavigationalStatus(null), 'UNKNOWN');
});

test('ballast status applies the draft / max draft <= 0.65 rule', () => {
  assert.equal(BALLAST_DRAFT_RATIO_THRESHOLD, 0.65);

  // Clearly in ballast: half of the design draft.
  const ballast = evaluateBallastStatus({ draft: 5.2, maxDraft: 10.4 });
  assert.equal(ballast.isBallast, true);
  assert.equal(ballast.ratio, 0.5);
  assert.equal(ballast.basis, 'DECLARED_MAX_DRAFT');
  assert.equal(ballast.confidence, 'HIGH');

  // Exactly on the threshold still counts as ballast (<=).
  assert.equal(evaluateBallastStatus({ draft: 6.5, maxDraft: 10 }).isBallast, true);
  assert.equal(evaluateBallastStatus({ draft: 6.51, maxDraft: 10 }).isBallast, false);

  // Laden vessel: committed to another cargo.
  const laden = evaluateBallastStatus({ draft: 9.9, maxDraft: 10.4 });
  assert.equal(laden.isBallast, false);
  assert.equal(laden.ratio, 0.952);

  // A current draft far above the declared maximum is corrupt data, not ballast.
  const inconsistent = evaluateBallastStatus({ draft: 20, maxDraft: 10 });
  assert.equal(inconsistent.isBallast, false);
  assert.equal(inconsistent.basis, 'INCONSISTENT_DRAFT');
  assert.equal(inconsistent.confidence, 'LOW');
});

test('ballast status falls back to a DWT-derived design draft when max draft is missing', () => {
  assert.equal(BALLAST_DRAFT_RATIO_THRESHOLD_ESTIMATED, 0.6);

  // The regression tracks real design drafts across the size range.
  assert.equal(estimateMaxDraftFromDwt(10000), 7.8);
  assert.equal(estimateMaxDraftFromDwt(55000), 12.85);
  assert.equal(estimateMaxDraftFromDwt(0), null);
  assert.equal(estimateMaxDraftFromDwt(null), null);

  // 4.10 m on a 10,000 DWT mini-bulker is unusually light -> ballast.
  const estimated = evaluateBallastStatus({ draft: 4.1, maxDraft: null, dwt: 10000 });
  assert.equal(estimated.isBallast, true);
  assert.equal(estimated.basis, 'DWT_ESTIMATED_MAX_DRAFT');
  assert.equal(estimated.maxDraftMeters, 7.8);
  assert.equal(estimated.confidence, 'MEDIUM');

  // 7.20 m on the same hull is close to summer marks -> laden.
  assert.equal(evaluateBallastStatus({ draft: 7.2, maxDraft: null, dwt: 10000 }).isBallast, false);

  // Neither max draft nor DWT: no verdict is invented.
  const blind = evaluateBallastStatus({ draft: 6, maxDraft: null, dwt: null });
  assert.equal(blind.isBallast, false);
  assert.equal(blind.basis, 'NO_MAX_DRAFT_REFERENCE');
  assert.equal(blind.confidence, 'LOW');

  // No draft signal at all.
  assert.equal(evaluateBallastStatus({}).basis, 'NO_DRAFT_SIGNAL');
});

test('transit projection uses distanceNM / (sog * 24) and falls back to 12 knots', () => {
  assert.equal(DEFAULT_BALLAST_SPEED_KNOTS, 12);

  // 288 NM at 12 knots = 1 day.
  const steaming = projectTransitToPol({ distanceNm: 288, speedKnots: 12 });
  assert.equal(steaming.transitDays, 1);
  assert.equal(steaming.transitSpeedKnots, 12);
  assert.equal(steaming.speedSource, 'AIS_SOG');

  // A stopped vessel (SOG 0) is projected at the standard ballast speed.
  const stopped = projectTransitToPol({ distanceNm: 576, speedKnots: 0 });
  assert.equal(stopped.transitDays, 2);
  assert.equal(stopped.transitSpeedKnots, 12);
  assert.equal(stopped.speedSource, 'STANDARD_BALLAST_SPEED');

  // No distance means no projection.
  assert.equal(projectTransitToPol({ distanceNm: null, speedKnots: 11 }).transitDays, null);
});

test('the projected open date is compared against laydayStart and cancelling', () => {
  const within = evaluateLaycanFit('2026-09-12T00:00:00Z', '2026-09-10', '2026-09-15');
  assert.equal(within.laycanStatus, 'WITHIN');
  assert.equal(within.laycanCompliant, true);

  // Arriving before laydays is viable: the vessel waits for the window to open.
  const early = evaluateLaycanFit('2026-09-05T00:00:00Z', '2026-09-10', '2026-09-15');
  assert.equal(early.laycanStatus, 'EARLY');
  assert.equal(early.laycanCompliant, true);
  assert.equal(early.daysToLayday, 5);

  // Past the cancelling date the vessel is not commercially usable.
  const late = evaluateLaycanFit('2026-09-20T00:00:00Z', '2026-09-10', '2026-09-15');
  assert.equal(late.laycanStatus, 'LATE');
  assert.equal(late.laycanCompliant, false);
  // The cancelling date expires at 15 Sep 23:59:59, so 20 Sep is 4 days past it.
  assert.equal(late.daysAfterCancelling, 4);

  // The cancelling date runs to the end of that day.
  assert.equal(evaluateLaycanFit('2026-09-15T18:00:00Z', '2026-09-10', '2026-09-15').laycanStatus, 'WITHIN');

  // Without a projected date or a window there is no verdict.
  assert.equal(evaluateLaycanFit(null, '2026-09-10', '2026-09-15').laycanStatus, 'UNKNOWN');
  assert.equal(evaluateLaycanFit('2026-09-12T00:00:00Z', '', '').laycanCompliant, null);
});

test('a moored or anchored vessel inside the POL zone is classified as spot', () => {
  assert.equal(SPOT_PROXIMITY_NM, 30);

  const spot = classifyVesselOpenness(
    { draught: 4.2, max_draft: 9.5, nav_status: 'At anchor', sog: 0.1, distance_nm: 1.4 },
    { laydayStart: '2026-09-10', cancelling: '2026-09-15', now: NOW },
  );
  assert.equal(spot.status, 'IN_PORT_SPOT');
  assert.equal(spot.navState, 'ANCHORED');
  assert.equal(spot.badge.icon, '🟢');
  assert.equal(spot.badge.label, 'En Puerto / Spot');
  // Available now, therefore ahead of the laycan window.
  assert.equal(spot.estimatedOpenDate, NOW);
  assert.equal(spot.laycanStatus, 'EARLY');
  assert.equal(spot.laycanCompliant, true);
  assert.equal(spot.confidence, 'HIGH');

  // Moored 120 NM away is not spot at our POL.
  const distant = classifyVesselOpenness(
    { draught: 9.1, max_draft: 9.5, nav_status: 'Moored', sog: 0, distance_nm: 120 },
    { now: NOW },
  );
  assert.notEqual(distant.status, 'IN_PORT_SPOT');
  assert.equal(distant.isNearPol, false);
});

test('a ballaster gets the blue badge and a transit-based open date', () => {
  const ballaster = classifyVesselOpenness(
    {
      draught: 4.8,
      max_draft: 10.2,
      navigational_status: 'Under way using engine',
      sog: 12,
      destination: 'BEJAIA',
      distance_nm: 288,
    },
    { laydayStart: '2026-09-10', cancelling: '2026-09-15', now: NOW },
  );

  assert.equal(ballaster.status, 'BALLASTER');
  assert.equal(ballaster.isBallast, true);
  assert.equal(ballaster.badge.icon, '🔵');
  assert.equal(ballaster.badge.label, 'Ballaster / En Lastre');
  assert.equal(ballaster.transitDays, 1);
  // 3 Sep + 1 transit day = 4 Sep, ahead of the 10 Sep laydays.
  assert.equal(ballaster.estimatedOpenDate, '2026-09-04T00:00:00.000Z');
  assert.equal(ballaster.estimatedOpenDateLabel, '4 Sep');
  assert.equal(ballaster.laycanStatus, 'EARLY');
  assert.equal(ballaster.laycanCompliant, true);
  assert.equal(ballaster.destination, 'BEJAIA');

  // A ballaster too far to make the window is flagged as late.
  const late = classifyVesselOpenness(
    { draught: 4.8, max_draft: 10.2, nav_status: 0, sog: 10, distance_nm: 6000 },
    { laydayStart: '2026-09-10', cancelling: '2026-09-15', now: NOW },
  );
  assert.equal(late.status, 'BALLASTER');
  assert.equal(late.laycanStatus, 'LATE');
  assert.equal(late.laycanCompliant, false);
});

test('a laden vessel gets the clock badge with the projected ETA', () => {
  assert.equal(LADEN_DISCHARGE_ALLOWANCE_DAYS, 3);

  const laden = classifyVesselOpenness(
    {
      draught: 9.8,
      max_draft: 10.2,
      nav_status: 'Under way using engine',
      sog: 12,
      destination: 'ALMERIA',
      distance_nm: 288,
    },
    { laydayStart: '2026-09-10', cancelling: '2026-09-15', now: NOW },
  );

  assert.equal(laden.status, 'LADEN_PROJECTED');
  assert.equal(laden.isBallast, false);
  assert.equal(laden.badge.icon, '⏱️');
  assert.equal(laden.badge.label, 'Apertura estimada');
  // 3 Sep + 1 transit day + 3 discharge days = 7 Sep.
  assert.equal(laden.estimatedOpenDate, '2026-09-07T00:00:00.000Z');
  assert.equal(laden.badge.detail, 'ETA 7 Sep');
  assert.equal(laden.projectionBasis, 'LADEN_TRANSIT_PLUS_DISCHARGE');

  // A reported AIS ETA takes precedence over the distance/speed estimate.
  const withEta = classifyVesselOpenness(
    {
      draught: 9.8,
      max_draft: 10.2,
      nav_status: 'Under way using engine',
      sog: 12,
      eta: '2026-09-09T00:00:00Z',
      distance_nm: 288,
    },
    { laydayStart: '2026-09-10', cancelling: '2026-09-20', now: NOW },
  );
  assert.equal(withEta.projectionBasis, 'AIS_ETA_PLUS_DISCHARGE');
  assert.equal(withEta.estimatedOpenDate, '2026-09-12T00:00:00.000Z');
  assert.equal(withEta.laycanStatus, 'WITHIN');

  // Past the cancelling date the badge switches to the late tone.
  const lateLaden = classifyVesselOpenness(
    { draught: 9.8, max_draft: 10.2, nav_status: 0, sog: 12, distance_nm: 288 },
    { laydayStart: '2026-09-04', cancelling: '2026-09-06', now: NOW },
  );
  assert.equal(lateLaden.laycanStatus, 'LATE');
  assert.equal(lateLaden.badge.tone, 'laden-late');
});

test('an unusable AIS signal yields no fabricated availability', () => {
  const blind = classifyVesselOpenness(
    { nav_status: 'Disponible', sog: 0 },
    { laydayStart: '2026-09-10', cancelling: '2026-09-15', now: NOW },
  );
  assert.equal(blind.status, 'UNKNOWN');
  assert.equal(blind.estimatedOpenDate, null);
  assert.equal(blind.laycanStatus, 'UNKNOWN');
  assert.equal(blind.confidence, 'LOW');
  assert.equal(blind.badge.icon, '⚪');

  // A master record whose only draft column is the design draft must not report
  // a 100% draft ratio and be mistaken for a fully laden vessel.
  const masterOnly = classifyVesselOpenness({ draft_meters: 9.5, dwt: 12000 }, { now: NOW });
  assert.equal(masterOnly.draftRatioBasis, 'DWT_ESTIMATED_MAX_DRAFT');
  assert.notEqual(masterOnly.draftRatio, 1);

  assert.equal(classifyVesselOpenness(null, { now: NOW }).status, 'UNKNOWN');
  assert.equal(formatOpennessDate(null), '');
});

test('the compatibility engine and UI are wired to the openness module', async () => {
  const apiSource = await readFile(new URL('../netlify/functions/vessel-compatibility.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /from "\.\.\/\.\.\/vessel-openness-engine\.mjs"/);
  assert.match(apiSource, /classifyVesselOpenness\(/);
  // The raw laycan window reaches the engine, not just the formatted label.
  assert.match(apiSource, /laydayStart: activeOperation\.laydayStart/);
  assert.match(apiSource, /cancelling: activeOperation\.cancelling/);
  assert.match(apiSource, /vesselOpenness: openness/);
  assert.match(apiSource, /opennessSummary/);
  // Instantaneous AIS draught stays separate from the master design draft.
  assert.match(apiSource, /currentDraftMeters: Number\(/);
  assert.match(apiSource, /maxDraftMeters: Number\(/);

  const clientSource = await readFile(new URL('../src/compatibilidad-module.js', import.meta.url), 'utf8');
  assert.match(clientSource, /from '\.\.\/vessel-openness-engine\.mjs'/);
  assert.match(clientSource, /renderOpennessBadge\(item\)/);
  assert.match(clientSource, /this\.renderOpennessBadge\(item\)/);
  assert.match(clientSource, /laydayStart: laydays \? String\(laydays\) : ''/);

  // The radar payload must actually carry draught, or the ballast rule is blind.
  const coordinatorSource = await readFile(new URL('../netlify/functions/_shared/aisCoordinator.js', import.meta.url), 'utf8');
  assert.match(coordinatorSource, /draught: finiteNumber\(vessel\.draught, vessel\.draught_average, vessel\.draft\)/);
  assert.match(coordinatorSource, /maxDraught: finiteNumber\(/);

  const enrichmentSource = await readFile(new URL('../netlify/functions/_shared/radar-enrichment.mjs', import.meta.url), 'utf8');
  assert.match(enrichmentSource, /max_draft: draftMeters/);

  // Badge styles exist for every tone the engine can emit.
  const cssSource = await readFile(new URL('../compatibilidad.css', import.meta.url), 'utf8');
  for (const tone of ['tone-spot', 'tone-ballast', 'tone-laden', 'tone-laden-late', 'tone-unknown']) {
    assert.match(cssSource, new RegExp(`\\.compat-openness-badge\\.${tone}`));
  }
  assert.match(cssSource, /\.compat-laycan-chip\.late/);
});
