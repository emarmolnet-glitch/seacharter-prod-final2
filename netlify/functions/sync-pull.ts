import type { Config, Context } from "@netlify/functions";
import { getSessionSyncTask } from "../../db/session-sync.js";

const headers = {
  "cache-control": "no-store",
};

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers });
  }

  const taskId = String(context.params.task_id || new URL(req.url).pathname.split("/").filter(Boolean).at(-1) || "");
  const task = taskId ? await getSessionSyncTask(taskId) : null;
  if (!task) {
    return Response.json({ error: "Tarea de auditoría no encontrada." }, { status: 404, headers });
  }

  return Response.json({
    task_id: task.taskId,
    status: task.status,
    result: task.status === "COMPLETED" ? task.result : null,
    error: task.status === "ERROR" ? task.errorMessage : null,
  }, { headers });
};

export const config: Config = {
  path: "/api/syncPull/:task_id",
};
