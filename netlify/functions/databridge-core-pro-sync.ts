import type { Config } from "@netlify/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { sessionSync } from "../../db/schema.js";

const VESSEL_TRACKING_MODULE = "vessel_tracking" as const;
const SHARED_SYNC_USER_ID = "11111111-1111-1111-1111-111111111111";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const requestOrigin = new URL(req.url).origin;

  const isAllowed =
    !origin ||
    origin === requestOrigin ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1");

  return {
    "Access-Control-Allow-Origin": isAllowed
      ? origin || "*"
      : requestOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function createResponse(headers: Record<string, string>) {
  return {
    status(statusCode: number) {
      return {
        json(body: Record<string, unknown>) {
          return Response.json(body, {
            status: statusCode,
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
          });
        },
      };
    },
  };
}

function readSyncId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export default async (req: Request): Promise<Response> => {
  const responseHeaders = {
    ...getCorsHeaders(req),
    ...noCacheHeaders,
  };

  const res = createResponse(responseHeaders);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders,
    });
  }

  try {
    if (req.method === "GET") {
      const searchParams = new URL(req.url).searchParams;

      const syncId = readSyncId(
        searchParams.get("syncId") ?? searchParams.get("sync_id"),
      );

      if (!syncId) {
        return res.status(200).json({
          success: true,
          available: false,
          sync: null,
        });
      }

      const [record] = await db
        .select({
          syncId: sessionSync.syncId,
          lastSyncData: sessionSync.lastSyncData,
          updatedAt: sessionSync.updatedAt,
        })
        .from(sessionSync)
        .where(
          and(
            eq(sessionSync.syncId, syncId),
            eq(sessionSync.moduleType, VESSEL_TRACKING_MODULE),
          ),
        )
        .limit(1);

      if (!record) {
        return res.status(200).json({
          success: true,
          available: false,
          sync: null,
        });
      }

      const storedPayload =
        record.lastSyncData &&
        typeof record.lastSyncData === "object" &&
        !Array.isArray(record.lastSyncData)
          ? (record.lastSyncData as Record<string, unknown>)
          : {};

      const vessels = Array.isArray(storedPayload.vessels)
        ? storedPayload.vessels
        : Array.isArray(record.lastSyncData)
          ? record.lastSyncData
          : [];

      return res.status(200).json({
        success: true,
        available: true,
        sync: {
          sync_id: record.syncId,
          vessels,
          last_sync_data: vessels,
          updated_at: record.updatedAt,
        },
      });
    }

    if (req.method === "POST") {
      const searchParams = new URL(req.url).searchParams;

      const body = await req
        .json()
        .catch(() => null) as Record<string, unknown> | null;

      const syncId = readSyncId(
        searchParams.get("syncId") ??
          searchParams.get("sync_id") ??
          body?.syncId ??
          body?.sync_id,
      );

      if (!syncId) {
        return res.status(400).json({
          success: false,
          available: false,
          sync: null,
          error: "sync_id is required",
        });
      }

      const vessels = Array.isArray(body?.last_sync_data)
        ? body.last_sync_data
        : Array.isArray(body?.vessels)
          ? body.vessels
          : [];

      const updatedAt = new Date();

      const syncPayload = {
        vessels,
        updated_at: updatedAt.toISOString(),
      };

      const [savedSync] = await db
        .insert(sessionSync)
        .values({
          userId: SHARED_SYNC_USER_ID,
          syncId,
          moduleType: VESSEL_TRACKING_MODULE,
          lastSyncData: syncPayload,
          updatedAt,
        })
        .onConflictDoUpdate({
          // El conflicto se resuelve única y exclusivamente por sync_id.
          target: sessionSync.syncId,
          set: {
            userId: SHARED_SYNC_USER_ID,
            moduleType: VESSEL_TRACKING_MODULE,
            lastSyncData: syncPayload,
            updatedAt,
          },
        })
        .returning({
          syncId: sessionSync.syncId,
          lastSyncData: sessionSync.lastSyncData,
          updatedAt: sessionSync.updatedAt,
        });

      return res.status(200).json({
        success: true,
        available: true,
        sync: {
          sync_id: savedSync.syncId,
          vessels,
          last_sync_data: vessels,
          updated_at: savedSync.updatedAt,
        },
      });
    }

    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  } catch (error) {
    console.error("[databridge-core-pro-sync] Database operation failed", error);

    return res.status(500).json({
      success: false,
      available: false,
      sync: null,
      error: "Database operation failed",
    });
  }
};

export const config: Config = {
  path: "/api/databridge-core-pro-sync",
};
