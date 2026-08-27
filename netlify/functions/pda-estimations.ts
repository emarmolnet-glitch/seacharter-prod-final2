import type { Config } from "@netlify/functions";
import { and, desc, eq } from "drizzle-orm";
import { ensureApplicationSchema } from "../../db/index.js";
import { netlifyDb as db } from "../../db/netlify.js";
import { pdaEstimations } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

const MAX_PAYLOAD_BYTES = 128_000;

const headersFor = (req: Request) => ({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  ...createCorsHeaders(req, "GET, POST, OPTIONS"),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 180) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function readNonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeBreakdown(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) return null;
  const items = value.map((entry) => {
    if (!isRecord(entry)) return null;
    const item = cleanText(entry.item, 160);
    const amount = readNonNegativeNumber(entry.amount);
    if (!item || amount === null) return null;
    return { item, amount };
  });
  return items.every(Boolean) ? items as Array<{ item: string; amount: number }> : null;
}

function serializeEstimation(row: typeof pdaEstimations.$inferSelect) {
  return {
    ...row,
    calculatedAt: row.calculatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default async (req: Request) => {
  const headers = headersFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const calculationKey = cleanText(url.searchParams.get("calculationKey"));
      const estimationId = cleanText(url.searchParams.get("estimationId"));
      const sessionId = cleanText(url.searchParams.get("sessionId"));
      const filters: Array<ReturnType<typeof eq>> = [];
      if (calculationKey) filters.push(eq(pdaEstimations.calculationKey, calculationKey));
      if (estimationId) filters.push(eq(pdaEstimations.estimationId, estimationId));
      if (sessionId) filters.push(eq(pdaEstimations.sessionId, sessionId));

      await ensureApplicationSchema();
      const [row] = await db
        .select()
        .from(pdaEstimations)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(pdaEstimations.updatedAt))
        .limit(1);

      return Response.json({
        success: true,
        estimation: row ? serializeEstimation(row) : null,
      }, { headers });
    } catch (error) {
      console.error("[pda-estimations] Failed to read PDA estimation.", error);
      return Response.json({ success: false, error: "PDA estimation is unavailable" }, { status: 500, headers });
    }
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
      return Response.json({ success: false, error: "PDA estimation payload is too large" }, { status: 413, headers });
    }
    const body = JSON.parse(rawBody || "null");
    if (!isRecord(body)) {
      return Response.json({ success: false, error: "Invalid PDA estimation payload" }, { status: 400, headers });
    }

    const calculationKey = cleanText(body.calculationKey);
    const pdaTotal = readNonNegativeNumber(body.pdaTotal);
    const pdaPol = readNonNegativeNumber(body.pdaPol);
    const pdaPod = readNonNegativeNumber(body.pdaPod);
    const polBreakdown = normalizeBreakdown(body.polBreakdown);
    const podBreakdown = normalizeBreakdown(body.podBreakdown);
    const calculationContext = isRecord(body.calculationContext) ? body.calculationContext : null;

    if (!calculationKey || pdaTotal === null || pdaPol === null || pdaPod === null
      || !polBreakdown || !podBreakdown || !calculationContext) {
      return Response.json({ success: false, error: "Incomplete PDA estimation payload" }, { status: 400, headers });
    }
    if (Math.abs(pdaTotal - (pdaPol + pdaPod)) > 1) {
      return Response.json({ success: false, error: "PDA total must equal POL plus POD" }, { status: 400, headers });
    }
    const polBreakdownTotal = polBreakdown.reduce((sum, item) => sum + item.amount, 0);
    const podBreakdownTotal = podBreakdown.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(polBreakdownTotal - pdaPol) > 1 || Math.abs(podBreakdownTotal - pdaPod) > 1) {
      return Response.json({ success: false, error: "PDA breakdown totals are inconsistent" }, { status: 400, headers });
    }

    const requestedCalculatedAt = new Date(String(body.calculatedAt || ""));
    const calculatedAt = Number.isNaN(requestedCalculatedAt.getTime()) ? new Date() : requestedCalculatedAt;
    const now = new Date();
    const values = {
      calculationKey,
      estimationId: cleanText(body.estimationId) || null,
      sessionId: cleanText(body.sessionId) || null,
      pol: cleanText(body.pol) || null,
      pod: cleanText(body.pod) || null,
      pdaTotal,
      pdaPol,
      pdaPod,
      polBreakdown,
      podBreakdown,
      calculationMode: cleanText(body.calculationMode, 80) || "parametric-estimator",
      currency: cleanText(body.currency, 3).toUpperCase() || "USD",
      vesselName: cleanText(body.vesselName) || null,
      imoNumber: cleanText(body.imoNumber, 16) || null,
      cargoQuantity: readNonNegativeNumber(body.cargoQuantity),
      calculationContext,
      calculatedAt,
      updatedAt: now,
    };

    await ensureApplicationSchema();
    const [estimation] = await db
      .insert(pdaEstimations)
      .values(values)
      .onConflictDoUpdate({
        target: pdaEstimations.calculationKey,
        set: values,
      })
      .returning();

    return Response.json({
      success: true,
      estimation: serializeEstimation(estimation),
    }, { status: 201, headers });
  } catch (error) {
    console.error("[pda-estimations] Failed to persist PDA estimation.", error);
    return Response.json({ success: false, error: "PDA estimation persistence failed" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/pda-estimations",
};
