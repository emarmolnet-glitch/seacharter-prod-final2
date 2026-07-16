import type { Config } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { aisVessels } from "../../db/schema.js";

const VALIDATED_AUDIT_STATUS = "VALIDATED";
const MAX_AUDIT_VESSELS = 5000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const rows = await db
      .select()
      .from(aisVessels)
      .where(eq(aisVessels.auditStatus, VALIDATED_AUDIT_STATUS))
      .orderBy(desc(aisVessels.lastSeenAt))
      .limit(MAX_AUDIT_VESSELS);

    const vessels = rows.map((row) => ({
      ...asRecord(row.rawData),
      storageKey: row.storageKey,
      imoNumber: row.imoNumber,
      IMO: row.imoNumber,
      mmsi: row.mmsi,
      MMSI: row.mmsi,
      vesselName: row.vesselName,
      vessel_type: row.vesselType,
      vesselType: row.vesselType,
      latitude: row.latitude,
      longitude: row.longitude,
      source: row.source,
      audit_status: row.auditStatus,
      auditStatus: row.auditStatus,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
    }));

    return Response.json({
      success: true,
      source: "ais_vessels",
      auditStatus: VALIDATED_AUDIT_STATUS,
      count: vessels.length,
      vessels,
    }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("[audit-vessels] Unable to load validated AIS vessels.", error);
    return Response.json(
      { success: false, error: "No se pudieron cargar los buques auditados." },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/audit-vessels",
  method: "GET",
};
