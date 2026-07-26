import type { Config } from "@netlify/functions";
import { ensureApplicationSchema, getPool } from "../../db/index.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With, X-Api-Key",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
};

export function extractVessels(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];

  const source = payload as Record<string, unknown>;

  if (Array.isArray(source.vessels)) return source.vessels as Record<string, unknown>[];
  if (Array.isArray(source.fleet)) return source.fleet as Record<string, unknown>[];
  if (Array.isArray(source.buques)) return source.buques as Record<string, unknown>[];
  if (Array.isArray(source.selectedVessels)) return source.selectedVessels as Record<string, unknown>[];
  if (Array.isArray(source.items)) return source.items as Record<string, unknown>[];

  if (source.data && typeof source.data === "object") {
    const dataObj = source.data as Record<string, unknown>;
    if (Array.isArray(dataObj)) return dataObj as Record<string, unknown>[];
    if (Array.isArray(dataObj.vessels)) return dataObj.vessels as Record<string, unknown>[];
    if (Array.isArray(dataObj.fleet)) return dataObj.fleet as Record<string, unknown>[];
    if (Array.isArray(dataObj.buques)) return dataObj.buques as Record<string, unknown>[];
  }

  if (source.fleet && typeof source.fleet === "object" && !Array.isArray(source.fleet)) {
    const fleetObj = source.fleet as Record<string, unknown>;
    if (Array.isArray(fleetObj.vessels)) return fleetObj.vessels as Record<string, unknown>[];
    if (Array.isArray(fleetObj.buques)) return fleetObj.buques as Record<string, unknown>[];
    if (Array.isArray(fleetObj.items)) return fleetObj.items as Record<string, unknown>[];
  }

  return [];
}

export async function insertPipelineInboxBatches(
  syncId: string,
  vessels: Record<string, unknown>[],
  sourceName = "CORE_PRO",
) {
  await ensureApplicationSchema();

  if (vessels.length === 0) return 0;

  const client = await getPool().connect();
  let totalInserted = 0;

  try {
    await client.query("BEGIN");

    const BATCH_SIZE = 500;
    for (let i = 0; i < vessels.length; i += BATCH_SIZE) {
      const chunk = vessels.slice(i, i + BATCH_SIZE);
      const valueTuples: string[] = [];
      const queryParams: unknown[] = [];
      let paramIdx = 1;

      for (const item of chunk) {
        const itemObj = (item && typeof item === "object") ? item : {};
        const imoRaw = itemObj.imo ?? itemObj.imo_number ?? itemObj.imoNumber ?? itemObj.IMO ?? itemObj.numero_imo ?? itemObj.IMONumber;
        const imoDigits = String(imoRaw ?? "").replace(/\D/g, "");
        const imoNumber = imoDigits.length === 7 ? imoDigits : (imoRaw ? String(imoRaw).trim() : null);

        const vesselNameRaw = itemObj.vessel_name ?? itemObj.vesselName ?? itemObj.nombre ?? itemObj.name ?? itemObj.ShipName ?? itemObj.ship;
        const vesselName = vesselNameRaw ? String(vesselNameRaw).trim() : null;

        valueTuples.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}::jsonb)`);
        queryParams.push(
          syncId,
          imoNumber,
          vesselName,
          sourceName,
          "PENDING",
          JSON.stringify(itemObj),
        );
        paramIdx += 6;
      }

      const sql = `
        INSERT INTO pipeline_inbox (sync_id, imo_number, vessel_name, source, status, payload)
        VALUES ${valueTuples.join(", ")}
      `;

      await client.query(sql, queryParams);
      totalInserted += chunk.length;
    }

    await client.query("COMMIT");
    return totalInserted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { success: false, error: "Método no permitido. Utilice POST." },
      { status: 405, headers: jsonHeaders },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Cuerpo de solicitud JSON inválido o malformado." },
      { status: 400, headers: jsonHeaders },
    );
  }

  if (!body || (typeof body !== "object" && !Array.isArray(body))) {
    return Response.json(
      { success: false, error: "Payload JSON no válido." },
      { status: 400, headers: jsonHeaders },
    );
  }

  const vessels = extractVessels(body);
  if (vessels.length === 0) {
    return Response.json(
      { success: false, error: "El payload recibido no contiene registros de buques procesables." },
      { status: 400, headers: jsonHeaders },
    );
  }

  const bodyObj = (typeof body === "object" && body !== null) ? body as Record<string, unknown> : {};
  const syncId = String(bodyObj.syncId || bodyObj.sync_id || crypto.randomUUID()).trim();
  const sourceName = String(bodyObj.source || "CORE_PRO").trim();

  try {
    const insertedCount = await insertPipelineInboxBatches(syncId, vessels, sourceName);

    return Response.json(
      {
        success: true,
        message: `Se han insertado ${insertedCount} registros en pipeline_inbox correctamente.`,
        syncId,
        receivedCount: vessels.length,
        insertedCount,
        processedCount: insertedCount,
      },
      { status: 200, headers: jsonHeaders },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido en transacción Neon PostgreSQL";
    console.error("[pipeline-inbox] Error durante la inserción por lotes en pipeline_inbox:", error);

    return Response.json(
      {
        success: false,
        error: "Error interno al persistir en pipeline_inbox.",
        message: errorMessage,
        syncId,
      },
      { status: 500, headers: jsonHeaders },
    );
  }
}

export const config: Config = {
  path: [
    "/api/pipeline-inbox",
    "/api/databridge/pipeline-inbox",
    "/api/databridge-pipeline-inbox",
    "/.netlify/functions/pipeline-inbox",
  ],
};
