export async function fetchLatestCarbonPrice(pool) {
  const result = await pool.query(`
    SELECT
      record_date,
      price_usd::double precision AS price_usd
    FROM market_carbon_prices
    WHERE price_usd IS NOT NULL
    ORDER BY record_date DESC
    LIMIT 1
  `);

  const row = result.rows[0];
  if (!row) return null;

  const priceUsd = Number(row.price_usd);
  if (!Number.isFinite(priceUsd) || priceUsd < 0) return null;

  return {
    recordDate: row.record_date instanceof Date
      ? row.record_date.toISOString().slice(0, 10)
      : String(row.record_date),
    priceUsd,
  };
}
