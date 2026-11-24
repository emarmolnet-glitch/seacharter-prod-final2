/**
 * H16 Port Sheet (ports_master.source_payload.h16_port_sheet) — parsing and
 * vessel/port fit evaluation shared by the ports API and the browser engine.
 *
 * Pure functions only: no DOM, no network. Safe to import from Netlify
 * Functions and from the Vite frontend bundle.
 */

export const STANDARD_SEAWATER_DENSITY = 1.025;
export const BRACKISH_WATER_DENSITY_THRESHOLD = 1.020;
export const DEFAULT_PORT_RESTRICTION_BUFFER_DAYS = 0.5;
/** Waterplane coefficient used only when TPC must be estimated from LOA × beam. */
export const ESTIMATED_WATERPLANE_COEFFICIENT = 0.85;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function positiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Accepts the sheet as an object, as a serialized JSON string, or wrapped in a
 * full `source_payload`. Never throws: malformed input yields `null`.
 */
export function parseH16PortSheet(raw) {
  let value = raw;
  for (let depth = 0; depth < 3 && typeof value === "string"; depth += 1) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  const record = asRecord(value);
  if (!record) return null;
  if (record.h16_port_sheet !== undefined) return parseH16PortSheet(record.h16_port_sheet);
  if (record.restrictions_and_tides || record.quoting_and_operations) return record;
  return null;
}

function locateRawSheet(input) {
  const record = asRecord(input);
  if (!record) return input;
  const sourcePayload = record.source_payload ?? record.sourcePayload;
  const parsedPayload = typeof sourcePayload === "string" ? parseH16PortSheet(sourcePayload) : null;
  return firstDefined(
    record.h16Sheet,
    record.h16_sheet,
    record.h16_port_sheet,
    record.h16PortSheet,
    asRecord(sourcePayload)?.h16_port_sheet,
    parsedPayload,
    record.port && locateRawSheet(record.port),
    (record.restrictions_and_tides || record.quoting_and_operations) ? record : null,
  );
}

const DRAFT_SOURCE_LABELS = {
  channel_high: "Canal pleamar",
  berth: "Muelle",
  channel_low: "Canal bajamar",
};

/**
 * Normalizes every operational field of the H16 sheet (falling back to the
 * flattened ports_master columns when present on the record).
 */
export function resolvePortH16Profile(input) {
  const sheet = parseH16PortSheet(locateRawSheet(input));
  const record = asRecord(input) || {};
  const restrictions = asRecord(sheet?.restrictions_and_tides) || {};
  const operations = asRecord(sheet?.quoting_and_operations) || {};

  const berthDraftM = positiveNumber(firstDefined(restrictions.berth_draft_m, record.berth_draft_m, record.berthDraftM));
  const channelDraftHighM = positiveNumber(firstDefined(restrictions.channel_draft_high_m, record.channel_draft_high_m, record.channelDraftHighM));
  const channelDraftLowM = positiveNumber(firstDefined(restrictions.channel_draft_low_m, record.channel_draft_low_m, record.channelDraftLowM));

  const candidates = [
    channelDraftHighM !== null ? { source: "channel_high", meters: channelDraftHighM } : null,
    berthDraftM !== null ? { source: "berth", meters: berthDraftM } : null,
  ].filter(Boolean);
  if (!candidates.length && channelDraftLowM !== null) candidates.push({ source: "channel_low", meters: channelDraftLowM });
  candidates.sort((left, right) => left.meters - right.meters);
  const limiting = candidates[0] || null;
  const effectiveDraftM = limiting ? round(limiting.meters, 2) : null;

  const lowWaterDraftM = channelDraftLowM !== null && effectiveDraftM !== null && channelDraftLowM < effectiveDraftM
    ? round(channelDraftLowM, 2)
    : null;

  const warningsRaw = firstDefined(operations.operational_warnings, record.operational_warnings, record.operationalWarnings);
  const operationalWarnings = Array.isArray(warningsRaw)
    ? warningsRaw.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  const hasSheet = Boolean(sheet);
  const hasData = hasSheet || effectiveDraftM !== null;

  return {
    hasSheet,
    hasData,
    dataConfidence: sheet?.data_confidence ? String(sheet.data_confidence) : null,
    effectiveDraftM,
    effectiveDraftSource: limiting?.source || null,
    effectiveDraftLabel: limiting ? DRAFT_SOURCE_LABELS[limiting.source] : null,
    lowWaterDraftM,
    berthDraftM,
    channelDraftHighM,
    channelDraftLowM,
    maxLoaM: positiveNumber(firstDefined(operations.max_loa_m, record.max_loa_m, record.maxLoaM)),
    maxBeamM: positiveNumber(firstDefined(operations.max_beam_m, record.max_beam_m, record.maxBeamM)),
    waterDensity: positiveNumber(firstDefined(restrictions.water_density, record.water_density, record.waterDensity)),
    tidalRangeM: nullableNumber(firstDefined(restrictions.tidal_range_m, record.tidal_range_m, record.tidalRangeM)),
    tidalWindowRequired: nullableBoolean(firstDefined(restrictions.tidal_window_required, record.tidal_window_required, record.tidalWindowRequired)),
    nightNavigationAllowed: nullableBoolean(firstDefined(restrictions.night_navigation_allowed, record.night_navigation_allowed, record.nightNavigationAllowed)),
    gearedVesselRequired: nullableBoolean(firstDefined(operations.geared_vessel_required, record.geared_vessel_required, record.gearedVesselRequired)),
    operationalWarnings,
  };
}

