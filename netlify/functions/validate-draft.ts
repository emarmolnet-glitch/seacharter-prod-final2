import type { Config } from "@netlify/functions";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { validatePortDraft } from "./_shared/draft-validation.js";

neonConfig.webSocketConstructor = ws;

interface ValidateDraftRequestBody {
  portIndexNo?: unknown;
  vesselDraft?: unknown;
}

interface WpiPortRow {
  port_name: string;
  cargodepth: string | null;
}

let pool: Pool | null = null;

function getPool() {
  if (pool) return pool;

  const connectionString = Netlify.env.get("DATABASE_URL")
    ?? Netlify.env.get("NETLIFY_DATABASE_URL")
    ?? Netlify.env.get("NETLIFY_DB_URL");

  if (!connectionString) {
    throw new Error("Database connection is not configured.");
  }

  pool = new Pool({ connectionString });
  return pool;
}

function errorResponse(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export default async function validateDraftHandler(request: Request) {
  if (request.method !== "POST") {
    return errorResponse(405, "Método no permitido.");
  }

  let body: ValidateDraftRequestBody;
  try {
    body = await request.json() as ValidateDraftRequestBody;
  } catch {
    return errorResponse(400, "El body debe ser un JSON válido.");
  }

  const portIndexNo = Number(body.portIndexNo);
  const vesselDraft = Number(body.vesselDraft);

  if (!Number.isInteger(portIndexNo) || portIndexNo <= 0) {
    return errorResponse(400, "portIndexNo debe ser un entero positivo.");
  }

  if (!Number.isFinite(vesselDraft) || vesselDraft < 0) {
    return errorResponse(400, "vesselDraft debe ser un número mayor o igual que cero.");
  }

  try {
    const result = await getPool().query<WpiPortRow>(
      `SELECT port_name, cargodepth
       FROM wpi
       WHERE index_no = $1
       LIMIT 1`,
      [portIndexNo],
    );

    const port = result.rows[0];
    if (!port) {
      return errorResponse(404, "No se encontró el puerto solicitado en el World Port Index.");
    }

    return Response.json(validatePortDraft({
      portName: port.port_name,
      portDepthCode: port.cargodepth,
      vesselDraft,
    }));
  } catch (error) {
    console.error("[validate-draft] Draft validation failed.", error);
    return errorResponse(500, "No fue posible validar el calado en este momento.");
  }
}

export const config: Config = {
  path: "/api/v1/ports/validate-draft",
};
