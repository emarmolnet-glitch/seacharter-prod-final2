const COMMON_PORT_ALIAS_GROUPS = [
  ["DZBJA", "BJA", "BJA ANCH", "BEJAIA", "BEJAIA ANCH", "BEJAIA ANCHORAGE", "BÉJAÏA", "BOUGIE"],
];

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizePortText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function compactPortText(value) {
  return normalizePortText(value).replace(/\s+/g, "");
}

export function buildPortDestinationAliases(polData = {}) {
  const directAliases = [
    polData.unLocode,
    polData.unlocode,
    polData.locode,
    polData.code,
    polData.officialName,
    polData.name,
    polData.portName,
    ...(Array.isArray(polData.aliases) ? polData.aliases : []),
  ].map(normalizePortText).filter(Boolean);

  const aliasSet = new Set(directAliases);
  for (const group of COMMON_PORT_ALIAS_GROUPS) {
    const normalizedGroup = group.map(normalizePortText);
    if (normalizedGroup.some((alias) => directAliases.some((candidate) => (
      candidate === alias
      || compactPortText(candidate) === compactPortText(alias)
      || candidate.includes(alias)
      || alias.includes(candidate)
    )))) {
      normalizedGroup.forEach((alias) => aliasSet.add(alias));
    }
  }

  return [...aliasSet];
}

export function normalizePortDestination(aisDestination, polData) {
  const destination = normalizePortText(aisDestination);
  if (!destination) return false;
  const compactDestination = compactPortText(destination);
  return buildPortDestinationAliases(polData).some((alias) => {
    const compactAlias = compactPortText(alias);
    if (!compactAlias) return false;
    if (compactAlias.length <= 3) {
      return destination.split(" ").includes(alias) || compactDestination === compactAlias;
    }
    return destination === alias
      || destination.includes(alias)
      || compactDestination.includes(compactAlias);
  });
}

export function estimateBallastStatus(currentDraft, designDraft, threshold = 0.8) {
  const current = finiteNumber(currentDraft);
  const design = finiteNumber(designDraft);
  return current !== null
    && current > 0
    && design !== null
    && design > 0
    && current <= design * threshold;
}

export function estimateArrivalDate({ eta, distanceNm, speedKnots, now = new Date() }) {
  if (eta) {
    const declaredEta = new Date(eta);
    if (Number.isFinite(declaredEta.getTime())) return declaredEta;
  }
  const distance = finiteNumber(distanceNm);
  const speed = finiteNumber(speedKnots);
  if (distance === null || distance < 0 || speed === null || speed <= 1) return null;
  return new Date(now.getTime() + (distance / speed) * 60 * 60 * 1000);
}

function cancellingDeadline(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function isLaycanCompliant(eta, laycanStart, laycanEnd) {
  const etaDate = eta instanceof Date ? eta : eta ? new Date(eta) : null;
  const start = laycanStart ? new Date(laycanStart) : null;
  const end = laycanEnd ? new Date(laycanEnd) : null;
  if (!etaDate || !Number.isFinite(etaDate.getTime())) return false;
  if (!start || !Number.isFinite(start.getTime()) || !end || !Number.isFinite(end.getTime())) return false;
  return etaDate >= start && etaDate <= end;
}

export function isInboundEtaCoherent({ eta, distanceNm, speedKnots, laycanEnd, now = new Date() }) {
  const earliestUsefulArrival = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const latestUsefulArrival = cancellingDeadline(laycanEnd);
  if (!latestUsefulArrival) return false;
  const declaredArrival = eta ? new Date(eta) : null;
  const declaredFeasible = Boolean(
    declaredArrival
    && Number.isFinite(declaredArrival.getTime())
    && declaredArrival >= earliestUsefulArrival
    && declaredArrival <= latestUsefulArrival,
  );
  const projectedArrival = estimateArrivalDate({ distanceNm, speedKnots, now });
  const projectedFeasible = Boolean(
    projectedArrival
    && projectedArrival >= earliestUsefulArrival
    && projectedArrival <= latestUsefulArrival,
  );
  return declaredFeasible || projectedFeasible;
}

export function classifyCandidateMatch({
  distanceNm,
  radiusNm,
  destination,
  polData,
  eta,
  speedKnots,
  laycanEnd,
  now,
}) {
  const distance = finiteNumber(distanceNm);
  const radius = finiteNumber(radiusNm);
  if (distance !== null && radius !== null && distance <= radius) return "NEAR_POL";
  if (distance === null || !normalizePortDestination(destination, polData)) return null;
  return isInboundEtaCoherent({ eta, distanceNm: distance, speedKnots, laycanEnd, now })
    ? "INBOUND_TO_POL"
    : null;
}

export function sortCandidates(candidates) {
  return [...candidates].sort((left, right) => (
    (finiteNumber(left.dwtDifference) ?? Number.POSITIVE_INFINITY)
      - (finiteNumber(right.dwtDifference) ?? Number.POSITIVE_INFINITY)
    || Number(right.estimatedBallastStatus === true) - Number(left.estimatedBallastStatus === true)
    || Number(right.laycanCompliant === true) - Number(left.laycanCompliant === true)
    || (finiteNumber(left.distanceNm) ?? Number.POSITIVE_INFINITY)
      - (finiteNumber(right.distanceNm) ?? Number.POSITIVE_INFINITY)
  ));
}
