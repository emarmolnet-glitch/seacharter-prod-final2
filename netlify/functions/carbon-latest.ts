import type { Config, Context } from '@netlify/functions';
import { getPool } from '../../db/index.js';
import { fetchLatestCarbonPrice } from './lib/carbon-price.mjs';

const responseHeaders = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
  'Content-Type': 'application/json; charset=utf-8',
};

export default async function carbonLatestHandler(request: Request, context: Context) {
  if (request.method !== 'GET') {
    return Response.json(
      { success: false, error: 'Método no permitido.' },
      { status: 405, headers: responseHeaders },
    );
  }

  try {
    const latestPrice = await fetchLatestCarbonPrice(getPool());
    if (!latestPrice) {
      return Response.json(
        { success: false, error: 'No existe una cotización de carbono disponible.' },
        { status: 404, headers: responseHeaders },
      );
    }

    return Response.json({
      success: true,
      ...latestPrice,
      source: 'market_carbon_prices',
    }, { status: 200, headers: responseHeaders });
  } catch (error: any) {
    console.error('[carbon-latest] Carbon price query failed.', {
      requestId: context.requestId,
      code: error?.code,
    });
    const tableUnavailable = error?.code === '42P01';
    return Response.json(
      { success: false, error: 'No fue posible consultar la cotización de carbono.' },
      { status: tableUnavailable ? 503 : 500, headers: responseHeaders },
    );
  }
}

export const config: Config = {
  path: '/api/market/carbon-latest',
};
