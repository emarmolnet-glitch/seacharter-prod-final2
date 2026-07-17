const DEFAULT_ALLOWED_ORIGINS = [
  "https://neon-seachartercorepro-4ce09d.netlify.app",
  "https://calm-shortbread-55bcfc.netlify.app",
];

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function configuredOrigins() {
  return String(process.env.CORE_PRO_CORS_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function isAllowedNetlifyPreview(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return /^deploy-preview-\d+--(?:neon-seachartercorepro-4ce09d|calm-shortbread-55bcfc)\.netlify\.app$/.test(hostname);
  } catch {
    return false;
  }
}

export function createCorsHeaders(req: Request, methods: string) {
  const requestOrigin = normalizeOrigin(req.headers.get("origin") || "");
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins()]);
  const allowOrigin = requestOrigin && (allowedOrigins.has(requestOrigin) || isAllowedNetlifyPreview(requestOrigin))
    ? requestOrigin
    : DEFAULT_ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Pragma, Cache-Control, X-Requested-With",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
