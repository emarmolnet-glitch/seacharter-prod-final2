const BALTIC_SPOT_INDICES = new Set(['BCI', 'BDI', 'BHSI', 'BPI', 'BSI']);
const FFA_VESSEL_CLASSES = ['Handysize', 'Supramax', 'Panamax', 'Capesize'];

export function normalizeBalticSpotIndex(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return BALTIC_SPOT_INDICES.has(normalized) ? normalized : null;
}

export function normalizeFfaVesselClass(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return FFA_VESSEL_CLASSES.find((vesselClass) => normalized.includes(vesselClass.toUpperCase())) || null;
}

export function resolvePricingMarketMapping(vesselCategory) {
  const normalizedCategory = String(vesselCategory || '').trim().toUpperCase();
  if (!normalizedCategory) return null;

  if (normalizedCategory.includes('HANDY')) {
    return { spotIndex: 'BHSI', ffaVesselClass: 'Handysize' };
  }
  if (normalizedCategory.includes('SUPRAMAX') || normalizedCategory.includes('ULTRAMAX')) {
    return { spotIndex: 'BSI', ffaVesselClass: 'Supramax' };
  }
  if (normalizedCategory.includes('PANAMAX') || normalizedCategory.includes('KAMSARMAX')) {
    return { spotIndex: 'BPI', ffaVesselClass: 'Panamax' };
  }
  if (
    normalizedCategory.includes('CAPE')
    || normalizedCategory.includes('VLOC')
    || normalizedCategory.includes('VLCC')
  ) {
    return { spotIndex: 'BCI', ffaVesselClass: 'Capesize' };
  }

  return null;
}

export function getCurrentFfaPeriod(now = new Date()) {
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(now);
  const year = String(now.getUTCFullYear()).slice(-2);
  return `${month}-${year}`;
}

export async function fetchLatestBalticSpotRates(pool, requestedIndex = null) {
  const marketIndex = requestedIndex ? normalizeBalticSpotIndex(requestedIndex) : null;
  if (requestedIndex && !marketIndex) {
    throw new Error('Índice Baltic Spot no válido.');
  }

  const result = marketIndex
    ? await pool.query(
      `
        SELECT
          index_name,
          record_date,
          spot_rate::double precision AS spot_rate,
          daily_change_value::double precision AS daily_change_value,
          daily_change_pct::double precision AS daily_change_pct,
          monthly_change_pct::double precision AS monthly_change_pct,
          created_at
        FROM market_spot_rates
        WHERE index_name = $1
        ORDER BY record_date DESC, created_at DESC, id DESC
        LIMIT 1
      `,
      [marketIndex],
    )
    : await pool.query(
      `
        SELECT DISTINCT ON (index_name)
          index_name,
          record_date,
          spot_rate::double precision AS spot_rate,
          daily_change_value::double precision AS daily_change_value,
          daily_change_pct::double precision AS daily_change_pct,
          monthly_change_pct::double precision AS monthly_change_pct,
          created_at
        FROM market_spot_rates
        ORDER BY index_name, record_date DESC, created_at DESC, id DESC
      `,
    );

  return result.rows.map((row) => ({
    index_name: String(row.index_name),
    record_date: row.record_date,
    spot_rate: Number(row.spot_rate),
    daily_change_value: row.daily_change_value === null ? null : Number(row.daily_change_value),
    daily_change_pct: row.daily_change_pct === null ? null : Number(row.daily_change_pct),
    monthly_change_pct: row.monthly_change_pct === null ? null : Number(row.monthly_change_pct),
    created_at: row.created_at,
  }));
}

export async function fetchLatestFfaRate(pool, requestedVesselClass = 'Handysize', now = new Date()) {
  const vesselClass = normalizeFfaVesselClass(requestedVesselClass);
  if (!vesselClass) {
    throw new Error('Clase de buque FFA no válida.');
  }

  const currentPeriod = getCurrentFfaPeriod(now);
  const result = await pool.query(
    `
      SELECT
        vessel_class,
        period,
        record_date,
        rate_usd::double precision AS rate_usd,
        created_at
      FROM market_ffa_rates
      WHERE vessel_class ILIKE $1
      ORDER BY
        CASE WHEN period = $2 THEN 0 ELSE 1 END,
        record_date DESC,
        created_at DESC,
        id DESC
      LIMIT 1
    `,
    [`%${vesselClass}%`, currentPeriod],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    vessel_class: String(row.vessel_class),
    period: String(row.period),
    record_date: row.record_date,
    rate_usd: Number(row.rate_usd),
    created_at: row.created_at,
  };
}