/** Compact UI badges derived from the profile. */
export function buildPortH16Badges(profile) {
  if (!profile?.hasData) return [];
  const badges = [];
  if (profile.tidalWindowRequired === true) badges.push({ key: "tide", label: "Ventana de marea", tone: "warning" });
  if (profile.waterDensity !== null && profile.waterDensity < BRACKISH_WATER_DENSITY_THRESHOLD) {
    badges.push({ key: "density", label: `Agua dulce/salobre ${profile.waterDensity.toFixed(3)}`, tone: "info" });
  }
  if (profile.nightNavigationAllowed === false) badges.push({ key: "night", label: "Sin nav. nocturna", tone: "warning" });
  if (profile.gearedVesselRequired === true) badges.push({ key: "geared", label: "Requiere buque con grúas", tone: "warning" });
  return badges;
}

export function adjustDraftForWaterDensity(draftM, waterDensity) {
  const draft = positiveNumber(draftM);
  if (draft === null) return null;
  const density = positiveNumber(waterDensity);
  if (density === null || density >= STANDARD_SEAWATER_DENSITY) return draft;
  return draft * (STANDARD_SEAWATER_DENSITY / density);
}

/**
 * Evaluates whether a vessel fits a port according to its H16 sheet.
 * @param {object} profile  Output of resolvePortH16Profile.
 * @param {object} vessel   { draftM, loaM, beamM, tpc, cargoTons }
 */
