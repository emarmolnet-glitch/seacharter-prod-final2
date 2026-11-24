/**
 * View model for the Executive Report section
 * "RESTRICCIONES PORTUARIAS Y CONDICIONES OPERATIVAS", built from the H16 port
 * restriction snapshot (State.portRestrictions, produced by the Risk Matrix).
 *
 * Two audiences:
 *  - internal: full sheet + vessel fit + buffer days + cargo cut + $/MT impact + clauses.
 *  - client:   nautical / operating data and contractual conditions only. The client
 *              model is built from a whitelist, so no cost, break-even, margin, TCE,
 *              internal buffer or $/MT value can leak into it.
 */
import { resolvePortH16Profile, evaluateRoutePortRestrictions } from '../shared/port-h16-sheet.mjs';

const TEXT = {
  es: {
    effectiveDraft: 'Calado efectivo',
    lowWater: 'bajamar',
    maxLoa: 'Eslora máx.',
    maxBeam: 'Manga máx.',
    density: 'Densidad del agua',
    freshWater: 'agua dulce/salobre — calado de llegada a declarar en agua dulce (FWA)',
    seaWater: 'agua de mar',
    tidalWindow: 'Ventana de marea',
    tidalRequired: 'Obligatoria',
    tidalNotRequired: 'No requerida',
    tidalRange: 'rango',
    nightNav: 'Navegación nocturna',
    nightNotAllowed: 'No permitida (practicaje diurno)',
    nightAllowed: 'Permitida',
    notReported: 'No informado',
    vesselDraft: 'Calado buque',
    fwaCorrected: 'corregido FWA',
    compatible: 'Compatible',
    margin: 'margen',
    restricted: 'RESTRICCIÓN DE PUERTO · NO VIABLE A PLENA CARGA',
    excess: 'exceso',
    loaExcess: 'eslora',
    beamExcess: 'manga',
    draftExcess: 'calado',
    overcapacity: 'sobrecapacidad de calado',
    buffer: 'Buffer operativo aplicado',
    days: 'días',
    cargoCut: 'Recorte orientativo de carga',
    tpcEstimated: 'TPC estimado',
    breakEvenImpact: 'Impacto en break-even',
    warnings: 'Avisos operativos H16',
    conditions: 'Condiciones operativas y contractuales',
    clauses: 'Cláusulas recomendadas (Fixture Recap)',
    source: 'Fuente: ficha oficial WPI · H16',
    channelHigh: 'Canal pleamar',
    berth: 'Muelle',
    channelLow: 'Canal bajamar',
    condDraft: (port, draft) => `${port}: cantidad sujeta al calado efectivo del puerto (${draft}); el buque deberá permanecer siempre a flote (Always Safely Afloat).`,
    condRestricted: (port) => `${port}: cantidad final a confirmar por el armador conforme a la restricción de calado del puerto (max. cargo permitted by port draft).`,
    condTide: (port) => `${port}: entrada y salida sujetas a ventana de marea; el tiempo de espera por marea se regirá por lo pactado en la póliza.`,
    condNight: (port) => `${port}: maniobras y practicaje sólo en horario diurno.`,
    condDensity: (port, density) => `${port}: agua de densidad ${density} t/m³; el calado de llegada se declarará corregido por agua dulce (FWA).`,
    condGeared: (port) => `${port}: se requiere buque con grúas propias.`,
  },
  en: {
    effectiveDraft: 'Effective draft',
    lowWater: 'low water',
    maxLoa: 'Max LOA',
    maxBeam: 'Max beam',
    density: 'Water density',
    freshWater: 'fresh/brackish water — arrival draft to be declared in fresh water (FWA)',
    seaWater: 'seawater',
    tidalWindow: 'Tidal window',
    tidalRequired: 'Required',
    tidalNotRequired: 'Not required',
    tidalRange: 'range',
    nightNav: 'Night navigation',
    nightNotAllowed: 'Not permitted (daylight pilotage)',
    nightAllowed: 'Permitted',
    notReported: 'Not reported',
    vesselDraft: 'Vessel draft',
    fwaCorrected: 'FWA corrected',
    compatible: 'Compatible',
    margin: 'margin',
    restricted: 'PORT RESTRICTION · NOT VIABLE AT FULL LOAD',
    excess: 'excess',
    loaExcess: 'LOA',
    beamExcess: 'beam',
    draftExcess: 'draft',
    overcapacity: 'draft overcapacity',
    buffer: 'Operational buffer applied',
    days: 'days',
    cargoCut: 'Indicative cargo reduction',
    tpcEstimated: 'estimated TPC',
    breakEvenImpact: 'Break-even impact',
    warnings: 'H16 operational warnings',
    conditions: 'Operating & contractual conditions',
    clauses: 'Recommended clauses (Fixture Recap)',
    source: 'Source: official WPI port sheet · H16',
    channelHigh: 'Channel high water',
    berth: 'Berth',
    channelLow: 'Channel low water',
    condDraft: (port, draft) => `${port}: cargo quantity subject to the port's effective draft (${draft}); vessel to remain Always Safely Afloat.`,
    condRestricted: (port) => `${port}: final quantity to be confirmed by Owners in line with the port draft restriction (max. cargo permitted by port draft).`,
    condTide: (port) => `${port}: arrival and departure subject to tidal window; time lost waiting for tide as per charter party terms.`,
    condNight: (port) => `${port}: manoeuvres and pilotage in daylight hours only.`,
    condDensity: (port, density) => `${port}: water density ${density} t/m³; arrival draft to be declared corrected for fresh water (FWA).`,
    condGeared: (port) => `${port}: geared vessel required.`,
    reasons: { 'Ventana de marea': 'Tidal window', 'Sin navegación nocturna': 'No night navigation' },
  },
};

