import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";
import { createCorsHeaders } from "./_shared/cors.js";

const DEFAULT_STATE_KEY = "core_pro_active_session";
const MAX_PAYLOAD_BYTES = 512_000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Pragma, Cache-Control, X-Requested-With, Accept",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const baseHeaders: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  ...corsHeaders,
};

function getResponseHeaders(req?: Request): Record<string, string> {
  const dynamicCors = req ? createCorsHeaders(req, "GET, POST, PUT, DELETE, OPTIONS") : {};
  return {
    ...baseHeaders,
    ...dynamicCors,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Pragma, Cache-Control, X-Requested-With, Accept",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeReference(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function extractReference(body: Record<string, unknown>): string {
  const directCandidate =
    body.value ||
    body.currentSessionRef ||
    body.current_session_ref ||
    body.session_ref ||
    body.sessionRef ||
    body.reference ||
    body.contractRef ||
    body.contract_ref ||
    body.ref;

  if (typeof directCandidate === "string" && directCandidate.trim()) {
    return normalizeReference(directCandidate);
  }

  if (isRecord(body.value)) {
    return extractReference(body.value);
  }
  if (isRecord(body.payload)) {
    return extractReference(body.payload);
  }
  if (isRecord(body.sessionPayload)) {
    return extractReference(body.sessionPayload);
  }

  return "";
}

function extractImoFromValue(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string" && /^\d{7}$/.test(val.trim())) {
    return val.trim();
  }
  if (isRecord(val)) {
    const candidate = String(
      val.imo ||
      val.imo_number ||
      val.imoNumber ||
      val.selected_imo ||
      val.pending_imo ||
      val.core_pro_pending_imo ||
      val.value ||
      ""
    ).trim();
    if (/^\d{7}$/.test(candidate)) return candidate;
  } else if (typeof val === "string" && (val.trim().startsWith("{") || val.trim().startsWith("["))) {
    try {
      const decoded = JSON.parse(val);
      return extractImoFromValue(decoded);
    } catch (_) {}
  }
  return "";
}

