import type { Config, Context } from "@netlify/functions";
import { ensureApplicationSchema } from "../../db/index.js";
import {
  createIaReport,
  failIaReport,
} from "../../db/ia-reports.js";
import type { GeminiPayload } from "./ai-legal-audit.js";
import { validateAuditVesselSync } from "./ai-legal-audit.js";

const headers = {
  "cache-control": "no-store",
};

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return Response.json({ error: { message: "Método no permitido." } }, { status: 405, headers });
  }

  try {
    const payload = await req.json().catch(() => null) as GeminiPayload | null;
    if (!payload || payload.auditMode !== "strict") {
      return Response.json({ error: { message: "La tarea requiere una auditoría contractual válida." } }, { status: 400, headers });
    }

    const syncValidation = await validateAuditVesselSync(payload);
    if (!syncValidation.available) {
      const hasDocumentText = Boolean(
        payload.contents?.some((c) => c.parts?.some((p) => Boolean(p.text || p.inlineData))) ||
        (payload.data && typeof payload.data === "object" && Boolean((payload.data as Record<string, unknown>).polizaAnalizada))
      );
      if (!hasDocumentText) {
        return Response.json({
          success: true,
          available: false,
          message: "Reporte no disponible",
          task_id: null,
        }, { status: 200, headers });
      }
    }

    await ensureApplicationSchema().catch((err) => {
      console.warn("[sync-push] Schema verification warning:", err);
    });

    const report = await createIaReport(syncValidation.payload);

    const workerUrl = new URL("/.netlify/functions/process-legal-audit-background", req.url);
    try {
      const workerResponse = await fetch(workerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: report.id }),
      });

      if (!workerResponse.ok) {
        console.warn(`[sync-push] Background trigger HTTP status ${workerResponse.status}, proceeding with task ${report.id}`);
      }
    } catch (triggerError) {
      console.warn("[sync-push] Background worker dispatch failed, task preserved for polling/direct fallback:", triggerError);
    }

    return Response.json({
      task_id: report.id,
      status: "PENDING",
      progress: 0,
      message: "Análisis en curso",
      status_url: `/api/syncPull/${report.id}`,
    }, { status: 202, headers });
  } catch (error) {
    console.error("[sync-push] Unexpected error:", error);
    return Response.json({
      error: { message: "Servicio de cola temporalmente no disponible." },
      directFallback: true,
    }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/syncPush",
};
