declare const Netlify: {
  env?: {
    get: (key: string) => string | undefined;
    has?: (key: string) => boolean;
  };
} | undefined;

const DATABASE_CONNECTION_ENV_KEYS = [
  "DATABASE_URL",
  "NETLIFY_DATABASE_URL",
  "NETLIFY_DB_URL",
  "NEON_DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
] as const;

export function getDatabaseConnectionString() {
  for (const key of DATABASE_CONNECTION_ENV_KEYS) {
    let connectionString: string | undefined;
    try {
      if (typeof Netlify !== "undefined" && typeof Netlify.env?.get === "function") {
        connectionString = Netlify.env.get(key)?.trim();
      }
    } catch {}

    if (!connectionString) {
      connectionString = (typeof process !== "undefined" && process.env?.[key])?.trim();
    }

    if (connectionString && connectionString !== "tu_valor_real_de_la_variable") {
      return connectionString;
    }
  }

  return null;
}

export function requireDatabaseConnectionString() {
  const connectionString = getDatabaseConnectionString();
  if (!connectionString) {
    throw new Error("La conexión de Netlify Database no está configurada.");
  }

  return connectionString;
}
