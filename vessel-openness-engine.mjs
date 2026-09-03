/**
 * =============================================================================
 * SeaCharter Core PRO — Motor de Inferencia de Disponibilidad Operativa
 * (Vessel Openness)
 * =============================================================================
 * Responde a la pregunta comercial que sigue al filtro de tamaño (banda de DWT):
 * ¿está el buque libre para cargar dentro de nuestro Laycan?
 *
 * La inferencia se apoya en tres señales del payload de proximidad/radar
 * (Datalastic/AIS) más el registro técnico de `vessels_master`:
 *   1. Calado actual vs. calado máximo  -> estado de lastre (ballast / laden).
 *   2. Estado de navegación + distancia  -> buque spot en puerto/rada del POL.
 *   3. Velocidad sobre fondo + distancia -> proyección de fecha de apertura.
 *
 * Auditoría del payload de radar (véase netlify/functions/_shared/aisCoordinator.js
 * `normalizeTelemetry` y netlify/functions/_shared/radar-enrichment.mjs):
 *   - calado actual .......... draught / draft / draught_average / current_draft
 *   - calado máximo .......... max_draft / summer_draft / draught_max / design_draft
 *                              y `vessels_master.draft_meters` (calado de diseño)
 *   - estado navegación ...... navigational_status / nav_status / navigation_status
 *   - velocidad .............. sog / speed / speedKnots / speed_over_ground
 *   - destino ................ destination / destination_port / dest
 * El calado máximo no viaja en la señal AIS de la mayoría de buques, por lo que
 * existe una estimación de respaldo derivada del DWT admitido.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Regla comercial principal: un buque con menos del 65% de su calado máximo
// no lleva carga suficiente para estar comprometido; navega en lastre.
export const BALLAST_DRAFT_RATIO_THRESHOLD = 0.65;

// Cuando el calado máximo se estima desde el DWT la señal es más ruidosa, así que
// el umbral se endurece para no declarar lastre por un error de la aproximación.
export const BALLAST_DRAFT_RATIO_THRESHOLD_ESTIMATED = 0.6;

// Velocidad estándar de tránsito en lastre cuando el SOG es 0 (fondeado/parado).
export const DEFAULT_BALLAST_SPEED_KNOTS = 12;

// Radio en el que se considera que el buque ya está "en la zona" del POL. Alineado
// con el umbral POL/POD de determineLocationContext() en vessel-compatibility.ts.
export const SPOT_PROXIMITY_NM = 30;

// Margen de descarga + posicionamiento para un buque que llega cargado.
export const LADEN_DISCHARGE_ALLOWANCE_DAYS = 3;

// Curva de regresión calado_diseño ≈ 0,5243 · DWT^0,2931, ajustada sobre el rango
// coaster→capesize (10.000 DWT ≈ 7,8 m; 55.000 DWT ≈ 12,9 m; 180.000 DWT ≈ 18,2 m).
const DWT_TO_DRAFT_COEFFICIENT = 0.5243;
const DWT_TO_DRAFT_EXPONENT = 0.2931;

const CURRENT_DRAFT_KEYS = Object.freeze([
  "currentDraftMeters", "current_draft_meters", "currentDraft", "current_draft",
  "currentDraught", "current_draught", "draught_average", "draughtAverage",
  "draught", "Draught", "draft", "Draft", "draftMeters", "draft_meters",
]);

const MAX_DRAFT_KEYS = Object.freeze([
  "maxDraftMeters", "max_draft_meters", "max_draft", "maxDraft", "maxDraught",
  "max_draught", "draught_max", "draughtMax", "summer_draft", "summerDraft",
  "summer_draught", "summerDraught", "designDraft", "design_draft",
  "designDraught", "design_draught", "verifiedDesignDraft", "verified_design_draft",
  "MaximumStaticDraught", "draft_meters", "draftMeters",
]);

const NAV_STATUS_KEYS = Object.freeze([
  "navigational_status", "navigationalStatus", "nav_status", "navStatus",
  "navigation_status", "navigationStatus", "status", "aisStatus", "ais_status",
]);

const SPEED_KEYS = Object.freeze([
  "sog", "SOG", "speedKnots", "speed_knots", "speed", "speedOverGround", "speed_over_ground",
]);

const DESTINATION_KEYS = Object.freeze([
  "destination", "Destination", "destination_port", "destinationPort", "dest", "DEST",
]);

const DISTANCE_TO_POL_KEYS = Object.freeze([
  "distanceToPolNm", "distance_to_pol_nm", "distancePolNm", "distance_pol_nm",
  "currentDistanceToLoadPort", "distanceToLoadPortNm", "ballastDistanceNM", "distance_nm",
]);

const REPORTED_ETA_KEYS = Object.freeze([
  "destinationEta", "destination_eta", "etaDestination", "eta_destination",
  "aisEta", "ais_eta", "eta", "ETA",
]);

const SPANISH_SHORT_MONTHS = Object.freeze([
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]);

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(",", ".").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

// Recorre los alias en el propio objeto y en los contenedores anidados habituales
// (radarLive, neonDbMaster, ais, vessel, metadata...) sin recursión ilimitada.
function readAliased(source, keys) {
  if (!source || typeof source !== "object") return null;
  const containers = [
    source,
    source.radarLive, source.radar_live, source.ais, source.AIS,
    source.vessel, source.neonDbMaster, source.neon_db_master, source.master,
    source.telemetry, source.metadata, source.staticData, source.routing,
  ];
  for (const container of containers) {
    if (!container || typeof container !== "object") continue;
    for (const key of keys) {
      const value = container[key];
      if (value === null || value === undefined) continue;
      if (typeof value === "object") continue;
      if (typeof value !== "number" && String(value).trim() === "") continue;
      return value;
    }
  }
  return null;
}

function validDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  const text = String(value).trim();
  // Una fecha sin hora se ancla a UTC para que el laycan no baile con el huso local.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function endOfDay(value) {
  const date = validDate(value);
  if (!date) return null;
  // El cancelling es una fecha de calendario: vence al terminar el día.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function resolveCurrentDraftMeters(vessel) {
  const draft = optionalNumber(readAliased(vessel, CURRENT_DRAFT_KEYS));
  return draft !== null && draft > 0 ? draft : null;
}

export function resolveMaxDraftMeters(vessel) {
  const draft = optionalNumber(readAliased(vessel, MAX_DRAFT_KEYS));
  return draft !== null && draft > 0 ? draft : null;
}

export function resolveSpeedKnots(vessel) {
  const speed = optionalNumber(readAliased(vessel, SPEED_KEYS));
  return speed !== null && speed >= 0 ? speed : null;
}

export function resolveDestination(vessel) {
  const destination = readAliased(vessel, DESTINATION_KEYS);
  const text = String(destination ?? "").trim();
  return text ? text : null;
}

export function resolveNavigationalStatus(vessel) {
  const status = readAliased(vessel, NAV_STATUS_KEYS);
  if (typeof status === "number") return Number.isFinite(status) ? status : null;
  const text = String(status ?? "").trim();
  return text ? text : null;
}

export function resolveDistanceToPolNm(vessel) {
  const distance = optionalNumber(readAliased(vessel, DISTANCE_TO_POL_KEYS));
  return distance !== null && distance >= 0 ? distance : null;
}

/**
 * Calado de diseño aproximado a partir del DWT admitido. Sirve de denominador
 * cuando el payload AIS no publica `max_draft` / `summer_draft`.
 */
