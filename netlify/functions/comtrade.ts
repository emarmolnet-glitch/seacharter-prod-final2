import type { Handler } from '@netlify/functions';

const COMTRADE_TRADE_ENDPOINT = 'https://comtradeapi.un.org/data/v1/get/C/A/HS';
const COMTRADE_REPORTERS_ENDPOINT = 'https://comtradeapi.un.org/files/v1/app/reference/Reporters.json';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.VITE_UN_COMTRADE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: 'UN Comtrade API key is not configured.' });
  }

  const query = event.queryStringParameters || {};
  const isReporterReferenceRequest = query.reference === 'reporters';
  let upstreamUrl: URL;

  if (isReporterReferenceRequest) {
    upstreamUrl = new URL(COMTRADE_REPORTERS_ENDPOINT);
  } else {
    const reporterCode = String(query.reportercode || '').trim();
    const partnerCode = String(query.partnercode || '').trim();
    const cmdCode = String(query.cmdcode || '').trim();
    const period = String(query.period || '').trim();
    const flowCode = String(query.flowcode || 'M').trim().toUpperCase();

    if (!/^\d{1,3}$/.test(reporterCode)
      || !/^\d{1,3}$/.test(partnerCode)
      || !/^\d{4,6}$/.test(cmdCode)
      || !/^\d{4}$/.test(period)
      || !/^(M|X)$/.test(flowCode)) {
      return jsonResponse(400, {
        error: 'Invalid or missing reportercode, partnercode, cmdcode, period, or flowcode.',
      });
    }

    upstreamUrl = new URL(COMTRADE_TRADE_ENDPOINT);
    upstreamUrl.search = new URLSearchParams({
      flowCode,
      reporterCode,
      partnerCode,
      partner2Code: '0',
      cmdCode,
      period,
      customsCode: 'C00',
      motCode: '0',
      maxRecords: '500',
    }).toString();
  }

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });
    const responseText = await response.text();
    let data: unknown;

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      return jsonResponse(502, { error: 'UN Comtrade returned an invalid JSON response.' });
    }

    if (!response.ok) {
      return jsonResponse(response.status, data);
    }

    const apiStatusCode = typeof data === 'object' && data !== null && 'statusCode' in data
      ? Number(data.statusCode)
      : 0;
    if (apiStatusCode >= 400) {
      const errorStatus = apiStatusCode <= 599 ? apiStatusCode : 502;
      return jsonResponse(errorStatus, data);
    }

    return jsonResponse(200, data);
  } catch (error) {
    console.error('[comtrade] Upstream request failed.', {
      endpoint: upstreamUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(502, { error: 'Unable to connect to UN Comtrade.' });
  }
};
