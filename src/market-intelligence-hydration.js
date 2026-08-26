const MARKET_DATA_ENDPOINT = '/api/get-market-data';
const MARKET_INTELLIGENCE_EVENT = 'seacharter:market-intelligence-hydrated';
const CACHE_KEY = 'seacharter_market_intelligence_snapshot_v1';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const MARKET_VESSEL_CLASSES = Object.freeze([
  Object.freeze({ key: 'capesize', label: 'Capesize' }),
  Object.freeze({ key: 'panamax', label: 'Panamax' }),
  Object.freeze({ key: 'supramax', label: 'Supramax' }),
  Object.freeze({ key: 'handysize', label: 'Handysize' }),
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asNumber(value, { positive = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%]/g, '').trim());
  if (!Number.isFinite(parsed)) return null;
  return positive && parsed <= 0 ? null : parsed;
}

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function firstDefined(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function readPath(source, path) {
  return path.split('.').reduce((current, key) => current?.[key], source);
}

function firstPath(source, paths) {
  return firstDefined(...paths.map(path => readPath(source, path)));
}

function unwrapPayload(payload) {
  let current = payload;
  for (let depth = 0; depth < 4; depth += 1) {
    const object = asObject(current);
    if (!object) break;
    const nested = asObject(object.data) || asObject(object.market_data) || asObject(object.marketData) || asObject(object.snapshot);
    if (!nested) break;
    current = nested;
  }
  return asObject(current) || {};
}

function findClassRecord(record, key, label) {
  const containers = [
    record.tce_spot_by_class,
    record.tceSpotByClass,
    record.tce_spot,
    record.tceSpot,
    record.theoretical_spot_tce,
    record.theoreticalSpotTce,
    record.market_intelligence,
    record.marketIntelligence,
    record.freight_market,
    record.freightMarket,
  ];

  for (const containerValue of containers) {
    if (Array.isArray(containerValue)) {
      const match = containerValue.find(entry => {
        const vesselClass = asText(entry?.vessel_class ?? entry?.vesselClass ?? entry?.class ?? entry?.name).toLowerCase();
        return vesselClass === key || vesselClass === label.toLowerCase();
      });
      if (match) return asObject(match);
      continue;
    }

    const container = asObject(containerValue);
    if (!container) continue;
    const match = asObject(container[key])
      || asObject(container[label])
      || asObject(container[label.toLowerCase()])
      || asObject(container[key.toUpperCase()]);
    if (match) return match;
  }

  return null;
}

function normalizeTceSpotClass(record, definition) {
  const { key, label } = definition;
  const classRecord = findClassRecord(record, key, label) || {};
  const baseTc = asNumber(firstDefined(
    classRecord.base_tc,
    classRecord.baseTc,
    classRecord.tc,
    classRecord.time_charter,
    record[`${key}_tc`],
  ), { positive: true });
  const baseTcChangePct = asNumber(firstDefined(
    classRecord.base_tc_change_pct,
    classRecord.baseTcChangePct,
    classRecord.change_pct,
    classRecord.changePct,
    classRecord.variation_pct,
    record[`${key}_change_pct`],
  ));
  const theoreticalSpotTce = asNumber(firstDefined(
    classRecord.theoretical_spot_tce,
    classRecord.theoreticalSpotTce,
    classRecord.tce_spot_theoretical,
    classRecord.tceSpotTheoretical,
    classRecord.tce_spot_teorico,
    classRecord.tceSpotTeorico,
    classRecord.tce_spot,
    classRecord.tceSpot,
    classRecord.spot_tce,
    classRecord.spotTce,
    classRecord.value,
    record[`${key}_theoretical_spot_tce`],
    record[`${key}_tce_spot_theoretical`],
    record[`${key}_tce_spot_teorico`],
    record[`${key}_tce_spot`],
    record[`${key}_spot_tce`],
    record[`theoretical_spot_tce_${key}`],
    record[`tce_spot_theoretical_${key}`],
    record[`tce_spot_teorico_${key}`],
    record[`tce_spot_${key}`],
    record[`spot_tce_${key}`],
  ), { positive: true });
  const spreadUsd = asNumber(firstDefined(
    classRecord.spread_usd,
    classRecord.spreadUsd,
    classRecord.gap_usd,
    classRecord.gapUsd,
    classRecord.brecha_usd,
    record[`${key}_spread_usd`],
    record[`${key}_gap_usd`],
    record[`${key}_brecha_usd`],
    record[`spread_usd_${key}`],
    record[`gap_usd_${key}`],
    record[`brecha_usd_${key}`],
  ));
  const spreadPct = asNumber(firstDefined(
    classRecord.spread_pct,
    classRecord.spreadPct,
    classRecord.spread_percent,
    classRecord.gap_pct,
    classRecord.gapPct,
    classRecord.brecha_pct,
    record[`${key}_spread_pct`],
    record[`${key}_spread_percent`],
    record[`${key}_gap_pct`],
    record[`${key}_brecha_pct`],
    record[`spread_pct_${key}`],
    record[`spread_percent_${key}`],
    record[`gap_pct_${key}`],
    record[`brecha_pct_${key}`],
  ));
  const algorithmLabel = asText(firstDefined(
    classRecord.algorithm_label,
    classRecord.algorithmLabel,
    classRecord.engine_label,
    classRecord.engineLabel,
    record[`${key}_algorithm_label`],
    record.algorithm_label,
  ));
  const fuelLabel = asText(firstDefined(
    classRecord.fuel_label,
    classRecord.fuelLabel,
    classRecord.fuel,
    classRecord.bunker_mode,
    record[`${key}_fuel_label`],
    record.fuel_label,
  ));
  const updatedAt = asText(firstDefined(
    classRecord.updated_at,
    classRecord.updatedAt,
    classRecord.tce_spot_updated_at,
    classRecord.tceSpotUpdatedAt,
    record[`${key}_tce_spot_updated_at`],
    record.tce_spot_updated_at,
    record.tc_updated_at,
    record.updated_at,
    record.created_at,
  ));
  const source = asText(firstDefined(classRecord.source, record.source));
  const formulaVersion = asText(firstDefined(
    classRecord.formula_version,
    classRecord.formulaVersion,
    record.formula_version,
  ));
  const status = asText(firstDefined(
    classRecord.status,
    classRecord.algorithm_status,
    record[`${key}_status`],
    theoreticalSpotTce !== null ? 'LIVE' : 'UNAVAILABLE',
  )).toUpperCase();

  return Object.freeze({
    vesselClass: label,
    baseTc,
    baseTcChangePct,
    theoreticalSpotTce,
    spreadUsd,
    spreadPct,
    algorithmLabel,
    fuelLabel,
    status,
    updatedAt,
    source,
    formulaVersion,
  });
}

function normalizeBdi(record) {
  const nested = asObject(record.bdi) || asObject(record.baltic_dry_index) || asObject(record.balticDryIndex) || {};
  const value = asNumber(firstDefined(
    nested.value,
    nested.index,
    nested.bdi_index,
    record.bdi_index,
    record.bdiIndex,
  ), { positive: true });
  const changeValue = asNumber(firstDefined(
    nested.change_value,
    nested.changeValue,
    nested.daily_change_value,
    nested.change,
    record.bdi_change_value,
    record.bdi_daily_change_value,
  ));
  const changePct = asNumber(firstDefined(
    nested.change_pct,
    nested.changePct,
    nested.daily_change_pct,
    nested.variation_pct,
    record.bdi_change_pct,
    record.bdi_daily_change_pct,
  ));
  const updatedAt = asText(firstDefined(
    nested.updated_at,
    nested.updatedAt,
    nested.record_date,
    record.bdi_updated_at,
    record.bdiUpdatedAt,
    record.record_date,
    record.updated_at,
    record.created_at,
    record.date,
  ));
  const status = asText(firstDefined(nested.status, record.bdi_status, value !== null ? 'LIVE' : 'UNAVAILABLE')).toUpperCase();
  const source = asText(firstDefined(nested.source, record.bdi_source, record.source));
  return Object.freeze({ value, changeValue, changePct, updatedAt, status, source });
}

function normalizeBunkers(record) {
  const nested = asObject(record.bunkers) || asObject(record.bunker) || asObject(record.fuels) || {};
  const vlsfo = asNumber(firstDefined(nested.vlsfo, nested.VLSFO, record.vlsfo, record.bunker_price_vlsfo), { positive: true });
  const hsfo = asNumber(firstDefined(nested.hsfo, nested.HSFO, nested.ifo380, record.hsfo, record.ifo380, record.bunker_price_hsfo), { positive: true });
  const mgo = asNumber(firstDefined(nested.mgo, nested.MGO, record.mgo, record.bunker_price_mgo), { positive: true });
  const updatedAt = asText(firstDefined(
    nested.updated_at,
    nested.updatedAt,
    nested.record_date,
    record.vlsfo_updated_at,
    record.bunker_updated_at,
    record.updated_at,
    record.created_at,
    record.date,
  ));
  const source = asText(firstDefined(nested.source, record.bunker_source, record.source));
  const region = asText(firstDefined(nested.region, nested.market, record.bunker_region, record.region));
  const status = asText(firstDefined(nested.status, record.bunker_status, vlsfo !== null ? 'LIVE' : 'UNAVAILABLE')).toUpperCase();
  return Object.freeze({ vlsfo, hsfo, mgo, updatedAt, source, region, status });
}

export function normalizeMarketIntelligencePayload(payload, receivedAt = new Date().toISOString()) {
  const record = unwrapPayload(payload);
  const tceSpotByClass = Object.freeze(Object.fromEntries(
    MARKET_VESSEL_CLASSES.map(definition => [definition.label, normalizeTceSpotClass(record, definition)]),
  ));
  const bdi = normalizeBdi(record);
  const bunkers = normalizeBunkers(record);
  const sourceId = asText(firstPath(record, ['snapshot_id', 'snapshotId', 'id', 'version']));
  const snapshotId = sourceId || [bdi.updatedAt, bunkers.updatedAt, receivedAt].filter(Boolean).join('|');
  const hasTceSpot = Object.values(tceSpotByClass).some(entry => entry.theoreticalSpotTce !== null);
  const hasMarketData = hasTceSpot || bdi.value !== null || bunkers.vlsfo !== null;

  return Object.freeze({
    snapshotId,
    receivedAt,
    tceSpotByClass,
    bdi,
    bunkers,
    source: asText(record.source),
    contractVersion: asText(firstDefined(record.contract_version, record.contractVersion)),
    status: hasMarketData ? 'ready' : 'partial',
  });
}

function freezeState(state) {
  return Object.freeze({ ...state });
}

export function createMarketIntelligenceHydration({
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  eventTarget = globalThis.window,
  endpoint = MARKET_DATA_ENDPOINT,
} = {}) {
  let state = freezeState({ status: 'idle', snapshot: null, error: null });
  let activeRequest = null;
  const subscribers = new Set();

  const publish = nextState => {
    state = freezeState(nextState);
    subscribers.forEach(subscriber => subscriber(state));
    eventTarget?.dispatchEvent?.(new CustomEvent(MARKET_INTELLIGENCE_EVENT, { detail: state }));
    return state;
  };

  const readCache = () => {
    if (!storage?.getItem) return null;
    try {
      const cached = JSON.parse(storage.getItem(CACHE_KEY) || 'null');
      return cached?.snapshot ? cached.snapshot : null;
    } catch {
      return null;
    }
  };

  const writeCache = snapshot => {
    if (!storage?.setItem) return;
    try {
      storage.setItem(CACHE_KEY, JSON.stringify({ snapshot }));
    } catch {
      return;
    }
  };

  const hydrateFromCache = () => {
    const cachedSnapshot = readCache();
    if (!cachedSnapshot) return null;
    const snapshot = Object.freeze({ ...cachedSnapshot, status: 'stale' });
    publish({ status: 'stale', snapshot, error: null });
    return snapshot;
  };

  const refresh = ({ force = false } = {}) => {
    if (activeRequest) return activeRequest;
    publish({ status: 'loading', snapshot: state.snapshot, error: null });
    activeRequest = Promise.resolve(fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }))
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `Market Intelligence HTTP ${response.status}`);
        const snapshot = normalizeMarketIntelligencePayload(payload);
        writeCache(snapshot);
        publish({ status: snapshot.status, snapshot, error: null });
        return snapshot;
      })
      .catch(error => {
        const fallbackStatus = state.snapshot ? 'stale' : 'error';
        publish({ status: fallbackStatus, snapshot: state.snapshot, error });
        throw error;
      })
      .finally(() => {
        activeRequest = null;
      });
    return activeRequest;
  };

  const subscribe = subscriber => {
    subscribers.add(subscriber);
    subscriber(state);
    return () => subscribers.delete(subscriber);
  };

  return Object.freeze({
    endpoint,
    eventName: MARKET_INTELLIGENCE_EVENT,
    getState: () => state,
    getSnapshot: () => state.snapshot,
    hydrateFromCache,
    refresh,
    subscribe,
  });
}

function initializeGlobalHydration() {
  const hydration = createMarketIntelligenceHydration();
  window.MarketIntelligenceHydration = hydration;
  hydration.hydrateFromCache();
  hydration.refresh().catch(() => {});
  window.setInterval(() => {
    if (document.visibilityState === 'visible') hydration.refresh().catch(() => {});
  }, REFRESH_INTERVAL_MS);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGlobalHydration, { once: true });
  } else {
    initializeGlobalHydration();
  }
}