async function ensureAppStateTable() {
  const pool = getPool();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key VARCHAR(255) PRIMARY KEY,
        value VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE app_state
        ADD COLUMN IF NOT EXISTS key VARCHAR(255);

      ALTER TABLE app_state
        ADD COLUMN IF NOT EXISTS value VARCHAR(255);

      ALTER TABLE app_state
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE app_state
        ADD COLUMN IF NOT EXISTS session_ref VARCHAR(255);

      ALTER TABLE app_state
        ADD COLUMN IF NOT EXISTS current_session_ref VARCHAR(255);

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'app_state' AND column_name = 'value' AND (data_type = 'jsonb' OR character_maximum_length < 2000)
        ) THEN
          ALTER TABLE app_state ALTER COLUMN value TYPE TEXT USING value::text;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END $$;
    `);
  } catch (error: any) {
    console.error("[app-state] ensureAppStateTable error:", error);
    throw error;
  }
}

export default async (req: Request) => {
  const headers = getResponseHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(req.url);

  if (req.method === "DELETE") {
    try {
      await ensureAppStateTable();
      const pool = getPool();
      let deleteKey = (url.searchParams.get("key") || url.searchParams.get("id") || "").trim();
      if (!deleteKey) {
        try {
          const bodyText = await req.text();
          if (bodyText.trim()) {
            const body = JSON.parse(bodyText);
            deleteKey = (body?.key || body?.id || "").trim();
          }
        } catch (_) {}
      }
      if (!deleteKey) {
        deleteKey = DEFAULT_STATE_KEY;
      }

      const isPendingImoKey = deleteKey === "core_pro_pending_imo" || deleteKey === "selected_imo" || deleteKey === "pending_imo";

      if (isPendingImoKey) {
        await pool.query(
          `DELETE FROM app_state WHERE key = $1 OR key IN ('core_pro_pending_imo', 'selected_imo', 'pending_imo')`,
          [deleteKey]
        );
      } else {
        await pool.query(
          `DELETE FROM app_state WHERE key = $1`,
          [deleteKey]
        );
      }

      try {
        await pool.query(
          `DELETE FROM "AppConfig" WHERE "key" = $1`,
          [deleteKey]
        );
      } catch (_) {}

      return Response.json({
        success: true,
        message: `Deleted key ${deleteKey}`,
        key: deleteKey,
      }, { headers });
    } catch (error: any) {
      console.error("[app-state] Failed to delete app state:", error?.stack || error?.message || error);
      return new Response(JSON.stringify({ success: false, error: error?.message || "Failed to delete app state" }), {
        status: 500,
        headers,
      });
    }
  }

  if (req.method === "GET") {
    try {
      await ensureAppStateTable();
      const pool = getPool();
      const requestedKey = (url.searchParams.get("key") || url.searchParams.get("id") || "").trim();
      const isCustomKey = Boolean(requestedKey && requestedKey !== DEFAULT_STATE_KEY && requestedKey !== "current_session" && requestedKey !== "core_pro_active_session");

      if (isCustomKey) {
        const isPendingImoKey = requestedKey === "core_pro_pending_imo" || requestedKey === "selected_imo" || requestedKey === "pending_imo";

        const customResult = isPendingImoKey
          ? await pool.query(
              `SELECT key, value, session_ref, current_session_ref, updated_at
               FROM app_state
               WHERE key = $1 OR key IN ('core_pro_pending_imo', 'selected_imo', 'pending_imo')
               ORDER BY CASE WHEN key = $1 THEN 0 ELSE 1 END, updated_at DESC
               LIMIT 1`,
              [requestedKey]
            )
          : await pool.query(
              `SELECT key, value, session_ref, current_session_ref, updated_at
               FROM app_state
               WHERE key = $1
               LIMIT 1`,
              [requestedKey]
            );

        const customRow = customResult.rows[0];
        if (customRow) {
          const parsedVal = customRow.value;
          const parsedImo = extractImoFromValue(parsedVal);
          let targetSessionId = customRow.session_ref || customRow.current_session_ref || "";

          if (isRecord(parsedVal)) {
            targetSessionId = targetSessionId || String(parsedVal.reference || parsedVal.target_session_id || parsedVal.targetSessionId || "").trim();
          } else if (typeof parsedVal === "string" && parsedVal.trim().startsWith("{")) {
            try {
              const decoded = JSON.parse(parsedVal);
              if (isRecord(decoded)) {
                targetSessionId = targetSessionId || String(decoded.reference || decoded.target_session_id || decoded.targetSessionId || "").trim();
              }
            } catch (_) {}
          }

          const resolvedImo = parsedImo || (typeof customRow.value === "string" && /^\d{7}$/.test(customRow.value.trim()) ? customRow.value.trim() : "");

          return Response.json({
            success: true,
            key: customRow.key || requestedKey,
            id: customRow.key || requestedKey,
            value: customRow.value,
            imo: resolvedImo,
            selected_imo: resolvedImo,
            pending_imo: resolvedImo,
            core_pro_pending_imo: resolvedImo,
            target_session_id: targetSessionId,
            reference: targetSessionId,
            session_ref: targetSessionId,
            currentSessionRef: targetSessionId,
            updated_at: customRow.updated_at ? new Date(customRow.updated_at).toISOString() : null,
            updatedAt: customRow.updated_at ? new Date(customRow.updated_at).toISOString() : null,
          }, { headers });
        }

        return Response.json({
          success: true,
          key: requestedKey,
          id: requestedKey,
          value: "",
          imo: "",
          selected_imo: "",
          pending_imo: "",
          core_pro_pending_imo: "",
          target_session_id: "",
          reference: "",
          session_ref: "",
          currentSessionRef: "",
          updated_at: null,
          updatedAt: null,
        }, { headers });
      }

      const result = await pool.query(
        `SELECT key, value, session_ref, current_session_ref, updated_at
         FROM app_state
         WHERE key = $1 OR key = 'core_pro_active_session' OR key = 'current_session'
         ORDER BY CASE WHEN key = $1 THEN 0 WHEN key = 'core_pro_active_session' THEN 1 ELSE 2 END, updated_at DESC
         LIMIT 1`,
        [requestedKey || DEFAULT_STATE_KEY]
      );

      const row = result.rows[0];
      if (row) {
        let parsedVal = row.value;
        if (isRecord(parsedVal)) {
          parsedVal = extractReference(parsedVal) || row.value;
        }
        const resolvedRef = normalizeReference(parsedVal || row.session_ref || row.current_session_ref);
        const resolvedKey = row.key || requestedKey || DEFAULT_STATE_KEY;
        return Response.json({
          success: true,
          key: resolvedKey,
          id: resolvedKey,
          value: resolvedRef,
          session_ref: resolvedRef,
          currentSessionRef: resolvedRef,
          reference: resolvedRef,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
        }, { headers });
      }

      // Fallback: check AppConfig if key matches default
      try {
        const configResult = await pool.query(
          `SELECT "value", "updated_at" FROM "AppConfig" WHERE "key" = $1 OR "key" = $2 LIMIT 1`,
          ["current_session_ref", "active_core_pro_session"]
        );
        const configRow = configResult.rows[0];
        if (configRow?.value) {
          let resolvedRef = "";
          try {
            const parsed = JSON.parse(configRow.value);
            resolvedRef = normalizeReference(parsed?.reference || parsed);
          } catch {
            resolvedRef = normalizeReference(configRow.value);
          }

          if (resolvedRef) {
            return Response.json({
              success: true,
              key: requestedKey || DEFAULT_STATE_KEY,
              id: requestedKey || DEFAULT_STATE_KEY,
              value: resolvedRef,
              session_ref: resolvedRef,
              currentSessionRef: resolvedRef,
              reference: resolvedRef,
              updated_at: configRow.updated_at ? new Date(configRow.updated_at).toISOString() : null,
              updatedAt: configRow.updated_at ? new Date(configRow.updated_at).toISOString() : null,
            }, { headers });
          }
        }
      } catch (_) {}

      return Response.json({
        success: true,
        key: requestedKey || DEFAULT_STATE_KEY,
        id: requestedKey || DEFAULT_STATE_KEY,
        value: "",
        session_ref: "",
        currentSessionRef: "",
        reference: "",
        updated_at: null,
        updatedAt: null,
      }, { headers });
    } catch (error: any) {
      console.error("[app-state] Failed to retrieve app state:", error?.stack || error?.message || error);
      return new Response(JSON.stringify({ success: false, error: error?.message || "Failed to retrieve app state" }), {
        status: 500,
        headers,
      });
    }
  }

  if (req.method !== "POST" && req.method !== "PUT") {
    return Response.json({
      success: false,
      error: "Method not allowed",
    }, { status: 405, headers });
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
      return Response.json({
        success: false,
        error: "Payload too large",
      }, { status: 413, headers });
    }

    let parsedBody: unknown = {};
    if (rawBody.trim()) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (jsonErr: any) {
        return Response.json({
          success: false,
          error: `Invalid JSON body: ${jsonErr?.message || "parse error"}`,
        }, { status: 400, headers });
      }
    }

    if (!isRecord(parsedBody)) {
      return Response.json({
        success: false,
        error: "Request body must be an object",
      }, { status: 400, headers });
    }

    const explicitKey = (parsedBody.key || parsedBody.id || "").toString().trim();
    const imoInBody = extractImoFromValue(parsedBody);
    const customKey = explicitKey || (imoInBody ? "core_pro_pending_imo" : "");
    const isCustomKey = Boolean(customKey && customKey !== "core_pro_active_session" && customKey !== "current_session");

    await ensureAppStateTable();
    const pool = getPool();

    if (isCustomKey) {
      const customValue = typeof parsedBody.value !== "undefined"
        ? (typeof parsedBody.value === "object" ? JSON.stringify(parsedBody.value) : String(parsedBody.value))
        : (imoInBody || JSON.stringify(parsedBody));

      const sessionRef = extractReference(parsedBody);

      const customResult = await pool.query(
        `INSERT INTO app_state (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = NOW()
         RETURNING key, value, updated_at`,
        [customKey, customValue]
      );
      const customPersisted = customResult.rows[0];

      if (sessionRef) {
        try {
          await pool.query(
            `UPDATE app_state
             SET session_ref = $2, current_session_ref = $2
             WHERE key = $1`,
            [customKey, sessionRef]
          );
        } catch (_) {}
      }

      // If key is selected_imo or core_pro_pending_imo, synchronize counterpart for unified polling
      if (customKey === "selected_imo" || customKey === "core_pro_pending_imo") {
        const mirrorKey = customKey === "selected_imo" ? "core_pro_pending_imo" : "selected_imo";
        try {
          await pool.query(
            `INSERT INTO app_state (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value,
                 updated_at = NOW()`,
            [mirrorKey, customValue]
          );
        } catch (_) {}
      }

      const extractedImo = extractImoFromValue(customValue) || imoInBody;

      return Response.json({
        success: true,
        key: customPersisted?.key || customKey,
        id: customPersisted?.key || customKey,
        value: customPersisted?.value || customValue,
        imo: extractedImo,
        selected_imo: extractedImo,
        pending_imo: extractedImo,
        core_pro_pending_imo: extractedImo,
        reference: sessionRef,
        session_ref: sessionRef,
        currentSessionRef: sessionRef,
        target_session_id: sessionRef,
        updated_at: customPersisted?.updated_at ? new Date(customPersisted.updated_at).toISOString() : new Date().toISOString(),
      }, { headers });
    }

    const currentSessionRef = extractReference(parsedBody);

    const result = await pool.query(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ('core_pro_active_session', $1, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()
       RETURNING key, value, updated_at`,
      [currentSessionRef || ""]
    );

    const persisted = result.rows[0];

    // Mirror to appConfig for legacy readers if table exists
    if (currentSessionRef) {
      try {
        await pool.query(
          `INSERT INTO "AppConfig" ("key", "value", "updated_at")
           VALUES ($1, $2, NOW())
           ON CONFLICT ("key") DO UPDATE
           SET "value" = EXCLUDED."value", "updated_at" = NOW()`,
          ["current_session_ref", currentSessionRef]
        );

        const activeCoreSessionJson = JSON.stringify({
          reference: currentSessionRef,
          timestamp: Date.now(),
        });

        await pool.query(
          `INSERT INTO "AppConfig" ("key", "value", "updated_at")
           VALUES ($1, $2, NOW())
           ON CONFLICT ("key") DO UPDATE
           SET "value" = EXCLUDED."value", "updated_at" = NOW()`,
          ["active_core_pro_session", activeCoreSessionJson]
        );
      } catch (mirrorError: any) {
        console.warn("[app-state] Failed to mirror to AppConfig:", mirrorError?.message);
      }
    }

    let parsedValue = persisted?.value;
    if (isRecord(parsedValue)) {
      parsedValue = extractReference(parsedValue) || persisted?.value;
    }
    const resolvedRef = normalizeReference(parsedValue || currentSessionRef);

    return Response.json({
      success: true,
      key: persisted?.key || "core_pro_active_session",
      id: persisted?.key || "core_pro_active_session",
      value: resolvedRef,
      session_ref: resolvedRef,
      currentSessionRef: resolvedRef,
      reference: resolvedRef,
      updated_at: persisted?.updated_at ? new Date(persisted.updated_at).toISOString() : new Date().toISOString(),
      updatedAt: persisted?.updated_at ? new Date(persisted.updated_at).toISOString() : new Date().toISOString(),
    }, { headers });
  } catch (error: any) {
    console.error("[app-state] Persistence failed:", error?.stack || error?.message || error);
    return new Response(JSON.stringify({ success: false, error: error?.message || "Failed to persist app state" }), {
      status: 500,
      headers,
    });
  }
};

export const config: Config = {
  path: [
    "/api/app-state",
    "/api/app_state",
    "/api/user-sessions",
    "/api/session-state",
    "/api/current-session",
  ],
};
