import type { Config, Context } from "@netlify/functions";
import { expireStaleIaReport, getIaReport } from "../../db/ia-reports.js";

const headers = {
  "cache-control": "no-store",
};

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers });
  }

  const taskId = String(context.params.task_id || new URL(req.url).pathname.split("/").filter(Boolean).at(-1) || "");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId);
  let task = isUuid ? await getIaReport(taskId) : null;
  if (!task) {
    return Response.json({
      success: true,
      available: false,
      message: "Reporte no disponible",
      task_id: taskId || null,
      status: "UNAVAILABLE",
      result: null,
      error: null,
    }, { status: 200, headers });
  }

  if ((task.status === "PENDING" || task.status === "PROCESSING") && Date.now() - task.updatedAt.getTime() > 17 * 60 * 1000) {
    task = await expireStaleIaReport(task.id, new Date(Date.now() - 17 * 60 * 1000)) || task;
  }

  return Response.json({
    task_id: task.id,
    status: task.status,
    progress: task.progress,
    message: task.status === "COMPLETED" ? "Auditoría completa" : task.status === "ERROR" ? "La auditoría falló" : "Análisis en curso",
    result: task.status === "COMPLETED" ? task.reportData : null,
    error: task.status === "ERROR" ? task.errorMessage : null,
    started_at: task.startedAt,
    completed_at: task.completedAt,
  }, { headers });
};

export const config: Config = {
  path: "/api/syncPull/:task_id",
};