export function estimateMaxDraftFromDwt(dwt) {
  const deadweight = optionalNumber(dwt);
  if (deadweight === null || deadweight <= 0) return null;
  const estimated = DWT_TO_DRAFT_COEFFICIENT * Math.pow(deadweight, DWT_TO_DRAFT_EXPONENT);
  if (!Number.isFinite(estimated) || estimated <= 0) return null;
  return Math.round(estimated * 100) / 100;
}

/**
 * Traduce el estado de navegación AIS (código numérico 0-15 o texto en inglés /
 * castellano) a los estados operativos que necesita el matching comercial.
 */
export function classifyNavigationalStatus(status) {
  if (status === null || status === undefined || String(status).trim() === "") return "UNKNOWN";

  const numeric = typeof status === "number" ? status : (/^\d{1,2}$/.test(String(status).trim()) ? Number(status) : null);
  if (numeric !== null && Number.isFinite(numeric)) {
    if (numeric === 1) return "ANCHORED";
    if (numeric === 5) return "MOORED";
    if (numeric === 0 || numeric === 8) return "UNDER_WAY";
    if (numeric === 4) return "UNDER_WAY";
    if (numeric === 2 || numeric === 3 || numeric === 6) return "RESTRICTED";
    return "UNKNOWN";
  }

  const text = String(status).toLowerCase();
  if (/\b(moored|amarrado|atracado|alongside|berth|en muelle|muelle)\b/.test(text)) return "MOORED";
  if (/\b(anchor|anchored|at anchor|fondeo|fondeado|en rada|rada|anclado)\b/.test(text)) return "ANCHORED";
  if (/\b(under\s*way|underway|en ruta|navegando|en tr[aá]nsito|transit|sailing|aproximaci[oó]n|steaming)\b/.test(text)) return "UNDER_WAY";
  if (/\b(not under command|restricted|aground|varado|sin gobierno|maniobra restringida)\b/.test(text)) return "RESTRICTED";
  if (/\b(disponible|available|open)\b/.test(text)) return "UNKNOWN";
  return "UNKNOWN";
}

