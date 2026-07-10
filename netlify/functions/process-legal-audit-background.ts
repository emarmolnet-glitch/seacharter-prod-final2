import {
  completeLegalAuditTask,
  failLegalAuditTask,
  getLegalAuditTask,
  markLegalAuditTaskProcessing,
} from "../../db/legal-audit-tasks.js";
import { processLegalAuditPayload, type GeminiPayload } from "./ai-legal-audit.js";

export default async (req: Request) => {
  if (req.method !== "POST") return;

  const body = await req.json().catch(() => ({})) as { task_id?: string };
  const taskId = String(body.task_id || "");
  if (!taskId) return;

  try {
    const task = await getLegalAuditTask(taskId);
    if (!task || task.status === "completed") return;

    await markLegalAuditTaskProcessing(taskId);
    const result = await processLegalAuditPayload(task.requestPayload as GeminiPayload);
    await completeLegalAuditTask(taskId, result);
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo completar la auditoría legal.";
    await failLegalAuditTask(taskId, message);
  }
};
