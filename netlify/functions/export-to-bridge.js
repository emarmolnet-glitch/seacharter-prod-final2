const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const DATA_BRIDGE_RECEIVE_CORE_DATA_URL = "https://calm-shortbread-55bcfc.netlify.app/api/receive-core-data";

function getBearerToken(event) {
  const authorization = String(event.headers?.authorization || event.headers?.Authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1].trim() : "") || String(process.env.API_SECRET || process.env.VITE_API_SECRET || "").trim();
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

function extractRemoteError(payload, fallback) {
  if (payload && typeof payload === "object") {
    return String(payload.error || payload.message || payload.detail || fallback);
  }
  return fallback;
}

function cleanText(value, fallback = "N/A") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function readFirst(source, keys, fallback = "N/A") {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function cleanNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanImo(value) {
  const rawValue = String(value ?? "").trim();
  const digits = rawValue.replace(/\D/g, "");
  return digits.length === 7 ? digits : rawValue || "N/A";
}

function getVesselsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.vessels)) return payload.vessels;
  if (Array.isArray(payload.buques)) return payload.buques;
  if (Array.isArray(payload.selectedVessels)) return payload.selectedVessels;
  return [];
}

function normalizeCoreVessel(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    IMO: cleanImo(readFirst(source, ["IMO", "imo", "numero_imo", "imoNumber", "numeroIMO"], "")),
    nombre: cleanText(readFirst(source, ["nombre", "name", "vessel_name", "vesselName", "ShipName"], "")),
    dwt: cleanNumber(readFirst(source, ["dwt", "DWT", "deadweight", "dwt_ajustado"], 0)),
    mmsi: cleanText(readFirst(source, ["mmsi", "MMSI"], "")),
    type: cleanText(readFirst(source, ["type", "vessel_type", "tipo", "tipo_buque"], "")),
    draft: cleanNumber(readFirst(source, ["draft", "Draft", "draft_meters", "calado"], 0)),
    flag: cleanText(readFirst(source, ["flag", "Flag", "bandera"], "")),
    eta: cleanText(readFirst(source, ["eta", "ETA", "eta_puerto_carga", "estimatedEta", "etaEstimated"], "")),
    ultimo_puerto: cleanText(readFirst(source, ["ultimo_puerto", "last_port", "lastPort", "lastPortOfCall"], "")),
    destino_actual: cleanText(readFirst(source, ["destino_actual", "destination", "plannedDestination"], "")),
    eta_puerto_carga: cleanText(readFirst(source, ["eta_puerto_carga", "eta", "ETA"], "")),
    eta_delta: cleanText(readFirst(source, ["eta_delta"], "")),
    numero_imo: cleanText(readFirst(source, ["numero_imo", "IMO", "imo", "imoNumber"], "")),
    tipo_buque: cleanText(readFirst(source, ["tipo_buque", "vessel_type", "type", "tipo"], "")),
    ano_construccion: cleanText(readFirst(source, ["ano_construccion", "year_built", "builtYear", "built_year", "built"], "")),
    bandera: cleanText(readFirst(source, ["bandera", "flag", "Flag"], "")),
    armador_manager: cleanText(readFirst(source, ["armador_manager", "owner_manager", "armador", "owner", "manager", "operator"], "")),
    gruas_geared: Boolean(readFirst(source, ["gruas_geared", "has_gears", "hasCranes", "gruas"], false)),
    estadoProcesos: cleanText(readFirst(source, ["estadoProcesos", "status", "audit_status", "auditStatus"], "")),
  };
}

function buildCoreDataPayload(payload) {
  return {
    vessels: getVesselsFromPayload(payload)
      .map(normalizeCoreVessel)
      .filter((vessel) => vessel.IMO !== "N/A" || vessel.nombre !== "N/A"),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { success: false, error: "Method not allowed" });
  }

  const token = getBearerToken(event);

  let payload;
  try {
    payload = JSON.parse(event.body || "null");
  } catch {
    return response(400, { success: false, error: "Payload JSON inválido." });
  }

  try {
    const coreDataPayload = buildCoreDataPayload(payload);
    if (coreDataPayload.vessels.length === 0) {
      return response(400, { success: false, error: "No valid vessels were provided" });
    }

    const headers = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    const bridgeResponse = await fetch(DATA_BRIDGE_RECEIVE_CORE_DATA_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(coreDataPayload),
    });

    let bridgePayload = null;
    try {
      bridgePayload = await bridgeResponse.json();
    } catch {
      bridgePayload = null;
    }

    if (!bridgeResponse.ok) {
      if (bridgeResponse.status === 404) {
        console.error("Error: El endpoint de Data Bridge no fue encontrado. Verifica la URL de recepción");
      }

      return response(bridgeResponse.status, {
        success: false,
        error: extractRemoteError(bridgePayload, `Data Bridge respondió ${bridgeResponse.status}`),
      });
    }

    return response(200, { success: true, message: "Enviado", detail: bridgePayload });
  } catch {
    return response(502, { success: false, error: "No se pudo enviar el payload a Data Bridge." });
  }
};