/**
 * Cálculo de lastre. Regla directa cuando hay calado máximo declarado; si no,
 * se compara el calado actual contra el calado de diseño aproximado por DWT.
 */
export function evaluateBallastStatus({ draft, maxDraft, dwt } = {}) {
  const currentDraft = optionalNumber(draft);
  const declaredMaxDraft = optionalNumber(maxDraft);

  if (currentDraft === null || currentDraft <= 0) {
    return {
      isBallast: false,
      ratio: null,
      currentDraftMeters: currentDraft !== null && currentDraft > 0 ? currentDraft : null,
      maxDraftMeters: declaredMaxDraft !== null && declaredMaxDraft > 0 ? declaredMaxDraft : null,
      basis: "NO_DRAFT_SIGNAL",
      threshold: null,
      confidence: "LOW",
    };
  }

  if (declaredMaxDraft !== null && declaredMaxDraft > 0) {
    const ratio = currentDraft / declaredMaxDraft;
    // Un calado por encima del máximo declarado delata un dato corrupto o un
    // calado de diseño desfasado: no se emite veredicto de lastre.
    if (ratio > 1.35) {
      return {
        isBallast: false,
        ratio: Math.round(ratio * 1000) / 1000,
        currentDraftMeters: currentDraft,
        maxDraftMeters: declaredMaxDraft,
        basis: "INCONSISTENT_DRAFT",
        threshold: BALLAST_DRAFT_RATIO_THRESHOLD,
        confidence: "LOW",
      };
    }
    return {
      isBallast: ratio <= BALLAST_DRAFT_RATIO_THRESHOLD,
      ratio: Math.round(ratio * 1000) / 1000,
      currentDraftMeters: currentDraft,
      maxDraftMeters: declaredMaxDraft,
      basis: "DECLARED_MAX_DRAFT",
      threshold: BALLAST_DRAFT_RATIO_THRESHOLD,
      confidence: "HIGH",
    };
  }

  const estimatedMaxDraft = estimateMaxDraftFromDwt(dwt);
  if (estimatedMaxDraft === null) {
    return {
      isBallast: false,
      ratio: null,
      currentDraftMeters: currentDraft,
      maxDraftMeters: null,
      basis: "NO_MAX_DRAFT_REFERENCE",
      threshold: null,
      confidence: "LOW",
    };
  }

  const ratio = currentDraft / estimatedMaxDraft;
  return {
    isBallast: ratio <= BALLAST_DRAFT_RATIO_THRESHOLD_ESTIMATED,
    ratio: Math.round(ratio * 1000) / 1000,
    currentDraftMeters: currentDraft,
    maxDraftMeters: estimatedMaxDraft,
    basis: "DWT_ESTIMATED_MAX_DRAFT",
    threshold: BALLAST_DRAFT_RATIO_THRESHOLD_ESTIMATED,
    confidence: "MEDIUM",
  };
}

/**
 * Días de tránsito hasta el POL: distanciaNM / (velocidad · 24). Un SOG de 0
 * (buque fondeado o parado) cae a la velocidad estándar en lastre.
 */
export function projectTransitToPol({ distanceNm, speedKnots, ballastSpeedKnots } = {}) {
  const distance = optionalNumber(distanceNm);
  const reportedSpeed = optionalNumber(speedKnots);
  const fallbackSpeed = optionalNumber(ballastSpeedKnots) ?? DEFAULT_BALLAST_SPEED_KNOTS;
  const effectiveSpeed = reportedSpeed !== null && reportedSpeed > 0 ? reportedSpeed : fallbackSpeed;

  if (distance === null || distance < 0 || !(effectiveSpeed > 0)) {
    return { transitDays: null, transitSpeedKnots: null, speedSource: null, distanceNm: distance };
  }

  return {
    transitDays: Math.round((distance / (effectiveSpeed * 24)) * 100) / 100,
    transitSpeedKnots: effectiveSpeed,
    speedSource: reportedSpeed !== null && reportedSpeed > 0 ? "AIS_SOG" : "STANDARD_BALLAST_SPEED",
    distanceNm: distance,
  };
}

