import { useState, useEffect, useCallback } from 'react';

/**
 * Maps a vessel category string to its normalized Baltic Market class.
 * @param {string} vesselCategory
 * @returns {'Capesize' | 'Panamax' | 'Supramax' | 'Handysize'}
 */
export function getMarketSpeedVesselClass(vesselCategory) {
  const normalized = String(vesselCategory || '').toLowerCase();
  if (normalized.includes('cape') || normalized.includes('suez') || normalized.includes('vloc') || normalized.includes('vlcc') || normalized.includes('aframax')) {
    return 'Capesize';
  }
  if (normalized.includes('panamax') || normalized.includes('kamsar') || normalized.includes('lr1')) {
    return 'Panamax';
  }
  if (normalized.includes('supra') || normalized.includes('ultra') || normalized.includes('mr')) {
    return 'Supramax';
  }
  return 'Handysize';
}

/**
 * Extracts pure numeric theoretical spot TCE from a market intelligence snapshot or state payload.
 * @param {any} snapshot
 * @param {string} [vesselCategory]
 * @returns {number | null}
 */
export function extractTheoreticalSpotTce(snapshot, vesselCategory = 'Handysize') {
  if (!snapshot) return null;

  const vesselClass = getMarketSpeedVesselClass(vesselCategory);
  const classKey = vesselClass.toLowerCase();

  // 1. Direct class record in snapshot (from MarketIntelligenceHydration / Data Bridge)
  const classData = snapshot?.tceSpotByClass?.[vesselClass] || snapshot?.tceSpotByClass?.[classKey];
  if (classData && Number.isFinite(Number(classData.theoreticalSpotTce)) && Number(classData.theoreticalSpotTce) > 0) {
    return Number(classData.theoreticalSpotTce);
  }
  if (classData && Number.isFinite(Number(classData.baseTc)) && Number(classData.baseTc) > 0) {
    return Number(classData.baseTc);
  }

  // 2. Predictive V2 metrics container
  const predictiveMetrics = snapshot?.predictive_v2?.metrics || snapshot?.predictiveV2?.metrics;
  const metricRecord = predictiveMetrics?.[classKey] || predictiveMetrics?.[vesselClass];
  const metricVal = Number(metricRecord?.tceSpot ?? metricRecord?.theoreticalSpotTce ?? metricRecord?.spotTce);
  if (Number.isFinite(metricVal) && metricVal > 0) {
    return metricVal;
  }

  // 3. Legacy market fields
  const legacyFieldMap = {
    Capesize: 'capesize_tc',
    Panamax: 'panamax_tc',
    Supramax: 'supramax_tc',
    Handysize: 'handysize_tc',
  };
  const legacyField = legacyFieldMap[vesselClass];
  if (legacyField && Number.isFinite(Number(snapshot[legacyField])) && Number(snapshot[legacyField]) > 0) {
    return Number(snapshot[legacyField]);
  }

  // 4. Fallback from DOM if rendered in MARKET INTELLIGENCE - ESPEJO DATA BRIDGE panel
  if (typeof document !== 'undefined') {
    const renderedEl = document.getElementById('tce-spot-theoretical-value');
    if (renderedEl) {
      const parsed = Number(String(renderedEl.textContent || '').replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Imperative helper to retrieve the latest pure numeric TCE spot value from global state.
 * @param {string} [vesselCategory]
 * @returns {number | null}
 */
export function getTheoreticalSpotTce(vesselCategory = 'Handysize') {
  if (typeof window === 'undefined') return null;

  if (window.MarketIntelligenceHydration?.getSnapshot) {
    const snap = window.MarketIntelligenceHydration.getSnapshot();
    const val = extractTheoreticalSpotTce(snap, vesselCategory);
    if (val !== null) return val;
  }

  if (window.State?.marketSnapshot) {
    const val = extractTheoreticalSpotTce(window.State.marketSnapshot, vesselCategory);
    if (val !== null) return val;
  }

  if (Number.isFinite(Number(window.State?.theoreticalSpotTce)) && Number(window.State.theoreticalSpotTce) > 0) {
    return Number(window.State.theoreticalSpotTce);
  }

  return extractTheoreticalSpotTce(null, vesselCategory);
}

/**
 * React hook to connect directly to Data Bridge Market Intelligence spot data.
 * Supplies the pure numeric variable for "TCE SPOT TEÓRICO" to feed "TCE OBJETIVO".
 *
 * @param {string} [vesselCategory='Handysize']
 * @returns {{
 *   spotTce: number | null,
 *   theoreticalSpotTce: number | null,
 *   tceSpotTeorico: number | null,
 *   tceObjetivo: number | null,
 *   vesselClass: string,
 *   marketSnapshot: any,
 *   status: string,
 *   refreshSpot: () => Promise<number | null>
 * }}
 */
export function useDataBridgeSpotConnection(vesselCategory = 'Handysize') {
  const vesselClass = getMarketSpeedVesselClass(vesselCategory);

  const [spotTce, setSpotTce] = useState(() => {
    return getTheoreticalSpotTce(vesselCategory);
  });
  const [marketSnapshot, setMarketSnapshot] = useState(() => {
    if (typeof window !== 'undefined' && window.MarketIntelligenceHydration?.getSnapshot) {
      return window.MarketIntelligenceHydration.getSnapshot();
    }
    return null;
  });
  const [status, setStatus] = useState('idle');

  const updateFromSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setMarketSnapshot(snapshot);
    const value = extractTheoreticalSpotTce(snapshot, vesselCategory);
    if (Number.isFinite(value) && value > 0) {
      setSpotTce(value);
    }
  }, [vesselCategory]);

  useEffect(() => {
    // Initial read
    const initial = getTheoreticalSpotTce(vesselCategory);
    if (Number.isFinite(initial) && initial > 0) {
      setSpotTce(initial);
    }

    if (typeof window === 'undefined') return;

    // Listen to MarketIntelligenceHydration subscription if available
    let unsubscribe = null;
    if (window.MarketIntelligenceHydration?.subscribe) {
      unsubscribe = window.MarketIntelligenceHydration.subscribe((state) => {
        setStatus(state?.status || 'ready');
        if (state?.snapshot) {
          updateFromSnapshot(state.snapshot);
        }
      });
    }

    // Event listener for hydrated market intelligence event
    const handleHydratedEvent = (event) => {
      const snap = event.detail?.snapshot || window.MarketIntelligenceHydration?.getSnapshot?.();
      if (snap) {
        updateFromSnapshot(snap);
      }
    };
    window.addEventListener('seacharter:market-intelligence-hydrated', handleHydratedEvent);

    // Event listener for MARKET_REFERENCE_UPDATED event
    const handleMarketReferenceEvent = (event) => {
      const { tce } = event.detail || {};
      const numericTce = Number(tce);
      if (Number.isFinite(numericTce) && numericTce > 0) {
        setSpotTce(numericTce);
      }
    };
    window.addEventListener('MARKET_REFERENCE_UPDATED', handleMarketReferenceEvent);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('seacharter:market-intelligence-hydrated', handleHydratedEvent);
      window.removeEventListener('MARKET_REFERENCE_UPDATED', handleMarketReferenceEvent);
    };
  }, [vesselCategory, updateFromSnapshot]);

  const refreshSpot = useCallback(async () => {
    if (typeof window !== 'undefined' && window.MarketIntelligenceHydration?.refresh) {
      setStatus('loading');
      try {
        const snap = await window.MarketIntelligenceHydration.refresh({ force: true });
        if (snap) {
          updateFromSnapshot(snap);
          setStatus('ready');
          return extractTheoreticalSpotTce(snap, vesselCategory);
        }
      } catch (err) {
        setStatus('error');
      }
    }
    const currentVal = getTheoreticalSpotTce(vesselCategory);
    if (Number.isFinite(currentVal) && currentVal > 0) {
      setSpotTce(currentVal);
      return currentVal;
    }
    return spotTce;
  }, [vesselCategory, updateFromSnapshot, spotTce]);

  return {
    spotTce,
    theoreticalSpotTce: spotTce,
    tceSpotTeorico: spotTce,
    tceObjetivo: spotTce,
    vesselClass,
    marketSnapshot,
    status,
    refreshSpot,
  };
}

export default useDataBridgeSpotConnection;
