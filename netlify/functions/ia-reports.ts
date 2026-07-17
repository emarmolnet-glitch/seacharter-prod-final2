import type { Config } from "@netlify/functions";
import { fetchIaReports, getVesselSyncContext } from "../../db/ia-reports.js";

const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const syncId = new URL(req.url).searchParams.get("sync_id")?.trim() || "";
    if (syncId) {
      const syncContext = await getVesselSyncContext(syncId);
      if (!syncContext || syncContext.existingImoNumbers.length === 0) {
        return Response.json({
          success: true,
          available: false,
          message: "Reporte no disponible",
          sync_id: syncId,
          ia_reports: [],
        }, { headers });
      }
    }
    const reports = await fetchIaReports(syncId);
    if (syncId && reports.length === 0) {
      return Response.json({
        success: true,
        available: false,
        message: "Reporte no disponible",
        sync_id: syncId,
        ia_reports: [],
      }, { headers });
    }
    return Response.json({ success: true, available: true, sync_id: syncId || null, ia_reports: reports }, { headers });
  } catch (error) {
    console.error("[ia-reports] Data Bridge report fetch failed.", error);
    return Response.json({ success: true, available: false, message: "Reporte no disponible", ia_reports: [] }, { headers });
  }
};

export const config: Config = {
  path: "/api/ia-reports",
};