/**
 * Contrasta la fecha de apertura proyectada con la ventana [laydayStart, cancelling].
 * Llegar antes del layday es viable (el buque espera); pasado el cancelling, no.
 */
export function evaluateLaycanFit(estimatedOpenDate, laydayStart, cancelling) {
  const openDate = validDate(estimatedOpenDate);
  const laydays = validDate(laydayStart);
  const cancel = endOfDay(cancelling);

  if (!openDate || (!laydays && !cancel)) {
    return { laycanStatus: "UNKNOWN", laycanCompliant: null, daysToLayday: null, daysAfterCancelling: null };
  }

  const daysToLayday = laydays ? Math.round(((laydays.getTime() - openDate.getTime()) / DAY_MS) * 10) / 10 : null;
  const daysAfterCancelling = cancel ? Math.round(((openDate.getTime() - cancel.getTime()) / DAY_MS) * 10) / 10 : null;

  if (cancel && openDate.getTime() > cancel.getTime()) {
    return { laycanStatus: "LATE", laycanCompliant: false, daysToLayday, daysAfterCancelling };
  }
  if (laydays && openDate.getTime() < laydays.getTime()) {
    return { laycanStatus: "EARLY", laycanCompliant: true, daysToLayday, daysAfterCancelling };
  }
  return { laycanStatus: "WITHIN", laycanCompliant: true, daysToLayday, daysAfterCancelling };
}

export function formatOpennessDate(value) {
  const date = validDate(value);
  if (!date) return "";
  return `${date.getUTCDate()} ${SPANISH_SHORT_MONTHS[date.getUTCMonth()]}`;
}

function buildBadge(status, estimatedOpenDate, laycanStatus) {
  if (status === "IN_PORT_SPOT") {
    return {
      icon: "🟢",
      label: "En Puerto / Spot",
      tone: "spot",
      detail: "Amarrado o fondeado en la zona del POL: disponible de inmediato",
    };
  }
  if (status === "BALLASTER") {
    const eta = formatOpennessDate(estimatedOpenDate);
    return {
      icon: "🔵",
      label: "Ballaster / En Lastre",
      tone: "ballast",
      detail: eta ? `Navegando en lastre · apertura ${eta}` : "Navegando en lastre hacia la zona",
    };
  }
  if (status === "LADEN_PROJECTED") {
    const eta = formatOpennessDate(estimatedOpenDate);
    return {
      icon: "⏱️",
      label: "Apertura estimada",
      tone: laycanStatus === "LATE" ? "laden-late" : "laden",
      detail: eta ? `ETA ${eta}` : "Cargado · sin datos para proyectar apertura",
    };
  }
  return {
    icon: "⚪",
    label: "Disponibilidad sin confirmar",
    tone: "unknown",
    detail: "Señal AIS insuficiente para inferir apertura",
  };
}

/**
 * Motor de inferencia completo: estado de lastre + proyección de apertura +
 * encaje con el laycan, listo para inyectar en la tarjeta del buque.
 *
 * @param {object} vessel   Candidato de radar/`vessels_master` (payload mixto).
 * @param {object} context  { laydayStart, cancelling, distanceToPolNm, polProximityNm, now, dwt }
 */
