import type { Config } from "@netlify/functions";
import { neonConfig, Pool, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

interface TenderNorRequestBody {
  vessel_mmsi?: unknown;
  port_id?: unknown;
  distance_nm?: unknown;
  timestamp?: unknown;
}

interface VoyageRow {
  id: string;
}

interface CharterPartyRow {
  id: string;
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
  return Response.json({ success: false, error: message }, { status });
}

function normalizeMmsi(value: unknown) {
  const mmsi = String(value ?? "").trim();
  return /^\d{9}$/.test(mmsi) ? mmsi : "";
}

function normalizePortId(value: unknown) {
  const portId = String(value ?? "").trim();
  return portId.length > 0 && portId.length <= 120 ? portId : "";
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

async function tenderNor(
  client: PoolClient,
  vesselMmsi: string,
  portId: string,
  distanceNm: number,
  arrivalTimestamp: Date,
) {
  const voyageResult = await client.query<VoyageRow>(
    `SELECT id
       FROM voyages
      WHERE vessel_mmsi = $1
        AND destination_port_id = $2
        AND is_active = true
      ORDER BY updated_at DESC
      LIMIT 1
      FOR UPDATE`,
    [vesselMmsi, portId],
  );

  const voyage = voyageResult.rows[0];
  if (!voyage) return null;

  await client.query(
    `UPDATE voyages
        SET status = 'ARRIVED',
            is_active = false,
            arrived_at = $2,
            nor_distance_nm = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [voyage.id, arrivalTimestamp, distanceNm],
  );

  const charterPartyResult = await client.query<CharterPartyRow>(
    `INSERT INTO charter_parties (
       voyage_id,
       arrival_timestamp,
       nor_distance_nm,
       updated_at
     )
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (voyage_id) DO UPDATE
       SET arrival_timestamp = EXCLUDED.arrival_timestamp,
           nor_distance_nm = EXCLUDED.nor_distance_nm,
           updated_at = NOW()
     RETURNING id`,
    [voyage.id, arrivalTimestamp, distanceNm],
  );

  return {
    voyageId: voyage.id,
    charterPartyId: charterPartyResult.rows[0]?.id ?? null,
  };
}

export default async function tenderNorHandler(request: Request) {
  if (request.method !== "POST") {
    return errorResponse(405, "Método no permitido.");
  }

  let body: TenderNorRequestBody;
  try {
    body = await request.json() as TenderNorRequestBody;
  } catch {
    return errorResponse(400, "El body debe ser un JSON válido.");
  }

  const vesselMmsi = normalizeMmsi(body.vessel_mmsi);
  const portId = normalizePortId(body.port_id);
  const distanceNm = Number(body.distance_nm);
  const arrivalTimestamp = normalizeTimestamp(body.timestamp);

  if (!vesselMmsi) {
    return errorResponse(400, "vessel_mmsi debe contener exactamente 9 dígitos.");
  }

  if (!portId) {
    return errorResponse(400, "port_id es obligatorio.");
  }

  if (!Number.isFinite(distanceNm) || distanceNm < 0) {
    return errorResponse(400, "distance_nm debe ser un número mayor o igual que cero.");
  }

  if (!arrivalTimestamp) {
    return errorResponse(400, "timestamp debe ser una fecha válida.");
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await tenderNor(client, vesselMmsi, portId, distanceNm, arrivalTimestamp);

    if (!result) {
      await client.query("ROLLBACK");
      return errorResponse(404, "No existe un viaje activo para el MMSI y puerto indicados.");
    }

    await client.query("COMMIT");
    return Response.json({
      success: true,
      status: "ARRIVED",
      arrival_timestamp: arrivalTimestamp.toISOString(),
      ...result,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[tender-nor] Automatic NOR processing failed.", error);
    return errorResponse(500, "No fue posible registrar la llegada automática.");
  } finally {
    client.release();
  }
}

export const config: Config = {
  path: "/api/v1/voyage/tender-nor",
};
