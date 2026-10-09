import type { Config } from "@netlify/functions";
import { ensureApplicationSchema, getPool } from "../../db/index.js";

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function cleanText(value: unknown, maxLength = 100): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanNumber(value: unknown, fallback = 0): number {
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.,-]/g, "").trim();
    if (cleaned.includes(",") && cleaned.includes(".")) {
      if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
        const parsed = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      const parsed = parseFloat(cleaned.replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (cleaned.includes(",")) {
      const parsed = parseFloat(cleaned.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  // GET: Consultar operaciones multimodal registradas en Ledger SaaS (soporta filtro por referencia o id)
  if (req.method === "GET") {
    try {
      await ensureApplicationSchema();
      const pool = getPool();
      const url = new URL(req.url);
      const refParam = cleanText(url.searchParams.get("ref") || url.searchParams.get("referencia") || "");
      const idParam = cleanText(url.searchParams.get("id") || "");

      let result;
      if (idParam) {
        result = await pool.query(
          `SELECT id, referencia, modalidad, coste_api, venta_agencia, fee_plataforma, estado, metadata, created_at, updated_at
           FROM multimodal_operations
           WHERE id::text = $1
           LIMIT 1`,
          [idParam]
        );
      } else if (refParam) {
        result = await pool.query(
          `SELECT id, referencia, modalidad, coste_api, venta_agencia, fee_plataforma, estado, metadata, created_at, updated_at
           FROM multimodal_operations
           WHERE referencia = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [refParam]
        );
      } else {
        result = await pool.query(
          `SELECT id, referencia, modalidad, coste_api, venta_agencia, fee_plataforma, estado, metadata, created_at, updated_at
           FROM multimodal_operations
           ORDER BY created_at DESC
           LIMIT 100`
        );
      }

      return Response.json(
        {
          success: true,
          count: result.rowCount || result.rows.length,
          data: result.rows,
        },
        { headers: jsonHeaders }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return Response.json(
        {
          success: false,
          error: "No se pudieron recuperar las operaciones del Ledger SaaS",
          details: errorMessage,
          data: [],
        },
        { status: 500, headers: jsonHeaders }
      );
    }
  }

  // PATCH / PUT: Actualizar estado de operación multimodal (ej. Confirmación de Booking / Cobro)
  if (req.method === "PATCH" || req.method === "PUT") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const referencia = cleanText(body.referencia || body.reference, 100);
    const id = cleanText(body.id, 100);
    const estado = cleanText(body.estado || body.status, 50);

    if (!estado || (!referencia && !id)) {
      return Response.json(
        { success: false, error: "Se requiere estado y referencia o id" },
        { status: 400, headers: jsonHeaders }
      );
    }

    try {
      await ensureApplicationSchema();
      const pool = getPool();
      const updateResult = await pool.query(
        `UPDATE multimodal_operations
         SET estado = $1, updated_at = NOW()
         WHERE ($2::text IS NOT NULL AND referencia = $2) OR ($3::text IS NOT NULL AND id::text = $3)
         RETURNING id, referencia, modalidad, coste_api, venta_agencia, fee_plataforma, estado, metadata, created_at, updated_at`,
        [estado, referencia || null, id || null]
      );

      return Response.json(
        {
          success: true,
          updated: (updateResult.rowCount || 0) > 0,
          data: updateResult.rows[0] || null,
        },
        { headers: jsonHeaders }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return Response.json(
        { success: false, error: "Error actualizando estado en Ledger SaaS", details: errorMessage },
        { status: 500, headers: jsonHeaders }
      );
    }
  }

  // POST: Sincronizar cotización multimodal con Ledger SaaS
  if (req.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const referencia = cleanText(
      body.referencia || body.reference,
      100
    ) || `RDM-MM-${Math.floor(1000 + Math.random() * 9000)}`;

    const modalidad = cleanText(
      body.modalidad || body.mode || body.tab,
      100
    ) || "FCL Marítimo";

    const costeApi = cleanNumber(body.coste_api ?? body.costeApi ?? body.baseCost, 0);
    const ventaAgencia = cleanNumber(body.venta_agencia ?? body.ventaAgencia ?? body.quickQuoteTotal, 0);
    const feePlataforma = cleanNumber(body.fee_plataforma ?? body.feePlataforma, 50.0);
    const estado = cleanText(body.estado || body.status, 50) || "Cotizado";
    const metadata = (body.metadata && typeof body.metadata === "object") ? body.metadata : {};

    const record = {
      referencia,
      modalidad,
      coste_api: Number(costeApi.toFixed(2)),
      venta_agencia: Number(ventaAgencia.toFixed(2)),
      fee_plataforma: Number(feePlataforma.toFixed(2)),
      estado,
      metadata,
      synced_at: new Date().toISOString(),
    };

    let persisted = false;
    let insertedRow = null;

    try {
      await ensureApplicationSchema();
      const pool = getPool();
      const insertResult = await pool.query(
        `INSERT INTO multimodal_operations (
          referencia,
          modalidad,
          coste_api,
          venta_agencia,
          fee_plataforma,
          estado,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, referencia, modalidad, coste_api, venta_agencia, fee_plataforma, estado, metadata, created_at, updated_at`,
        [
          referencia,
          modalidad,
          record.coste_api,
          record.venta_agencia,
          record.fee_plataforma,
          estado,
          JSON.stringify(metadata),
        ]
      );

      if (insertResult.rows && insertResult.rows.length > 0) {
        persisted = true;
        insertedRow = insertResult.rows[0];
      }
    } catch (dbErr: unknown) {
      console.warn("[Multimodal Sync] Advertencia de persistencia DB:", dbErr);
    }

    return Response.json(
      {
        success: true,
        message: "Cotización sincronizada correctamente con Ledger SaaS",
        persisted,
        data: insertedRow || record,
        timestamp: new Date().toISOString(),
      },
      { status: 201, headers: jsonHeaders }
    );
  }

  return Response.json(
    { success: false, error: "Método no permitido" },
    { status: 405, headers: jsonHeaders }
  );
};

export const config: Config = {
  path: ["/api/multimodal/sync", "/api/multimodal-sync", "/.netlify/functions/multimodal-sync"],
};
