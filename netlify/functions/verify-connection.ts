import type { Config } from "@netlify/functions";

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

export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const apiUrl = getDataBridgeApiUrl();
  const apiSecret = String(process.env.DATA_BRIDGE_API_SECRET || "").trim();

  if (!isValidHttpUrl(apiUrl)) {
    return Response.json(
      { success: false, error: "DATA_BRIDGE_API_URL is not configured." },
      { status: 500, headers },
    );
  }

  if (!apiSecret) {
    return Response.json(
      { success: false, error: "DATA_BRIDGE_API_SECRET is not configured." },
      { status: 500, headers },
    );
  }

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/verify-connection`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        Accept: "application/json",
      },
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401, headers });
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error || "")
          : payload && typeof payload === "object" && "message" in payload
            ? String((payload as { message?: unknown }).message || "")
            : `Connection error (${response.status})`;
      return Response.json({ success: false, error: message }, { status: response.status, headers });
    }

    return Response.json(payload && typeof payload === "object" ? payload : { success: true }, { headers });
  } catch {
    return Response.json(
      { success: false, error: "Data Bridge verification timed out or failed." },
      { status: 502, headers },
    );
  }
};

export const config: Config = {
  path: "/api/verify-connection",
};
