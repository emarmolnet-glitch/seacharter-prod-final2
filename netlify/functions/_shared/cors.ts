const DEFAULT_ALLOWED_ORIGINS = [
  "https://neon-seachartercorepro-4ce09d.netlify.app",
  "https://calm-shortbread-55bcfc.netlify.app",
];

function normalizeOrigin(value: string) {
  return value.trim();
}

function configuredOrigins() {
  return String(process.env.CORE_PRO_CORS_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function isSerializedOrigin(origin: string) {
  try {
    return new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

function isAllowedNetlifyPreview(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:"
      && !url.port
      && /^deploy-preview-[a-z0-9-]+--calm-shortbread-55bcfc\.netlify\.app$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedLocalhost(origin: string) {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(origin: string) {
  const requestOrigin = normalizeOrigin(origin);
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins()]);

  return Boolean(requestOrigin)
    && isSerializedOrigin(requestOrigin)
    && (allowedOrigins.has(requestOrigin)
      || isAllowedLocalhost(requestOrigin)
      || isAllowedNetlifyPreview(requestOrigin));
}

export function createCorsHeaders(req: Request, methods: string) {
  const requestOrigin = normalizeOrigin(req.headers.get("origin") || "");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Pragma, Cache-Control, X-Requested-With",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (isAllowedCorsOrigin(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  }

  return headers;
}
