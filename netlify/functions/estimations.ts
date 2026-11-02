import type { Config } from "@netlify/functions";
import { eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/netlify-db";
import { appConfig, fixtureReferenceAliases } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

const db = drizzle({ schema: { appConfig, fixtureReferenceAliases } });

const ESTIMATIONS_CONFIG_PREFIX = "estimation_";
const DEFAULT_ESTIMATION_KEY = "latest_estimation";
const MAX_ESTIMATION_PAYLOAD_BYTES = 512_000;

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
    ...createCorsHeaders(req, "GET, POST, PUT, OPTIONS"),
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const url = new URL(req.url);
  let estimationId: string;
  try {
    const suffix = url.pathname.replace(/^\/api\/estimations\/?/, '');
    estimationId = decodeURIComponent(suffix || 'current').trim();
    if (/^RDM\/\d{4}-\d{4}$/i.test(estimationId)) estimationId = estimationId.toUpperCase();
  } catch {
    return Response.json({ error: 'Invalid estimation reference' }, { status: 400, headers });
  }
  const originalId = estimationId;
  let legacyId = originalId;
  try {
    const [alias] = await db.select({ reference: fixtureReferenceAliases.reference, legacyId: fixtureReferenceAliases.legacyId }).from(fixtureReferenceAliases)
      .where(or(eq(fixtureReferenceAliases.legacyId, estimationId), eq(fixtureReferenceAliases.reference, estimationId))).limit(1);
    estimationId = alias?.reference || estimationId;
    legacyId = alias?.legacyId || originalId;
  } catch {
    return Response.json({ error: 'Estimation identity is unavailable' }, { status: 503, headers });
  }
  const storageKey = estimationId !== 'current' ? `${ESTIMATIONS_CONFIG_PREFIX}${estimationId}` : DEFAULT_ESTIMATION_KEY;

  if (req.method === "GET") {
    try {
      let [row] = await db
        .select({ value: appConfig.value, updatedAt: appConfig.updatedAt })
        .from(appConfig)
        .where(eq(appConfig.key, storageKey))
        .limit(1);
      if (!row && legacyId !== estimationId) {
        [row] = await db.select({ value: appConfig.value, updatedAt: appConfig.updatedAt }).from(appConfig)
          .where(eq(appConfig.key, `${ESTIMATIONS_CONFIG_PREFIX}${legacyId}`)).limit(1);
      }
      const estimation = row?.value ? JSON.parse(row.value) : null;
      return Response.json({
        success: true,
        estimation,
        persistedAt: row?.updatedAt?.toISOString?.() || null,
      }, { headers });
    } catch (error) {
      console.error("[estimations] Failed to read estimation.", error);
      return Response.json({ success: false, error: "Estimation is unavailable" }, { status: 500, headers });
    }
  }

  if (req.method !== "POST" && req.method !== "PUT") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const body = await req.json().catch(() => null);
    const estimationData = isRecord(body) ? (isRecord(body.estimation) ? body.estimation : body) : null;
    if (!estimationData) {
      return Response.json({ success: false, error: "estimation body must be an object" }, { status: 400, headers });
    }

    const persistedAt = new Date().toISOString();
    const persistedEstimation = {
      ...estimationData,
      id: estimationId,
      persistedAt,
    };

    const value = JSON.stringify(persistedEstimation);
    if (Buffer.byteLength(value, "utf8") > MAX_ESTIMATION_PAYLOAD_BYTES) {
      return Response.json({ success: false, error: "Estimation payload is too large" }, { status: 413, headers });
    }

    await db
      .insert(appConfig)
      .values({ key: storageKey, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value, updatedAt: new Date() },
      });

    return Response.json({
      success: true,
      id: estimationId,
      estimation: persistedEstimation,
      persistedAt,
    }, { headers });
  } catch (error) {
    console.error("[estimations] Failed to persist estimation.", error);
    return Response.json({ success: false, error: "Estimation persistence failed" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/estimations/*",
};
