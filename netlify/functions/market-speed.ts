import type { Config, Context } from '@netlify/functions';
import { getPool } from '../../db/index.js';
import {
  fetchLatestMarketSpeed,
  normalizeMarketSpeedVesselClass,
} from './lib/market-speed.mjs';

const responseHeaders = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
  'Content-Type': 'application/json; charset=utf-8',
};

export default async function marketSpeedHandler(request: Request, context: Context) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Método no permitido.' }, { status: 405, headers: responseHeaders });
  }

  const requestedVesselClass = new URL(request.url).searchParams.get('vesselClass')?.trim();
  const vesselClass = normalizeMarketSpeedVesselClass(requestedVesselClass);
  if (!vesselClass) {
    return Response.json(
      { error: 'Debe indicarse una clase de buque compatible.' },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const marketSpeed = await fetchLatestMarketSpeed(getPool(), vesselClass);
    if (!marketSpeed || !Number.isFinite(marketSpeed.averageSpeedKnots)) {
      return Response.json(
        { error: `No existe una velocidad media disponible para ${vesselClass}.` },
        { status: 404, headers: responseHeaders },
      );
    }

    return Response.json({
      ...marketSpeed,
      requestedVesselClass: vesselClass,
      source: 'market_average_speeds',
      liveMarket: true,
    }, { status: 200, headers: responseHeaders });
  } catch (error: any) {
    console.error('[market-speed] Market speed query failed.', {
      requestId: context.requestId,
      code: error?.code,
    });
    const tableUnavailable = error?.code === '42P01';
    return Response.json(
      { error: 'No fue posible consultar la velocidad media de mercado.' },
      { status: tableUnavailable ? 503 : 500, headers: responseHeaders },
    );
  }
}

export const config: Config = {
  path: '/api/market-speed',
};
