const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(String(value).replace(',', '.').replace(/[^0-9.+-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstValue(records, keys) {
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const key of keys) {
      const value = record[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') return value;
    }
  }
  return null;
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function parseAisEta(value, referenceDate = new Date()) {
  if (!value) return null;
  if (value instanceof Date || typeof value === 'number') return validDate(value);

  const text = String(value).trim();
  const directDate = validDate(text);
  if (directDate) return directDate;

  const compact = text.replace(/[^0-9]/g, '');
  const parts = text.match(/^(\d{1,2})[-/.](\d{1,2})(?:\s+|T)(\d{1,2})(?::?(\d{2}))?$/);
  const month = parts ? Number(parts[1]) : compact.length === 8 ? Number(compact.slice(0, 2)) : null;
  const day = parts ? Number(parts[2]) : compact.length === 8 ? Number(compact.slice(2, 4)) : null;
  const hour = parts ? Number(parts[3]) : compact.length === 8 ? Number(compact.slice(4, 6)) : 0;
  const minute = parts ? Number(parts[4] || 0) : compact.length === 8 ? Number(compact.slice(6, 8)) : 0;
  if (![month, day, hour, minute].every(Number.isFinite)) return null;

  const reference = validDate(referenceDate) || new Date();
  let inferred = new Date(Date.UTC(reference.getUTCFullYear(), month - 1, day, hour, minute));
  if (inferred.getTime() < reference.getTime() - 180 * DAY_MS) {
    inferred = new Date(Date.UTC(reference.getUTCFullYear() + 1, month - 1, day, hour, minute));
  }
  return Number.isFinite(inferred.getTime()) ? inferred : null;
}

export function classifyDraught(currentDraught, maxDraught, ballastThreshold = 0.6) {
  const current = finiteNumber(currentDraught);
  const maximum = finiteNumber(maxDraught);
  if (!(current > 0) || !(maximum > 0) || current > maximum * 1.35) {
    return { status: 'UNKNOWN', ratio: null, currentDraught: current, maxDraught: maximum };
  }

  const ratio = current / maximum;
  return {
    status: ratio < ballastThreshold ? 'IN_BALLAST' : 'LADEN',
    ratio,
    currentDraught: current,
    maxDraught: maximum,
  };
}

function normalizeLaycanDate(value, endOfDay = false) {
  if (!value) return null;
  const text = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = validDate(dateOnly ? `${text}T00:00:00Z` : text);
  if (!date) return null;
  if (endOfDay && dateOnly) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function predictOpenTonnage(match, options = {}) {
  const source = match && typeof match === 'object' ? match : {};
  const vessel = source.vessel && typeof source.vessel === 'object' ? source.vessel : {};
  const ais = source.ais && typeof source.ais === 'object' ? source.ais : {};
  const routing = source.routing && typeof source.routing === 'object' ? source.routing : {};
  const records = [ais, vessel, routing, source];
  const now = validDate(options.now) || new Date();
  const operationsDays = finiteNumber(options.operationsDays) ?? 3;
  const ballastThreshold = finiteNumber(options.ballastThreshold) ?? 0.6;

  const currentDraught = firstValue(records, ['currentDraught', 'currentDraft', 'draught', 'draft', 'Draft', 'draft_meters']);
  const maxDraught = firstValue(records, ['verifiedDesignDraft', 'verified_design_draft', 'maxDraught', 'maxDraft', 'designDraft', 'design_draft', 'MaximumStaticDraught']);
  const draught = classifyDraught(currentDraught, maxDraught, ballastThreshold);

  const destinationEtaValue = firstValue([ais, vessel, source], ['destinationEta', 'destinationETA', 'etaDestination', 'eta_destination', 'aisEta', 'ais_eta', 'eta', 'ETA']);
  const distanceToDestinationNm = finiteNumber(firstValue(records, ['distanceToDestinationNm', 'distance_to_destination_nm', 'destinationDistanceNm']));
  const currentSpeedKnots = finiteNumber(firstValue(records, ['speed', 'sog', 'SOG', 'speedOverGround', 'speed_over_ground']));
  let destinationEta = parseAisEta(destinationEtaValue, now);
  let destinationEtaSource = destinationEta ? 'AIS_REPORTED' : null;
  if (!destinationEta && distanceToDestinationNm !== null && currentSpeedKnots > 0) {
    destinationEta = addDays(now, distanceToDestinationNm / currentSpeedKnots / 24);
    destinationEtaSource = 'DISTANCE_SPEED_ESTIMATE';
  }

  let freeAt = null;
  if (draught.status === 'IN_BALLAST') freeAt = now;
  if (draught.status === 'LADEN' && destinationEta) freeAt = addDays(destinationEta, operationsDays);

  const rawCurrentDistanceToPolNm = finiteNumber(firstValue(records, ['currentDistanceToLoadPort', 'distanceToPolNm', 'distanceToPol', 'distance_to_pol_nm', 'distance_nm', 'ballastDistanceNM']));
  const rawDestinationToPolNm = finiteNumber(firstValue(records, ['destinationToPolDistanceNm', 'destination_to_pol_nm', 'distanceFromDestinationToPolNm']));
  const currentDistanceToPolNm = rawCurrentDistanceToPolNm !== null && rawCurrentDistanceToPolNm > 0 ? rawCurrentDistanceToPolNm : null;
  const destinationToPolNm = rawDestinationToPolNm !== null && rawDestinationToPolNm > 0 ? rawDestinationToPolNm : null;
  const distanceToPolNm = draught.status === 'LADEN'
    ? (destinationToPolNm ?? currentDistanceToPolNm)
    : currentDistanceToPolNm;
  const ballastSpeedKnots = finiteNumber(firstValue(records, ['spdBallast', 'spd_ballast', 'ballastSpeedKnots', 'ballast_speed_knots']), options.defaultBallastSpeedKnots) ?? 12;
  const transitDaysToPol = distanceToPolNm !== null && ballastSpeedKnots > 0
    ? distanceToPolNm / ballastSpeedKnots / 24
    : null;
  const arrivalAtPol = freeAt && transitDaysToPol !== null ? addDays(freeAt, transitDaysToPol) : null;

  const laycanStart = normalizeLaycanDate(options.laycanStart);
  const laycanEnd = normalizeLaycanDate(options.laycanEnd, true);
  let laycanStatus = 'UNKNOWN';
  let viable = false;
  if (arrivalAtPol && laycanEnd) {
    if (arrivalAtPol.getTime() > laycanEnd.getTime()) laycanStatus = 'LATE';
    else if (laycanStart && arrivalAtPol.getTime() < laycanStart.getTime()) {
      laycanStatus = 'EARLY';
      viable = true;
    } else {
      laycanStatus = 'WITHIN';
      viable = true;
    }
  }

  const confidence = draught.status === 'UNKNOWN' || !arrivalAtPol
    ? 'LOW'
    : draught.status === 'LADEN' && (!destinationEta || destinationToPolNm === null)
      ? 'MEDIUM'
      : 'HIGH';

  return {
    commercialStatus: draught.status,
    draughtRatio: draught.ratio,
    currentDraught: draught.currentDraught,
    maxDraught: draught.maxDraught,
    destinationEta: destinationEta?.toISOString() ?? null,
    destinationEtaSource,
    freeAt: freeAt?.toISOString() ?? null,
    operationsDays,
    distanceToPolNm,
    ballastSpeedKnots,
    transitDaysToPol,
    arrivalAtPol: arrivalAtPol?.toISOString() ?? null,
    laycanStatus,
    viable,
    confidence,
  };
}
