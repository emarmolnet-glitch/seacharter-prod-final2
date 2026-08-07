import { normalizePortDestination } from "./commercial-vessel-search.mjs";

const DEFAULT_SERVICE_SPEED_KNOTS = 11.5;
const MIN_SERVICE_SPEED_KNOTS = 6;
const MAX_SERVICE_SPEED_KNOTS = 22;
const SEA_ROUTE_FACTOR = 1.12;

export const LONG_DISTANCE_TRANSIT_LABEL = "Inbound to POL";

export function normalizePortIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(port|puerto|terminal|anchorage|roads?|harbour|harbor)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function destinationMatchesPol(destination, polName, compatiblePorts = []) {
  const normalizedDestination = normalizePortIdentity(destination);
  if (!normalizedDestination || ["n a", "not available", "unknown", "for orders"].includes(normalizedDestination)) return false;
  return normalizePortDestination(destination, { name: polName, aliases: compatiblePorts });
}

export function parseMaritimeDate(value, referenceDate = new Date()) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const compact = raw.match(/^(\d{2})[-/]?(\d{2})\s*(\d{2})?:?(\d{2})?$/);
  if (compact) {
    const month = Number(compact[1]) - 1;
    const day = Number(compact[2]);
    const hour = Number(compact[3] || 0);
    const minute = Number(compact[4] || 0);
    const currentYear = referenceDate.getUTCFullYear();
    let parsed = new Date(Date.UTC(currentYear, month, day, hour, minute));
    if (parsed.getTime() < referenceDate.getTime() - 180 * 86400000) {
      parsed = new Date(Date.UTC(currentYear + 1, month, day, hour, minute));
    }
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const directTimestamp = Date.parse(raw);
  return Number.isFinite(directTimestamp) ? new Date(directTimestamp) : null;
}

function cancellingDeadline(value, referenceDate) {
  const parsed = parseMaritimeDate(value, referenceDate);
  if (!parsed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim())) parsed.setUTCHours(23, 59, 59, 999);
  return parsed;
}

export function evaluateCommercialTransitToPol({
  destination,
  polName,
  compatiblePorts = [],
  aisEta,
  laycanStart,
  laycanEnd,
  distanceNm,
  speedKnots,
  serviceSpeedKnots,
  now = new Date(),
  visualRadiusNm = 1000,
}) {
  const destinationConfirmed = destinationMatchesPol(destination, polName, compatiblePorts);
  const start = parseMaritimeDate(laycanStart, now);
  const end = cancellingDeadline(laycanEnd || laycanStart, now);
  const explicitEta = parseMaritimeDate(aisEta, now);
  const remainingDistanceNm = Number(distanceNm);
  const reportedSpeed = Number(speedKnots);
  const configuredServiceSpeed = Number(serviceSpeedKnots);
  const effectiveSpeedKnots = Math.min(MAX_SERVICE_SPEED_KNOTS, Math.max(
    MIN_SERVICE_SPEED_KNOTS,
    Number.isFinite(reportedSpeed) && reportedSpeed >= MIN_SERVICE_SPEED_KNOTS
      ? reportedSpeed
      : (Number.isFinite(configuredServiceSpeed) ? configuredServiceSpeed : DEFAULT_SERVICE_SPEED_KNOTS),
  ));
  const transitHours = Number.isFinite(remainingDistanceNm) && remainingDistanceNm >= 0
    ? (remainingDistanceNm * SEA_ROUTE_FACTOR) / effectiveSpeedKnots
    : null;
  const projectedEta = transitHours === null ? null : new Date(now.getTime() + transitHours * 3600000);
  const earliestUsefulArrival = now.getTime() - 12 * 3600000;
  const windowEnd = end?.getTime() ?? null;
  const declaredEtaFeasible = Boolean(explicitEta && windowEnd !== null
    && explicitEta.getTime() >= earliestUsefulArrival && explicitEta.getTime() <= windowEnd);
  const transitFeasible = Boolean(projectedEta && windowEnd !== null
    && projectedEta.getTime() >= earliestUsefulArrival && projectedEta.getTime() <= windowEnd);
  const effectiveEta = declaredEtaFeasible ? explicitEta : (transitFeasible ? projectedEta : (explicitEta || projectedEta));
  const etaWithinLaycan = declaredEtaFeasible || transitFeasible;
  const longDistance = Number.isFinite(remainingDistanceNm) && remainingDistanceNm > visualRadiusNm;
  const candidate = destinationConfirmed && etaWithinLaycan;

  return {
    candidate,
    destinationConfirmed,
    declaredEtaFeasible,
    etaWithinLaycan,
    transitFeasible,
    longDistance,
    label: candidate && longDistance ? LONG_DISTANCE_TRANSIT_LABEL : null,
    effectiveSpeedKnots,
    transitHours,
    projectedEta: projectedEta ? projectedEta.toISOString() : null,
    effectiveEta: effectiveEta ? effectiveEta.toISOString() : null,
    laycanStart: start ? start.toISOString() : null,
    laycanEnd: end ? end.toISOString() : null,
  };
}
