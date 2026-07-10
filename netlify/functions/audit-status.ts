import type { Config, Context } from "@netlify/functions";
import { getLegalAuditTask } from "../../db/legal-audit-tasks.js";

const headers = {
  "cache-control": "no-store",
};

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers });
  }

  const taskId = String(context.params.task_id || new URL(req.url).pathname.split("/").filter(Boolean).at(-1) || "");
  const task = taskId ? await getLegalAuditTask(taskId) : null;
  if (!task) {
    return Response.json({ error: "Tarea de auditoría no encontrada." }, { status: 404, headers });
  }

  return Response.json({
    task_id: task.id,
    status: task.status,
    result: task.status === "completed" ? task.result : null,
    error: task.status === "failed" ? task.errorMessage : null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  }, { headers });
};

export const config: Config = {
  path: "/api/status/:task_id",
};
