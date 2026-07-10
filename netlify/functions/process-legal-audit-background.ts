import {
  completeSessionSyncTask,
  failSessionSyncTask,
  getSessionSyncTask,
  markSessionSyncTaskProcessing,
} from "../../db/session-sync.js";
import { processLegalAuditPayload, type GeminiPayload } from "./ai-legal-audit.js";

export default async (req: Request) => {
  if (req.method !== "POST") return;

  const body = await req.json().catch(() => ({})) as { task_id?: string };
  const taskId = String(body.task_id || "");
  if (!taskId) return;

  try {
    const task = await getSessionSyncTask(taskId);
    if (!task || task.status === "COMPLETED") return;

    await markSessionSyncTaskProcessing(taskId);
    const result = await processLegalAuditPayload(task.requestPayload as GeminiPayload);
    await completeSessionSyncTask(taskId, result);
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo completar la auditoría legal.";
    await failSessionSyncTask(taskId, message);
  }
};