const WARNING_TRANSLATIONS_EN = [
  [/^Requiere cálculo de ventana de marea para navegación y desatraque \(Rango de marea: ([^)]+)\)\.?$/i, (m) => `Tidal window calculation required for navigation and unberthing (tidal range: ${m[1]}).`],
  [/^Densidad de agua reducida \(([^)]+)\): verificar calado en agua dulce \(Fresh Water Draft\)\.?$/i, (m) => `Reduced water density (${m[1]}): verify Fresh Water Draft.`],
  [/^Calado de muelle restrictivo \(([^)]+)\): limitado a buques coaster \/ short-sea\.?$/i, (m) => `Restrictive berth draft (${m[1]}): limited to coaster / short-sea vessels.`],
  [/^Navegación nocturna no permitida o restringida a criterio de capitanía\.?$/i, () => "Night navigation not permitted or restricted at the Harbour Master's discretion."],
];

export function translateH16Warning(warning, lang = 'es') {
  const text = String(warning ?? '').trim();
  if (lang !== 'en') return text;
  for (const [pattern, build] of WARNING_TRANSLATIONS_EN) {
    const match = text.match(pattern);
    if (match) return build(match);
  }
  return text;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function meters(value, decimals = 2) {
  const n = num(value);
  return n !== null && n > 0 ? `${n.toFixed(decimals)} m` : null;
}

function length(value) {
  const n = num(value);
  if (n === null || n <= 0) return null;
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)} m`;
}

function sourceLabel(source, t) {
  if (source === 'channel_high') return t.channelHigh;
  if (source === 'berth') return t.berth;
  if (source === 'channel_low') return t.channelLow;
  return null;
}

/** Returns the restriction snapshot for the report, evaluating live when needed. */
export function resolveReportPortRestrictions(data = {}, bridge = null) {
  const snapshot = data?.portRestrictions;
  if (snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.ports) && snapshot.ports.length) return snapshot;
  if (bridge && typeof bridge.evaluateCurrentRoute === 'function') {
    try {
      const live = bridge.evaluateCurrentRoute(data);
      if (live?.hasData) return live;
    } catch {
      // Fall through to the static fallback.
    }
  }
  // Recaps may carry the raw port records (with h16Sheet) instead of an evaluated snapshot.
  const rawPorts = [
    { role: 'POL', name: data?.pol, port: data?.polPortRecord || data?.polPort },
    { role: 'POD', name: data?.pod, port: data?.podPortRecord || data?.podPort },
  ].filter((entry) => entry.port && resolvePortH16Profile(entry.port).hasData);
  if (!rawPorts.length) return null;
  return evaluateRoutePortRestrictions(rawPorts, { draftM: data?.calado_actual || data?.draft });
}

function buildPortCommon(entry, t, lang) {
  const profile = entry.profile || {};
  const label = `${entry.role} · ${entry.name || entry.role}`;
  const density = num(profile.waterDensity);
  const tidalRange = num(profile.tidalRangeM);
  const lines = [];
  const effective = meters(profile.effectiveDraftM);
  const low = meters(profile.lowWaterDraftM);
  const source = sourceLabel(profile.effectiveDraftSource, t);
  lines.push({ key: 'draft', label: t.effectiveDraft, value: effective ? `${effective}${source ? ` (${source})` : ''}${low ? ` · ${t.lowWater} ${low}` : ''}` : t.notReported });
  lines.push({ key: 'loa', label: t.maxLoa, value: length(profile.maxLoaM) || t.notReported });
  lines.push({ key: 'beam', label: t.maxBeam, value: meters(profile.maxBeamM) || t.notReported });
  lines.push({
    key: 'density',
    label: t.density,
    value: density ? `${density.toFixed(3)} t/m³ (${density < 1.020 ? t.freshWater : t.seaWater})` : t.notReported,
  });
  lines.push({
    key: 'tide',
    label: t.tidalWindow,
    value: profile.tidalWindowRequired === true
      ? `${t.tidalRequired}${tidalRange !== null && tidalRange > 0 ? ` (${t.tidalRange} ${tidalRange.toFixed(2)} m)` : ''}`
      : profile.tidalWindowRequired === false ? t.tidalNotRequired : t.notReported,
  });
  lines.push({
    key: 'night',
    label: t.nightNav,
    value: profile.nightNavigationAllowed === false ? t.nightNotAllowed : profile.nightNavigationAllowed === true ? t.nightAllowed : t.notReported,
  });

  const conditions = [];
  if (effective) conditions.push(t.condDraft(label, effective));
  if (entry.fit?.isCritical) conditions.push(t.condRestricted(label));
  if (profile.tidalWindowRequired === true) conditions.push(t.condTide(label));
  if (profile.nightNavigationAllowed === false) conditions.push(t.condNight(label));
  if (density && density < 1.025) conditions.push(t.condDensity(label, density.toFixed(3)));
  if (profile.gearedVesselRequired === true) conditions.push(t.condGeared(label));

  return {
    role: entry.role,
    name: entry.name || entry.role,
    lines,
    warnings: (profile.operationalWarnings || []).map((item) => translateH16Warning(item, lang)).filter(Boolean),
    conditions,
  };
}

function buildInternalFit(entry, t) {
  const fit = entry.fit || {};
  const profile = entry.profile || {};
  const vesselDraft = meters(fit.vesselDraftM);
  const extra = [];
  extra.push({
    key: 'vesselDraft',
    label: t.vesselDraft,
    value: vesselDraft
      ? `${vesselDraft}${fit.densityCorrectionApplied && fit.adjustedDraftM ? ` → ${meters(fit.adjustedDraftM)} (${t.fwaCorrected}, ${num(profile.waterDensity)?.toFixed(3)})` : ''}`
      : t.notReported,
  });
  let status;
  if (fit.isCritical) {
    const parts = (fit.breaches || []).map((breach) => {
      const kind = breach.type === 'draft' ? t.draftExcess : breach.type === 'loa' ? t.loaExcess : t.beamExcess;
      return `${kind} +${num(breach.excess)?.toFixed(2)} m`;
    });
    status = {
      critical: true,
      text: `${t.restricted} — ${t.excess}: ${parts.join(', ')}${num(fit.draftOvercapacityPct) ? ` (${t.overcapacity} +${num(fit.draftOvercapacityPct).toFixed(1)}%)` : ''}`,
    };
  } else if (num(fit.draftMarginM) !== null && vesselDraft) {
    status = { critical: false, text: `${t.compatible} — ${t.margin} ${num(fit.draftMarginM).toFixed(2)} m` };
  } else {
    status = { critical: false, text: `${t.vesselDraft}: ${t.notReported}` };
  }
  extra.push({ key: 'buffer', label: t.buffer, value: `+${(num(fit.bufferDays) || 0).toFixed(2)} ${t.days}${fit.bufferReasons?.length ? ` (${fit.bufferReasons.map((reason) => t.reasons?.[reason] || reason).join(' · ')})` : ''}` });
  if (fit.isCritical && num(fit.cargoCutTons)) {
    extra.push({
      key: 'cargoCut',
      label: t.cargoCut,
      value: `~${Math.round(fit.cargoCutTons).toLocaleString('en-US')} MT${num(fit.cargoCutPct) ? ` (${num(fit.cargoCutPct).toFixed(1)}%)` : ''}${fit.tpcEstimated ? ` · ${t.tpcEstimated}` : ''}`,
    });
  }
  return { extra, status };
}

/**
 * @param {object|null} portRestrictions  snapshot (State.portRestrictions)
 * @param {{ audience: 'internal'|'client', lang: 'es'|'en' }} options
 */
export function buildPortRestrictionReportModel(portRestrictions, { audience = 'internal', lang = 'es' } = {}) {
  if (!portRestrictions || !Array.isArray(portRestrictions.ports) || !portRestrictions.ports.length) return null;
  const t = TEXT[lang === 'en' ? 'en' : 'es'];
  const ports = portRestrictions.ports
    .filter((entry) => entry && (entry.role === 'POL' || entry.role === 'POD'))
    .map((entry) => {
      const common = buildPortCommon(entry, t, lang);
      if (audience !== 'internal') return common;
      const internal = buildInternalFit(entry, t);
      return { ...common, lines: [...common.lines, ...internal.extra], status: internal.status };
    });
  if (!ports.length) return null;

  const model = { audience, lang, labels: { warnings: t.warnings, conditions: t.conditions, clauses: t.clauses, source: t.source }, ports };
  if (audience !== 'internal') return model;

  const impact = num(portRestrictions.breakEvenImpactPerMt);
  model.summary = {
    hasCritical: Boolean(portRestrictions.hasCritical),
    totalBuffer: `+${(num(portRestrictions.totalBufferDays) || 0).toFixed(2)} ${t.days}`,
    totalBufferLabel: t.buffer,
    cargoCut: num(portRestrictions.maxCargoCutTons)
      ? `~${Math.round(portRestrictions.maxCargoCutTons).toLocaleString('en-US')} MT${num(portRestrictions.maxCargoCutPct) ? ` (${num(portRestrictions.maxCargoCutPct).toFixed(1)}%)` : ''}`
      : null,
    cargoCutLabel: t.cargoCut,
    breakEvenImpact: impact && impact > 0 ? `+$${impact.toFixed(2)}/MT` : null,
    breakEvenImpactLabel: t.breakEvenImpact,
  };
  model.clauses = lang === 'en'
    ? ports.flatMap((port) => port.conditions)
    : String(portRestrictions.fixtureClauseAdvice || '')
      .replace(/^Restricciones H16:\s*/i, '')
      .split(/(?<=\.)\s+(?=(?:POL|POD)\b)/)
      .map((item) => item.trim())
      .filter(Boolean);
  if (!model.clauses.length) model.clauses = ports.flatMap((port) => port.conditions);
  return model;
}
