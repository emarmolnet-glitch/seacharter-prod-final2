const fallbackVessels = [
  createVessel(247324000, 'RODAHMAR CARRIER', 36.14, -5.35, 35000, 22000, 9.5, 'Bulk Carrier', 'ALBARRACIN', 'En navegacion'),
  createVessel(224412000, 'TMM IBERIA TRADER', 37.95, 12.5, 42000, 26000, 10.2, 'Bulk Carrier', 'TAMPA', 'En navegacion'),
  createVessel(311000123, 'MED BULKER I', 36.5, 2.5, 55000, 31000, 11.8, 'Bulk Carrier', 'ALGERIA', 'En navegacion'),
  createVessel(477123400, 'ATLANTIC GYPSUM', 39.5, -9.5, 38000, 24000, 8.9, 'Cement Carrier', 'AVEIRO', 'En navegacion'),
  createVessel(211987600, 'CEMENT QUEEN', 41.35, 2.2, 12000, 8500, 6.5, 'Cement Carrier', 'BARCELONA', 'Fondeado'),
]

function createVessel(
  MMSI,
  ShipName,
  AIS_Live_Lat,
  AIS_Live_Lon,
  DWT,
  GT,
  Draft,
  ShipType,
  destination,
  statusLabel,
) {
  return {
    MMSI,
    ShipName,
    AIS_Live_Lat,
    AIS_Live_Lon,
    DWT,
    GT,
    Draft,
    ShipType,
    destination,
    statusLabel,
    is_estimated: true,
    MetaData: {
      MMSI,
      ShipName,
      AIS_Live_Lat,
      AIS_Live_Lon,
      DWT,
      GT,
      Draft,
      ShipType,
      destination,
      statusLabel,
      is_estimated: true,
    },
  }
}

function corsHeaders(vesselCount, targetCount) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,accept',
    'cache-control': 'public, max-age=30, stale-while-revalidate=120',
    'x-ais-persisted-count': String(vesselCount),
    'x-ais-target-count': String(targetCount),
  }
}

function toNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function filterByBounds(vessels, url) {
  const rawLatMin = url.searchParams.get('latMin') ?? url.searchParams.get('south')
  const rawLatMax = url.searchParams.get('latMax') ?? url.searchParams.get('north')
  const rawLonMin = url.searchParams.get('lonMin') ?? url.searchParams.get('west')
  const rawLonMax = url.searchParams.get('lonMax') ?? url.searchParams.get('east')

  if ([rawLatMin, rawLatMax, rawLonMin, rawLonMax].some((value) => value === null)) {
    return vessels
  }

  const latMin = Number(rawLatMin)
  const latMax = Number(rawLatMax)
  const lonMin = Number(rawLonMin)
  const lonMax = Number(rawLonMax)

  if (![latMin, latMax, lonMin, lonMax].every(Number.isFinite)) {
    return vessels
  }

  return vessels.filter((vessel) => {
    return vessel.AIS_Live_Lat >= Math.min(latMin, latMax)
      && vessel.AIS_Live_Lat <= Math.max(latMin, latMax)
      && vessel.AIS_Live_Lon >= Math.min(lonMin, lonMax)
      && vessel.AIS_Live_Lon <= Math.max(lonMin, lonMax)
  })
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(0, 0) })
  }

  const url = new URL(req.url)
  const quantity = toNumber(url.searchParams.get('quantity'), 1000)

  if (req.method === 'POST' && url.searchParams.get('action') === 'reset-cache') {
    return Response.json(
      { success: true, message: 'AIS cache reset accepted.', vessels: [] },
      { headers: corsHeaders(0, quantity) },
    )
  }

  const vessels = filterByBounds(fallbackVessels, url).slice(0, quantity)
  return Response.json(vessels, { headers: corsHeaders(vessels.length, quantity) })
}
