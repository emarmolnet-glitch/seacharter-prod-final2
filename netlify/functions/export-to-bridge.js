const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getDataBridgeApiUrl() {
  return String(process.env.DATA_BRIDGE_API_URL || process.env.VITE_DATA_BRIDGE_API_URL || "").trim();
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { success: false, error: "Method not allowed" });
  }

  const apiUrl = getDataBridgeApiUrl();
  if (!isValidHttpUrl(apiUrl)) {
    return response(500, { success: false, error: "Configura DATA_BRIDGE_API_URL o VITE_DATA_BRIDGE_API_URL para exportar a Data Bridge." });
  }

  const token = getBearerToken(event);
  if (!token) {
    return response(400, { success: false, error: "Conecta Data Bridge antes de exportar." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "null");
  } catch {
    return response(400, { success: false, error: "Payload JSON inválido." });
  }

  try {
    const bridgeResponse = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/receive-vessels`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let bridgePayload = null;
    try {
      bridgePayload = await bridgeResponse.json();
    } catch {
      bridgePayload = null;
    }

    if (!bridgeResponse.ok) {
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
