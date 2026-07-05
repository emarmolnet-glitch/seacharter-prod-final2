declare const process: { env: Record<string, string | undefined> };

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getDataBridgeApiUrl() {
  return String(process.env.DATA_BRIDGE_API_URL || process.env.VITE_DATA_BRIDGE_API_URL || "").trim();
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getBearerToken(req: Request) {
  const authorization = String(req.headers.get("authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const apiUrl = getDataBridgeApiUrl();
  if (!isValidHttpUrl(apiUrl)) {
    return Response.json(
      { success: false, error: "Configura DATA_BRIDGE_API_URL o VITE_DATA_BRIDGE_API_URL para verificar la conexión." },
      { status: 500, headers },
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return Response.json({ success: false, error: "Introduce el API Secret para continuar." }, { status: 400, headers });
  }

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/verify-connection`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error || "")
          : payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: unknown }).message || "")
            : `Error de conexión (${response.status})`;
      return Response.json({ success: false, error: message }, { status: response.status, headers });
    }

    return Response.json(payload && typeof payload === "object" ? payload : { success: true }, { headers });
  } catch {
    return Response.json(
      { success: false, error: "No se pudo verificar la conexión con Data Bridge." },
      { status: 502, headers },
    );
  }
};
