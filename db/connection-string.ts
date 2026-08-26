const DATABASE_CONNECTION_ENV_KEYS = [
  "DATABASE_URL",
  "NETLIFY_DATABASE_URL",
  "NETLIFY_DB_URL",
] as const;

export function getDatabaseConnectionString() {
  for (const key of DATABASE_CONNECTION_ENV_KEYS) {
    const connectionString = process.env[key]?.trim();
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
