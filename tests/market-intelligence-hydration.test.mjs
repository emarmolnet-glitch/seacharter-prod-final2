import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const hydrationSource = await readFile(new URL('../src/market-intelligence-hydration.js', import.meta.url), 'utf8');
const {
  createMarketIntelligenceHydration,
  normalizeMarketIntelligencePayload,
} = await import(`data:text/javascript,${encodeURIComponent(hydrationSource)}`);

test('normalizes final Data Bridge values without recalculating TCE Spot or spreads', () => {
  const snapshot = normalizeMarketIntelligencePayload({
    data: {
      snapshot_id: 'market-2026-08-26T10:00:00Z',
      source: 'DATA_BRIDGE',
      bdi: {
        value: 2302,
        change_value: -18,
        change_pct: -0.78,
        updated_at: '2026-08-26T09:45:00Z',
        status: 'LIVE',
      },
      bunkers: {
        vlsfo: 658.4,
        hsfo: 512.7,
        mgo: 734.1,
        updated_at: '2026-08-26T09:40:00Z',
      },
      tce_spot_by_class: {
        capesize: {
          base_tc: 39437,
          base_tc_change_pct: 2.4,
          theoretical_spot_tce: 42118,
          spread_usd: 2681,
          spread_pct: 6.8,
          algorithm_label: 'ALGORITMO LIVE VLSFO',
          fuel_label: 'VLSFO Standard',
          updated_at: '2026-08-26T09:42:00Z',
        },
      },
    },
  }, '2026-08-26T10:00:00Z');

  assert.equal(snapshot.snapshotId, 'market-2026-08-26T10:00:00Z');
  assert.equal(snapshot.bdi.value, 2302);
  assert.equal(snapshot.bdi.updatedAt, '2026-08-26T09:45:00Z');
  assert.equal(snapshot.bunkers.vlsfo, 658.4);
  assert.deepEqual(snapshot.tceSpotByClass.Capesize, {
    vesselClass: 'Capesize',
    baseTc: 39437,
    baseTcChangePct: 2.4,
    theoreticalSpotTce: 42118,
    spreadUsd: 2681,
    spreadPct: 6.8,
    algorithmLabel: 'ALGORITMO LIVE VLSFO',
    fuelLabel: 'VLSFO Standard',
    status: 'LIVE',
    updatedAt: '2026-08-26T09:42:00Z',
    source: 'DATA_BRIDGE',
    formulaVersion: '',
  });
});

test('deduplicates concurrent hydration requests and publishes one normalized snapshot', async () => {
  let fetchCalls = 0;
  const states = [];
  const hydration = createMarketIntelligenceHydration({
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        json: async () => ({
          bdi_index: 2302,
          bdi_updated_at: '2026-08-26T09:45:00Z',
          vlsfo: 658.4,
          hsfo: 512.7,
          mgo: 734.1,
          panamax_tce_spot: 20875,
          panamax_spread_usd: 1729,
          panamax_spread_pct: 9.03,
        }),
      };
    },
    storage: null,
    eventTarget: null,
  });
  hydration.subscribe(state => states.push(state.status));

  const [first, second] = await Promise.all([hydration.refresh(), hydration.refresh()]);

  assert.equal(fetchCalls, 1);
  assert.equal(first, second);
  assert.equal(first.tceSpotByClass.Panamax.theoreticalSpotTce, 20875);
  assert.equal(first.tceSpotByClass.Panamax.spreadUsd, 1729);
  assert.equal(first.tceSpotByClass.Panamax.spreadPct, 9.03);
  assert.deepEqual(states, ['idle', 'loading', 'ready']);
});
