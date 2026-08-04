const COMMERCIAL_TYPE_PATTERN = /general\s*cargo|bulk\s*carrier/i;
const AT_ANCHOR_PATTERN = /at\s*anchor|anchored|fondeado|anclado/i;
const NESTED_KEYS = ['vessel', 'ais', 'MetaData', 'metadata', 'position', 'PositionReport', 'staticData', 'static_data'];

function readNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const numericText = String(value).trim().replace(/[^\d.,-]/g, '');
    const normalizedText = /^-?\d{1,3}(,\d{3})+$/.test(numericText)
      ? numericText.replace(/,/g, '')
      : numericText.replace(',', '.');
    const number = Number(normalizedText);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function readText(...values) {
  const value = values.find(candidate => candidate !== null && candidate !== undefined && String(candidate).trim());
  return value === undefined ? '' : String(value).trim();
}

function getScopes(vessel) {
  const scopes = [];
  const queue = [vessel];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);
    scopes.push(current);
    NESTED_KEYS.forEach(key => {
      if (current[key] && typeof current[key] === 'object') queue.push(current[key]);
    });
  }
  return scopes;
}

function firstValue(scopes, keys) {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope?.[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }
  return null;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function normalizeLongitude(value) {
  return ((value + 540) % 360) - 180;
}

export function calculateDistanceNm(origin, destination) {
  const lat1 = readNumber(origin?.lat, origin?.latitude);
  const lon1 = readNumber(origin?.lon, origin?.lng, origin?.longitude);
  const lat2 = readNumber(destination?.lat, destination?.latitude);
  const lon2 = readNumber(destination?.lon, destination?.lng, destination?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lon2 - lon1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(origin, destination) {
  const lat1 = readNumber(origin?.lat, origin?.latitude);
  const lon1 = readNumber(origin?.lon, origin?.lng, origin?.longitude);
  const lat2 = readNumber(destination?.lat, destination?.latitude);
  const lon2 = readNumber(destination?.lon, destination?.lng, destination?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const startLatitude = toRadians(lat1);
  const endLatitude = toRadians(lat2);
  const longitudeDelta = toRadians(lon2 - lon1);
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const x = Math.cos(startLatitude) * Math.sin(endLatitude)
    - Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angularDifference(first, second) {
  return Math.abs(normalizeLongitude(first - second));
}

function destinationMatchesPol(destination, polName) {
  const normalizedDestination = readText(destination).toLowerCase();
  const normalizedPol = readText(polName).toLowerCase();
  if (!normalizedDestination || !normalizedPol) return false;
  const meaningfulTokens = normalizedPol.split(/[^a-z0-9]+/).filter(token => token.length >= 4);
  return normalizedDestination.includes(normalizedPol)
    || meaningfulTokens.some(token => normalizedDestination.includes(token));
}

function hasCoherentEta(value, now = Date.now()) {
  const etaText = readText(value);
  if (!etaText) return false;
  const etaTimestamp = Date.parse(etaText);
  if (!Number.isFinite(etaTimestamp)) return true;
  return etaTimestamp >= now - (6 * 60 * 60 * 1000)
    && etaTimestamp <= now + (45 * 24 * 60 * 60 * 1000);
}

function normalizeCandidate(vessel, targetCargoDwt, polCoordinates, polName) {
  if (!vessel || typeof vessel !== 'object') return null;
  const scopes = getScopes(vessel);
  const vesselType = readText(firstValue(scopes, ['vesselType', 'vessel_type', 'shipType', 'ship_type', 'ShipType', 'type', 'category']));
  if (!COMMERCIAL_TYPE_PATTERN.test(vesselType)) return null;
  const dwt = readNumber(firstValue(scopes, ['dwt', 'DWT', 'deadweight', 'deadweightTonnage', 'deadweight_tonnage']));
  const lat = readNumber(firstValue(scopes, ['lat', 'latitude', 'Latitude', 'AIS_Live_Lat', 'LAT']));
  const lon = readNumber(firstValue(scopes, ['lon', 'lng', 'longitude', 'Longitude', 'AIS_Live_Lon', 'LON']));
  if (!Number.isFinite(dwt) || dwt <= 0 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const navigationStatus = readText(firstValue(scopes, ['navigationalStatus', 'navigationStatus', 'navStatus', 'NavStatus', 'status', 'Status']));
  const destination = readText(firstValue(scopes, ['destination', 'Destination', 'currentDestination', 'CURRENT_DESTINATION']));
  const eta = readText(firstValue(scopes, ['eta', 'ETA', 'estimatedTimeOfArrival', 'EstimatedTimeOfArrival']));
  const course = readNumber(firstValue(scopes, ['courseOverGround', 'CourseOverGround', 'cog', 'COG', 'course', 'Course', 'heading', 'Heading']));
  const computedDistance = calculateDistanceNm({ lat, lon }, polCoordinates);
  const distanceToPolNm = readNumber(
    firstValue(scopes, ['distanceToPolNm', 'distance_to_pol_nm', 'distance_nm', 'currentDistanceToLoadPort']),
    computedDistance,
  );
  const bearingToPol = calculateBearing({ lat, lon }, polCoordinates);
  const headingAligned = Number.isFinite(course) && Number.isFinite(bearingToPol)
    ? angularDifference(course, bearingToPol) <= 45
    : false;
  const atAnchor = AT_ANCHOR_PATTERN.test(navigationStatus);
  const destinationAligned = destinationMatchesPol(destination, polName);
  const etaCoherent = hasCoherentEta(eta);
  const underwayToPol = destinationAligned || (headingAligned && (etaCoherent || !eta));
  const imo = readText(firstValue(scopes, ['imo', 'IMO', 'imoNumber', 'imo_number'])).replace(/\D/g, '');
  const mmsi = readText(firstValue(scopes, ['mmsi', 'MMSI'])).replace(/\D/g, '');
  const vesselName = readText(firstValue(scopes, ['vesselName', 'vessel_name', 'ShipName', 'name'])).toLowerCase();
  const identity = (imo.length === 7 ? imo : '') || (mmsi.length === 9 ? mmsi : '') || vesselName;
  return {
    ...vessel,
    lat,
    lon,
    lng: lon,
    latitude: lat,
    longitude: lon,
    dwt,
    vesselType,
    navigationStatus,
    destination,
    eta,
    distanceToPolNm: Number.isFinite(distanceToPolNm) ? distanceToPolNm : null,
    commercialMatch: {
      targetCargoDwt,
      deltaDwt: Math.abs(dwt - targetCargoDwt),
      distanceToPolNm: Number.isFinite(distanceToPolNm) ? distanceToPolNm : null,
      atAnchor,
      underwayToPol,
      statusPreferred: atAnchor || underwayToPol,
    },
    commercialIdentity: identity,
  };
}

export function useCommercialFilter(vessels, options = {}) {
  const targetCargoDwt = readNumber(options.targetCargoDwt, options.cargoQuantity, options.targetDwt) || 0;
  const capacityTolerance = Math.max(1, readNumber(options.capacityTolerance) || 1.05);
  const topLimit = Math.max(1, Math.trunc(readNumber(options.limit) || 5));
  const polCoordinates = options.polCoordinates || null;
  const polName = readText(options.polName);
  const sourceVessels = Array.isArray(vessels) ? vessels : [];
  if (targetCargoDwt <= 0) {
    return {
      filteredVessels: [],
      topMatches: [],
      targetCargoDwt: 0,
      minimumViableDwt: 0,
      sourceCount: sourceVessels.length,
      commercialCount: 0,
      viableCount: 0,
      preferredCount: 0,
      requiresCargo: true,
    };
  }

  const minimumViableDwt = targetCargoDwt * capacityTolerance;
  const uniqueCandidates = new Map();
  sourceVessels.forEach(vessel => {
    const candidate = normalizeCandidate(vessel, targetCargoDwt, polCoordinates, polName);
    if (!candidate || candidate.dwt < minimumViableDwt) return;
    const key = candidate.commercialIdentity || `${candidate.latitude}:${candidate.longitude}:${candidate.dwt}`;
    const current = uniqueCandidates.get(key);
    if (!current || candidate.commercialMatch.deltaDwt < current.commercialMatch.deltaDwt) {
      uniqueCandidates.set(key, candidate);
    }
  });

  const viableCandidates = Array.from(uniqueCandidates.values());
  const preferredCandidates = viableCandidates.filter(candidate => candidate.commercialMatch.statusPreferred);
  const rankingPool = preferredCandidates.length > 0 ? preferredCandidates : viableCandidates;
  rankingPool.sort((first, second) => {
    const deltaDifference = first.commercialMatch.deltaDwt - second.commercialMatch.deltaDwt;
    if (Math.abs(deltaDifference) > 0.001) return deltaDifference;
    const firstDistance = Number.isFinite(first.commercialMatch.distanceToPolNm) ? first.commercialMatch.distanceToPolNm : Number.POSITIVE_INFINITY;
    const secondDistance = Number.isFinite(second.commercialMatch.distanceToPolNm) ? second.commercialMatch.distanceToPolNm : Number.POSITIVE_INFINITY;
    return firstDistance - secondDistance;
  });

  return {
    filteredVessels: rankingPool,
    topMatches: rankingPool.slice(0, topLimit),
    targetCargoDwt,
    minimumViableDwt,
    sourceCount: sourceVessels.length,
    commercialCount: viableCandidates.length,
    viableCount: rankingPool.length,
    preferredCount: preferredCandidates.length,
    requiresCargo: false,
  };
}
