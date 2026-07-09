import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

const FETCH_TIMEOUT_MS = 15000;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getTargetUrl() {
  if (!process.env.DATA_BRIDGE_URL) {
    throw new Error("DATA_BRIDGE_URL is not configured. Cannot forward vessels payload to Data Bridge.");
  }

  return process.env.DATA_BRIDGE_URL + "/.netlify/functions/receive-audit";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to forward vessels payload to Data Bridge.";
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const targetUrl = getTargetUrl();
    const rawPayload = await req.text();

    console.log(`[Data Bridge] Forwarding vessels payload to: ${targetUrl}`);

    const bridgeResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.DATA_BRIDGE_API_SECRET || "",
      },
      body: rawPayload,
      signal: controller.signal,
    });

    const responseBody = await bridgeResponse.text();

    return new Response(responseBody, {
      status: bridgeResponse.status,
      headers: {
        ...jsonHeaders,
        "content-type": bridgeResponse.headers.get("content-type") || jsonHeaders["content-type"],
      },
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError";
    const status = isTimeout ? 504 : 500;

    console.error("[Data Bridge] Error forwarding vessels payload:", error);

    return Response.json(
      { success: false, error: isTimeout ? "Data Bridge request timed out." : getErrorMessage(error) },
      { status, headers: jsonHeaders },
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const config: Config = {
  path: ["/api/receive-vessels", "/.netlify/functions/receive-vessels"],
};
