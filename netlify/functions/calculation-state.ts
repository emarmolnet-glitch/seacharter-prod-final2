import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db, ensureApplicationSchema } from "../../db/index.js";
import { appConfig } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

const CALCULATION_STATE_CONFIG_KEY = "latest_calculation_state";
const MAX_CALCULATION_PAYLOAD_BYTES = 256_000;
const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export default async (req: Request) => {
  const headers = {
    ...baseHeaders,
    ...createCorsHeaders(req, "GET, POST, OPTIONS"),
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method === "GET") {
    try {
      await ensureApplicationSchema();
      const [row] = await db
        .select({ value: appConfig.value, updatedAt: appConfig.updatedAt })
        .from(appConfig)
        .where(eq(appConfig.key, CALCULATION_STATE_CONFIG_KEY))
        .limit(1);
      const calculation = row?.value ? JSON.parse(row.value) : null;
      return Response.json({
        success: true,
        calculation,
        persistedAt: row?.updatedAt?.toISOString?.() || null,
      }, { headers });
    } catch (error) {
      console.error("[calculation-state] Failed to read calculation.", error);
      return Response.json({ success: false, error: "Calculation state is unavailable" }, { status: 500, headers });
    }
  }
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.calculation)) {
      return Response.json({ success: false, error: "calculation must be an object" }, { status: 400, headers });
    }

    const persistedAt = new Date().toISOString();
    const persistedCalculation = {
      ...body.calculation,
      persistedAt,
    };
    const value = JSON.stringify(persistedCalculation);
    if (Buffer.byteLength(value, "utf8") > MAX_CALCULATION_PAYLOAD_BYTES) {
      return Response.json({ success: false, error: "Calculation payload is too large" }, { status: 413, headers });
    }

    await ensureApplicationSchema();
    await db
      .insert(appConfig)
      .values({ key: CALCULATION_STATE_CONFIG_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value, updatedAt: new Date() },
      });

    return Response.json({ success: true, persistedAt }, { headers });
  } catch (error) {
    console.error("[calculation-state] Failed to persist calculation.", error);
    return Response.json({ success: false, error: "Calculation persistence failed" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/calculation-state",
};
