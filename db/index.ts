import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
  throw new Error("DATABASE_URL no esta configurada para acceder a Neon.");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});

export const db = drizzle({ client: pool, schema });
