import { getDatabase } from "netlify-database-client";
import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL
  || process.env.NETLIFY_DATABASE_URL
  || process.env.NETLIFY_DB_URL;

if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
  throw new Error("La conexión de Netlify Database no está configurada.");
}

const database = getDatabase({ connectionString });

export const netlifyDb = drizzle({ client: database, schema });
