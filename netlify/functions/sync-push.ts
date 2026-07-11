import type { Config, Context } from "@netlify/functions";
import {
  createIaReport,
  failIaReport,
} from "../../db/ia-reports.js";
import type { GeminiPayload } from "./ai-legal-audit.js";

const headers = {
  "cache-control": "no-store",
};

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return Response.json({ error: { message: "Método no permitido." } }, { status: 405, headers });
  }

  const payload = await req.json().catch(() => null) as GeminiPayload | null;
  if (!payload || payload.auditMode !== "strict") {
    return Response.json({ error: { message: "La tarea requiere una auditoría contractual válida." } }, { status: 400, headers });
  }

  const report = await createIaReport(payload);

  const workerUrl = new URL("/.netlify/functions/process-legal-audit-background", req.url);
  try {
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: report.id }),
    });

    if (!workerResponse.ok) {
      throw new Error("No se pudo iniciar el procesamiento en segundo plano.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la auditoría.";
    await failIaReport(report.id, message);
    return Response.json({ error: { message } }, { status: 503, headers });
  }

  return Response.json({
    task_id: report.id,
    status: "PENDING",
    status_url: `/api/syncPull/${report.id}`,
  }, { status: 202, headers });
};

export const config: Config = {
  path: "/api/syncPush",
};
