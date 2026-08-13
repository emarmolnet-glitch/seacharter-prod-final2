import { normalizeFfaVesselClass, resolvePricingMarketMapping } from './spot-rates.mjs';

export function normalizeMarketSpeedVesselClass(value) {
  const pricingMapping = resolvePricingMarketMapping(value);
  return pricingMapping?.ffaVesselClass || normalizeFfaVesselClass(value);
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function finiteNumber(...values) {
  const value = firstDefined(...values);
  if (value === undefined) return null;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

export function resolveVesselMarketSpeedClass(vessel) {
  const source = asRecord(vessel);
  const metadata = asRecord(source.MetaData || source.metadata);
  const nestedVessel = asRecord(source.vessel);
  const ais = asRecord(source.ais);
  const declaredClass = firstDefined(
    source.marketSpeedVesselClass,
    source.vesselClass,
    source.vessel_class,
    source.vesselType,
    source.vessel_type,
    source.shipType,
    source.ship_type,
    nestedVessel.vesselClass,
    nestedVessel.vessel_type,
    nestedVessel.shipType,
    metadata.vesselClass,
    metadata.vessel_type,
    metadata.shipType,
    ais.vesselClass,
    ais.vessel_type,
  );
  const normalizedClass = normalizeMarketSpeedVesselClass(declaredClass);
  if (normalizedClass) return normalizedClass;

  const dwt = finiteNumber(
    source.dwt,
    source.DWT,
    nestedVessel.dwt,
    nestedVessel.DWT,
    metadata.dwt,
    metadata.DWT,
    ais.dwt,
    ais.DWT,
  );
  if (!dwt || dwt < 15_000) return null;
  if (dwt < 35_000) return 'Handysize';
  if (dwt < 65_000) return 'Supramax';
  if (dwt < 85_000) return 'Panamax';
  return 'Capesize';
}

export function readReportedVesselSpeed(vessel) {
  const source = asRecord(vessel);
  const metadata = asRecord(source.MetaData || source.metadata);
  const position = asRecord(source.PositionReport || source.position);
  const ais = asRecord(source.ais);
  return finiteNumber(
    source.speed_over_ground,
    source.speedOverGround,
    source.sog,
    source.SOG,
    source.speed,
    ais.speed_over_ground,
    ais.speedOverGround,
    ais.sog,
    ais.SOG,
    ais.speed,
    metadata.speed_over_ground,
    metadata.speedOverGround,
    metadata.sog,
    metadata.SOG,
    metadata.speed,
    position.Sog,
    position.SOG,
    position.speed,
  );
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

export async function enrichVesselsWithMarketSpeedDefaults(pool, vessels) {
  const rows = Array.isArray(vessels) ? vessels : [];
  const classes = [...new Set(rows.map(resolveVesselMarketSpeedClass).filter(Boolean))];
  const marketSpeeds = new Map();

  await Promise.all(classes.map(async (vesselClass) => {
    const marketSpeed = await fetchLatestMarketSpeed(pool, vesselClass);
    if (marketSpeed && Number.isFinite(marketSpeed.averageSpeedKnots) && marketSpeed.averageSpeedKnots > 0) {
      marketSpeeds.set(vesselClass, marketSpeed);
    }
  }));

  let defaultedCount = 0;
  const enrichedVessels = rows.map((vessel) => {
    if (readReportedVesselSpeed(vessel) !== null) return vessel;
    const vesselClass = resolveVesselMarketSpeedClass(vessel);
    const marketSpeed = vesselClass ? marketSpeeds.get(vesselClass) : null;
    if (!marketSpeed) return vessel;

    defaultedCount += 1;
    const metadata = asRecord(vessel.MetaData || vessel.metadata);
    return {
      ...vessel,
      speed: marketSpeed.averageSpeedKnots,
      speed_over_ground: marketSpeed.averageSpeedKnots,
      speedOverGround: marketSpeed.averageSpeedKnots,
      marketAverageSpeedKnots: marketSpeed.averageSpeedKnots,
      marketSpeedVesselClass: vesselClass,
      marketSpeedObservedAt: marketSpeed.observedAt,
      speedInferenceSource: 'market_average_speeds',
      speedTelemetryAvailable: false,
      MetaData: {
        ...metadata,
        marketAverageSpeedKnots: marketSpeed.averageSpeedKnots,
        marketSpeedVesselClass: vesselClass,
        marketSpeedObservedAt: marketSpeed.observedAt,
        speedInferenceSource: 'market_average_speeds',
        speedTelemetryAvailable: false,
      },
    };
  });

  return {
    vessels: enrichedVessels,
    diagnostics: {
      requestedClasses: classes,
      resolvedClasses: [...marketSpeeds.keys()],
      defaultedCount,
      source: 'market_average_speeds',
    },
  };
}