export function evaluateVesselPortFit(profile, vessel = {}, options = {}) {
  const bufferPerPort = Number.isFinite(Number(options.bufferDaysPerPort)) && Number(options.bufferDaysPerPort) >= 0
    ? Number(options.bufferDaysPerPort)
    : DEFAULT_PORT_RESTRICTION_BUFFER_DAYS;

  const empty = {
    status: "unknown",
    hasData: false,
    isCritical: false,
    breaches: [],
    bufferDays: 0,
    bufferReasons: [],
  };
  if (!profile?.hasData) return empty;

  const vesselDraftM = positiveNumber(vessel.draftM);
  const vesselLoaM = positiveNumber(vessel.loaM);
  const vesselBeamM = positiveNumber(vessel.beamM);
  const density = profile.waterDensity;
  const densityCorrectionApplied = vesselDraftM !== null && density !== null && density < STANDARD_SEAWATER_DENSITY;
  const adjustedDraftM = vesselDraftM !== null ? adjustDraftForWaterDensity(vesselDraftM, density) : null;

  const breaches = [];
  let draftExcessM = 0;
  let draftOvercapacityPct = 0;
  if (adjustedDraftM !== null && profile.effectiveDraftM !== null && adjustedDraftM > profile.effectiveDraftM + 1e-9) {
    draftExcessM = adjustedDraftM - profile.effectiveDraftM;
    draftOvercapacityPct = (draftExcessM / profile.effectiveDraftM) * 100;
    breaches.push({
      type: "draft",
      excess: round(draftExcessM, 2),
      unit: "m",
      message: `Calado ${densityCorrectionApplied ? "corregido (FWA) " : ""}${adjustedDraftM.toFixed(2)} m > calado efectivo ${profile.effectiveDraftM.toFixed(2)} m (${profile.effectiveDraftLabel || "puerto"}): exceso ${draftExcessM.toFixed(2)} m (+${draftOvercapacityPct.toFixed(1)}%).`,
    });
  }
  if (vesselLoaM !== null && profile.maxLoaM !== null && vesselLoaM > profile.maxLoaM + 1e-9) {
    const excess = vesselLoaM - profile.maxLoaM;
    breaches.push({ type: "loa", excess: round(excess, 2), unit: "m", message: `Eslora ${vesselLoaM.toFixed(1)} m > eslora máx. ${profile.maxLoaM.toFixed(1)} m: exceso ${excess.toFixed(2)} m.` });
  }
  if (vesselBeamM !== null && profile.maxBeamM !== null && vesselBeamM > profile.maxBeamM + 1e-9) {
    const excess = vesselBeamM - profile.maxBeamM;
    breaches.push({ type: "beam", excess: round(excess, 2), unit: "m", message: `Manga ${vesselBeamM.toFixed(2)} m > manga máx. ${profile.maxBeamM.toFixed(2)} m: exceso ${excess.toFixed(2)} m.` });
  }

  // Cargo cut needed to bring the vessel down to the effective draft.
  let tpc = positiveNumber(vessel.tpc);
  let tpcEstimated = false;
  if (tpc === null && vesselLoaM !== null && vesselBeamM !== null) {
    tpc = (ESTIMATED_WATERPLANE_COEFFICIENT * vesselLoaM * vesselBeamM * STANDARD_SEAWATER_DENSITY) / 100;
    tpcEstimated = true;
  }
  let cargoCutTons = null;
  let cargoCutPct = null;
  if (draftExcessM > 0 && tpc !== null) {
    const portWaterTpc = tpc * ((density ?? STANDARD_SEAWATER_DENSITY) / STANDARD_SEAWATER_DENSITY);
    cargoCutTons = draftExcessM * 100 * portWaterTpc;
    const cargoTons = positiveNumber(vessel.cargoTons);
    if (cargoTons !== null) {
      cargoCutTons = Math.min(cargoCutTons, cargoTons);
      cargoCutPct = (cargoCutTons / cargoTons) * 100;
    }
  }

  const tidalAdvisory = vesselDraftM !== null && profile.lowWaterDraftM !== null && adjustedDraftM > profile.lowWaterDraftM
    && draftExcessM === 0;

  const bufferReasons = [];
  if (profile.tidalWindowRequired === true) bufferReasons.push("Ventana de marea");
  if (profile.nightNavigationAllowed === false) bufferReasons.push("Sin navegación nocturna");
  const bufferDays = bufferReasons.length ? bufferPerPort : 0;

  const isCritical = breaches.length > 0;
  const hasAdvisory = buildPortH16Badges(profile).length > 0 || tidalAdvisory;

  return {
    status: isCritical ? "critical" : hasAdvisory ? "warning" : "ok",
    hasData: true,
    isCritical,
    vesselDraftM,
    adjustedDraftM: adjustedDraftM !== null ? round(adjustedDraftM, 2) : null,
    densityCorrectionApplied,
    effectiveDraftM: profile.effectiveDraftM,
    draftExcessM: round(draftExcessM, 2),
    draftOvercapacityPct: round(draftOvercapacityPct, 1),
    draftMarginM: adjustedDraftM !== null && profile.effectiveDraftM !== null ? round(profile.effectiveDraftM - adjustedDraftM, 2) : null,
    tpc: tpc !== null ? round(tpc, 1) : null,
    tpcEstimated,
    cargoCutTons: cargoCutTons !== null ? Math.round(cargoCutTons) : null,
    cargoCutPct: cargoCutPct !== null ? round(cargoCutPct, 1) : null,
    tidalAdvisory,
    breaches,
    bufferDays,
    bufferReasons,
    operationalWarnings: profile.operationalWarnings || [],
  };
}

/**
 * Evaluates POL and POD together.
 * @param {Array<{role: string, name: string, port: object}>} ports
 */
export function evaluateRoutePortRestrictions(ports = [], vessel = {}, options = {}) {
  const evaluated = (Array.isArray(ports) ? ports : [])
    .filter((entry) => entry && entry.port)
    .map((entry) => {
      const profile = resolvePortH16Profile(entry.port);
      const fit = evaluateVesselPortFit(profile, vessel, options);
      return { role: String(entry.role || "").toUpperCase(), name: String(entry.name || ""), profile, fit };
    })
    .filter((entry) => entry.profile.hasData);

  const critical = evaluated.filter((entry) => entry.fit.isCritical);
  const totalBufferDays = evaluated.reduce((sum, entry) => sum + entry.fit.bufferDays, 0);
  const maxCargoCutTons = critical.reduce((max, entry) => Math.max(max, entry.fit.cargoCutTons ?? 0), 0);
  const maxCargoCutPct = critical.reduce((max, entry) => Math.max(max, entry.fit.cargoCutPct ?? 0), 0);

  return {
    hasData: evaluated.length > 0,
    ports: evaluated,
    hasCritical: critical.length > 0,
    criticalPorts: critical.map((entry) => entry.role),
    totalBufferDays: round(totalBufferDays, 2) || 0,
    maxCargoCutTons: maxCargoCutTons > 0 ? Math.round(maxCargoCutTons) : null,
    maxCargoCutPct: maxCargoCutPct > 0 ? round(maxCargoCutPct, 1) : null,
  };
}
