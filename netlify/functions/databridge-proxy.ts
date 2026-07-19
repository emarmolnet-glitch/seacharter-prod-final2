import type { Config } from "@netlify/functions";

declare const process: { env: Record<string, string | undefined> };

const PROXY_PATH_PREFIX = "/api/databridge/";
const DEFAULT_DATA_BRIDGE_ORIGIN = "https://calm-shortbread-55bcfc.netlify.app";
const MAX_REDIRECTS = 5;

function readEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getForwardPath(requestUrl: URL) {
  const relativePath = requestUrl.pathname.startsWith(PROXY_PATH_PREFIX)
    ? requestUrl.pathname.slice(PROXY_PATH_PREFIX.length)
    : "";
  return relativePath.replace(/^\/+/, "");
}

function resolveTargetUrl(requestUrl: URL) {
  const forwardPath = getForwardPath(requestUrl);
  if (!forwardPath) return null;

  const receiveCoreDataUrl = readEnvironmentValue("DATA_BRIDGE_RECEIVE_CORE_DATA_URL");
  if (forwardPath === "receive-core-data" && isValidHttpUrl(receiveCoreDataUrl)) {
    const targetUrl = new URL(receiveCoreDataUrl);
    targetUrl.search = requestUrl.search;
    return targetUrl;
  }

  const apiOrigin = readEnvironmentValue(
    "DATA_BRIDGE_PROXY_ORIGIN",
    "DATA_BRIDGE_API_URL",
    "VITE_DATA_BRIDGE_API_URL",
  ) || DEFAULT_DATA_BRIDGE_ORIGIN;
  if (!isValidHttpUrl(apiOrigin)) return null;

  const configuredPath = forwardPath === "receive-core-data"
    ? readEnvironmentValue("DATA_BRIDGE_RECEIVE_CORE_DATA_PATH")
    : "";
  const targetPath = configuredPath || `/api/${forwardPath}`;
  const targetUrl = new URL(targetPath, `${apiOrigin.replace(/\/+$/, "")}/`);
  targetUrl.search = requestUrl.search;
  return targetUrl;
}

function createForwardHeaders(req: Request, hasBody: boolean) {
  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.delete("connection");
  forwardHeaders.delete("content-length");
  forwardHeaders.delete("host");

  if (hasBody && !forwardHeaders.has("content-type")) {
    forwardHeaders.set("content-type", "application/json");
  }
  if (!forwardHeaders.has("accept")) {
    forwardHeaders.set("accept", "application/json");
  }

  const apiSecret = readEnvironmentValue("DATA_BRIDGE_API_SECRET", "VITE_DATA_BRIDGE_API_SECRET");
  if (apiSecret && !forwardHeaders.has("authorization")) {
    forwardHeaders.set("authorization", `Bearer ${apiSecret}`);
  }
  const apiKey = readEnvironmentValue("DATA_BRIDGE_API_KEY", "VITE_DATA_BRIDGE_API_KEY");
  if (apiKey && !forwardHeaders.has("x-api-key")) {
    forwardHeaders.set("x-api-key", apiKey);
  }
  return forwardHeaders;
}

async function fetchPreservingMethod(
  initialUrl: URL,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
) {
  let targetUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error("Data Bridge redirect limit exceeded");

    targetUrl = new URL(location, targetUrl);
    if (!isValidHttpUrl(targetUrl.href)) throw new Error("Data Bridge returned an invalid redirect");
  }

  throw new Error("Data Bridge redirect limit exceeded");
}

export default async (req: Request) => {
  if (req.method === "CONNECT" || req.method === "TRACE") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const targetUrl = resolveTargetUrl(new URL(req.url));
  if (!targetUrl) {
    return Response.json({ success: false, error: "Data Bridge target is not configured." }, { status: 503 });
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;
  const forwardHeaders = createForwardHeaders(req, hasBody);

  try {
    const upstreamResponse = await fetchPreservingMethod(targetUrl, req.method, forwardHeaders, body);
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-length");
    responseHeaders.set("cache-control", "no-store");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[databridge-proxy] Data Bridge request failed.", error);
    return Response.json({ success: false, error: "No se pudo completar la comunicación con Data Bridge." }, {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/databridge/*",
};
