import type { Config, Context } from "@netlify/functions";
import { getIaReport } from "../../db/ia-reports.js";

const headers = {
  "cache-control": "no-store",
};

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers });
  }

  const taskId = String(context.params.task_id || new URL(req.url).pathname.split("/").filter(Boolean).at(-1) || "");
  const task = taskId ? await getIaReport(taskId) : null;
  if (!task) {
    return Response.json({ error: "Tarea de auditoría no encontrada." }, { status: 404, headers });
  }

  return Response.json({
    task_id: task.id,
    status: task.status,
    result: task.status === "COMPLETED" ? task.reportData : null,
    error: task.status === "ERROR" ? task.errorMessage : null,
  }, { headers });
};

export const config: Config = {
  path: "/api/syncPull/:task_id",
};
