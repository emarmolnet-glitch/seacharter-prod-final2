import { getStore } from '@netlify/blobs';
import {
  FEARNLEYS_CATEGORY_ROUTES,
  fetchLatestFearnleysRate,
  getFearnleysCacheKey,
  getIsoWeek,
  isCurrentWeekCacheEntry,
} from './lib/fearnleys-cache.mjs';

const STORE_NAME = 'fearnleys-tce-cache';

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Método no permitido. Usa GET.' }, 405);
  }

  const requestUrl = new URL(request.url);
  const vesselCategory = String(requestUrl.searchParams.get('vesselCategory') || '').trim();
  const cacheKey = getFearnleysCacheKey(vesselCategory);
  if (!cacheKey || !FEARNLEYS_CATEGORY_ROUTES[vesselCategory]) {
    return jsonResponse({ ok: false, error: 'Tamaño de buque no compatible.' }, 400);
  }

  const currentWeek = getIsoWeek();
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  try {
    const cachedEntry = await store.get(cacheKey, { type: 'json' });
    if (isCurrentWeekCacheEntry(cachedEntry, currentWeek)) {
      return jsonResponse({
        ok: true,
        cacheHit: true,
        cacheStatus: 'hit',
        ...cachedEntry,
      });
    }

    const extractedRate = await fetchLatestFearnleysRate(vesselCategory);
    const nextEntry = {
      vesselCategory,
      ...currentWeek,
      ...extractedRate,
      cachedAt: new Date().toISOString(),
    };
    await store.setJSON(cacheKey, nextEntry);

    return jsonResponse({
      ok: true,
      cacheHit: false,
      cacheStatus: cachedEntry ? 'expired' : 'miss',
      ...nextEntry,
    });
  } catch (error) {
    console.error('[fearnleys-tce] Weekly rate request failed.', error);
    return jsonResponse({
      ok: false,
      error: 'No se pudo actualizar el TCE semanal de Fearnleys.',
      weekId: currentWeek.weekId,
    }, 502);
  }
}

export const config = {
  path: '/api/fearnleys-tce',
};
