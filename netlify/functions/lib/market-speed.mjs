import { normalizeFfaVesselClass, resolvePricingMarketMapping } from './spot-rates.mjs';

export function normalizeMarketSpeedVesselClass(value) {
  const pricingMapping = resolvePricingMarketMapping(value);
  return pricingMapping?.ffaVesselClass || normalizeFfaVesselClass(value);
}

export async function fetchLatestMarketSpeed(pool, requestedVesselClass) {
  const vesselClass = normalizeMarketSpeedVesselClass(requestedVesselClass);
  if (!vesselClass) {
    throw new Error('Clase de buque sin referencia de velocidad de mercado.');
  }

  const result = await pool.query(
    `
      SELECT
        vessel_class,
        average_speed_knots::double precision AS average_speed_knots,
        COALESCE(
          to_jsonb(market_speed)->>'record_date',
          to_jsonb(market_speed)->>'recorded_at',
          to_jsonb(market_speed)->>'observed_at',
          to_jsonb(market_speed)->>'calculated_at',
          to_jsonb(market_speed)->>'updated_at',
          to_jsonb(market_speed)->>'created_at'
        ) AS observed_at
      FROM market_average_speeds AS market_speed
      WHERE UPPER(TRIM(vessel_class)) LIKE $1
        AND average_speed_knots IS NOT NULL
        AND average_speed_knots > 0
      ORDER BY observed_at DESC NULLS LAST, market_speed.ctid DESC
      LIMIT 1
    `,
    [`%${vesselClass.toUpperCase()}%`],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    vesselClass: String(row.vessel_class),
    averageSpeedKnots: Number(row.average_speed_knots),
    observedAt: row.observed_at || null,
  };
}