export function classifyVesselOpenness(vessel, context = {}) {
  const source = vessel && typeof vessel === "object" ? vessel : {};
  const now = validDate(context.now) || new Date();
  const polProximityNm = optionalNumber(context.polProximityNm) ?? SPOT_PROXIMITY_NM;

  const rawNavStatus = resolveNavigationalStatus(source);
  const navState = classifyNavigationalStatus(rawNavStatus);
  const speedKnots = resolveSpeedKnots(source);
  const destination = resolveDestination(source);
  const currentDraft = resolveCurrentDraftMeters(source);
  const declaredMaxDraft = resolveMaxDraftMeters(source);
  const dwt = optionalNumber(context.dwt) ?? optionalNumber(readAliased(source, ["dwt", "DWT", "deadweight"]));

  // El calado máximo y el actual pueden resolverse al mismo campo (`draft_meters`
  // del maestro es el único calado publicado de muchos buques). En ese caso no
  // hay contraste posible y el ratio quedaría clavado en 1,0 — se descarta.
  const maxDraft = declaredMaxDraft !== null && currentDraft !== null && declaredMaxDraft === currentDraft
    ? null
    : declaredMaxDraft;

  const ballast = evaluateBallastStatus({ draft: currentDraft, maxDraft, dwt });

  const distanceToPolNm = optionalNumber(context.distanceToPolNm) ?? resolveDistanceToPolNm(source);
  const isNearPol = distanceToPolNm !== null && distanceToPolNm <= polProximityNm;
  const isStationary = navState === "MOORED" || navState === "ANCHORED";

  const transit = projectTransitToPol({
    distanceNm: distanceToPolNm,
    speedKnots,
    ballastSpeedKnots: context.ballastSpeedKnots,
  });

  let status = "UNKNOWN";
  let estimatedOpenDate = null;
  let projectionBasis = "INSUFFICIENT_SIGNAL";

  if (isStationary && isNearPol) {
    // Buque spot: ya está en puerto o en la rada del POL.
    status = "IN_PORT_SPOT";
    estimatedOpenDate = now;
    projectionBasis = "SPOT_AT_POL";
  } else if (ballast.isBallast || isStationary) {
    // En lastre navegando, o fondeado fuera de zona: tránsito hasta el POL.
    status = ballast.isBallast ? "BALLASTER" : "LADEN_PROJECTED";
    if (transit.transitDays !== null) {
      estimatedOpenDate = addDays(now, transit.transitDays);
      projectionBasis = "BALLAST_TRANSIT_TO_POL";
    }
    if (status === "LADEN_PROJECTED" && transit.transitDays !== null) {
      estimatedOpenDate = addDays(estimatedOpenDate, LADEN_DISCHARGE_ALLOWANCE_DAYS);
      projectionBasis = "LADEN_TRANSIT_PLUS_DISCHARGE";
    }
  } else if (currentDraft !== null && ballast.ratio !== null) {
    // Cargado y navegando: se prioriza la ETA declarada por AIS al puerto de
    // descarga y se le suma el margen de descarga antes de quedar abierto.
    status = "LADEN_PROJECTED";
    const reportedEta = validDate(readAliased(source, REPORTED_ETA_KEYS));
    if (reportedEta && reportedEta.getTime() >= now.getTime()) {
      estimatedOpenDate = addDays(reportedEta, LADEN_DISCHARGE_ALLOWANCE_DAYS);
      projectionBasis = "AIS_ETA_PLUS_DISCHARGE";
    } else if (transit.transitDays !== null) {
      estimatedOpenDate = addDays(addDays(now, transit.transitDays), LADEN_DISCHARGE_ALLOWANCE_DAYS);
      projectionBasis = "LADEN_TRANSIT_PLUS_DISCHARGE";
    }
  }

  const laycanFit = evaluateLaycanFit(estimatedOpenDate, context.laydayStart, context.cancelling);

  const confidence = status === "UNKNOWN" || !estimatedOpenDate
    ? "LOW"
    : status === "IN_PORT_SPOT"
      ? "HIGH"
      : ballast.confidence === "HIGH" && transit.speedSource === "AIS_SOG"
        ? "HIGH"
        : "MEDIUM";

  return {
    status,
    navState,
    navStatusRaw: rawNavStatus,
    destination,
    speedKnots,
    isBallast: ballast.isBallast,
    draftRatio: ballast.ratio,
    draftRatioBasis: ballast.basis,
    draftRatioThreshold: ballast.threshold,
    currentDraftMeters: ballast.currentDraftMeters,
    maxDraftMeters: ballast.maxDraftMeters,
    dwt: dwt !== null && dwt > 0 ? dwt : null,
    distanceToPolNm,
    isNearPol,
    transitDays: transit.transitDays,
    transitSpeedKnots: transit.transitSpeedKnots,
    transitSpeedSource: transit.speedSource,
    estimatedOpenDate: estimatedOpenDate ? estimatedOpenDate.toISOString() : null,
    estimatedOpenDateLabel: formatOpennessDate(estimatedOpenDate),
    projectionBasis,
    ...laycanFit,
    confidence,
    badge: buildBadge(status, estimatedOpenDate, laycanFit.laycanStatus),
  };
}

if (typeof window !== "undefined") {
  window.VesselOpennessEngine = {
    BALLAST_DRAFT_RATIO_THRESHOLD,
    DEFAULT_BALLAST_SPEED_KNOTS,
    SPOT_PROXIMITY_NM,
    classifyVesselOpenness,
    classifyNavigationalStatus,
    evaluateBallastStatus,
    evaluateLaycanFit,
    estimateMaxDraftFromDwt,
    projectTransitToPol,
    formatOpennessDate,
  };
}
