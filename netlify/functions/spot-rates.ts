import type { Config } from '@netlify/functions';
import { getPool } from '../../db/index.js';
import {
  fetchLatestBalticSpotRates,
  fetchLatestFfaRate,
  normalizeBalticSpotIndex,
  normalizeFfaVesselClass,
  resolvePricingMarketMapping,
} from './lib/spot-rates.mjs';

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return Response.json({ success: false, error: 'Method not allowed' }, { status: 405, headers });
  }

  const url = new URL(req.url);
  const requestedCategory = url.searchParams.get('vesselCategory');
  const categoryMapping = requestedCategory ? resolvePricingMarketMapping(requestedCategory) : null;
  if (requestedCategory && !categoryMapping) {
    return Response.json({ success: false, error: 'Clase de buque sin referencia Baltic/FFA.' }, { status: 400, headers });
  }

  const requestedIndex = categoryMapping?.spotIndex || url.searchParams.get('index');
  const requestedVesselClass = categoryMapping?.ffaVesselClass
    || url.searchParams.get('vesselClass')
    || 'Handysize';
  if (requestedIndex && !normalizeBalticSpotIndex(requestedIndex)) {
    return Response.json({ success: false, error: 'Índice Baltic Spot no válido.' }, { status: 400, headers });
  }
  if (!normalizeFfaVesselClass(requestedVesselClass)) {
    return Response.json({ success: false, error: 'Clase de buque FFA no válida.' }, { status: 400, headers });
  }

  try {
    const pool = getPool();
    const [data, tceTarget] = await Promise.all([
      fetchLatestBalticSpotRates(pool, requestedIndex),
      fetchLatestFfaRate(pool, requestedVesselClass),
    ]);
    if (requestedIndex && data.length === 0) {
      return Response.json({ success: false, error: 'Índice Baltic Spot no disponible.' }, { status: 404, headers });
    }
    if (!tceTarget || !Number.isFinite(tceTarget.rate_usd)) {
      return Response.json({ success: false, error: 'TCA FFA no disponible.' }, { status: 404, headers });
    }

    return Response.json({
      success: true,
      data,
      rates: Object.fromEntries(data.map((entry) => [entry.index_name, entry])),
      spotReference: requestedIndex ? data[0] || null : null,
      tceTarget,
      mapping: {
        vesselCategory: requestedCategory,
        spotIndex: requestedIndex,
        ffaVesselClass: normalizeFfaVesselClass(requestedVesselClass),
      },
    }, { status: 200, headers });
  } catch (error) {
    console.error('[spot-rates] Database query failed', error);
    return Response.json({ success: false, error: 'No se pudo consultar Baltic Exchange Spot Reference.' }, {
      status: 500,
      headers,
    });
  }
};

export const config: Config = {
  path: '/api/spot-rates',
};
