import { getDatabase } from "netlify-database-client";
import { drizzle } from "drizzle-orm/netlify-db";
import { requireDatabaseConnectionString } from "./connection-string.js";
import * as schema from "./schema.js";

const connectionString = requireDatabaseConnectionString();
const database = getDatabase({ connectionString });

export const netlifyDb = drizzle({ client: database, schema });
