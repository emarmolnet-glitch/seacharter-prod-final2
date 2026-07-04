const REQUEST_DELAY_MS = 1200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function textResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(body, status = 200) {
  return textResponse(JSON.stringify(body), status, {
    "Content-Type": "application/json; charset=utf-8",
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Metodo no permitido. Usa POST." }, 405);
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "JSON invalido o cuerpo de solicitud no procesable." }, 400);
  }

  let targetUrl;
  try {
    targetUrl = new URL(String(payload.url || ""));
  } catch {
    return jsonResponse({ ok: false, error: "Se requiere una URL valida." }, 400);
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return jsonResponse({ ok: false, error: "Solo se permiten URLs HTTP o HTTPS." }, 400);
  }

  if (!/(^|\.)vesselfinder\.com$/i.test(targetUrl.hostname)) {
    return jsonResponse({ ok: false, error: "Solo se permiten URLs de vesselfinder.com." }, 400);
  }

  await sleep(REQUEST_DELAY_MS);

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });

    const html = await upstream.text();

    if (!upstream.ok) {
      return jsonResponse({ ok: false, error: `VesselFinder devolvio ${upstream.status}.` }, 502);
    }

    return jsonResponse({ html }, 200);
  } catch {
    return jsonResponse({ ok: false, error: "No se pudo conectar con VesselFinder." }, 502);
  }
}
