import type { Config } from "@netlify/functions";
import { db, ensureApplicationSchema } from "../../db/index.js";
import { pdaVesselConfirmations } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

const headersFor = (req: Request) => ({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  ...createCorsHeaders(req, "POST, OPTIONS"),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 180) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export default async (req: Request) => {
  const headers = headersFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.previousVessel) || !isRecord(body.actualVessel)
      || !isRecord(body.operationalValidation) || !isRecord(body.financialBreakdown)) {
      return Response.json({ success: false, error: "Invalid confirmation payload" }, { status: 400, headers });
    }

    const vesselName = cleanText(body.vesselName || body.actualVessel.vessel_name || body.actualVessel.vesselName);
    if (!vesselName) {
      return Response.json({ success: false, error: "vesselName is required" }, { status: 400, headers });
    }

    await ensureApplicationSchema();
    const [confirmation] = await db.insert(pdaVesselConfirmations).values({
      estimationId: cleanText(body.estimationId, 120) || null,
      vesselName,
      imoNumber: cleanText(body.imoNumber || body.actualVessel.imo || body.actualVessel.imo_number, 16) || null,
      pol: cleanText(body.pol) || null,
      pod: cleanText(body.pod) || null,
      previousVessel: body.previousVessel,
      actualVessel: body.actualVessel,
      operationalValidation: body.operationalValidation,
      financialBreakdown: body.financialBreakdown,
    }).returning();

    return Response.json({ success: true, confirmation }, { status: 201, headers });
  } catch (error) {
    console.error("[pda-vessel-confirmation] Failed to persist confirmation.", error);
    return Response.json({ success: false, error: "Confirmation persistence failed" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/pda-vessel-confirmation",
};
