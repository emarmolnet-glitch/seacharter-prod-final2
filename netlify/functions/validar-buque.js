const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function readText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function readNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeImo(value) {
  const raw = readText(value).replace(/^IMO\s*/i, "");
  if (!/^\d{7}$/.test(raw)) return null;
  return raw;
}

function simulateLastPortOfCall(destination) {
  const normalizedDestination = destination.toUpperCase();
  const simulatedPorts = {
    ROTTERDAM: "Antwerp",
    ANTWERP: "Rotterdam",
    SINGAPORE: "Tanjung Pelepas",
    "LOS ANGELES": "Oakland",
    VALENCIA: "Barcelona",
    ALGECIRAS: "Tangier Med",
    HOUSTON: "New Orleans",
    SHANGHAI: "Ningbo-Zhoushan",
    HAMBURG: "Bremerhaven",
  };

  return simulatedPorts[normalizedDestination] || "Puerto simulado AIS";
}

function validateVessel(payload) {
  const imo = normalizeImo(payload.imo || payload.IMO || payload.imoNumber || payload.IMONumber);
  const destination = readText(payload.destination || payload.Destination || payload.destino || payload.Destino);
  const draft = readNumber(payload.draft || payload.Draft || payload.calado || payload.Calado);

  const errors = [];
  if (!imo) errors.push("IMO requerido con formato de 7 digitos.");
  if (draft !== null && (draft < 0 || draft > 30)) errors.push("Calado fuera de rango operativo.");

  return {
    errors,
    normalized: {
      imo,
      destination: destination ? destination.toUpperCase() : "N/A",
      draft,
    },
  };
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Metodo no permitido. Usa POST." }, 405);
  }

  try {
    const payload = await req.json();
    const { errors, normalized } = validateVessel(payload);

    if (errors.length > 0) {
      return jsonResponse({ ok: false, errors }, 400);
    }

    const enrichedVessel = {
      ...payload,
      imo: normalized.imo,
      destination: normalized.destination,
      draft: normalized.draft,
      lastPortOfCall: simulateLastPortOfCall(normalized.destination),
      dataBridge: {
        validator: "SeaCharter Data Bridge",
        status: "validated",
        enrichedAt: new Date().toISOString(),
        source: "simulated-last-port-provider",
      },
    };

    return jsonResponse({
      ok: true,
      success: true,
      vessel: enrichedVessel,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "JSON invalido o cuerpo de solicitud no procesable.",
    }, 400);
  }
};

export const config = {
  path: "/api/validate-vessel",
};
