import {
  completeSessionSyncTask,
  failSessionSyncTask,
  getSessionSyncTask,
  SESSION_SYNC_USER_ID,
} from "../../db/session-sync.js";
import { processLegalAuditPayload, type GeminiPayload } from "./ai-legal-audit.js";

export default async (req: Request) => {
  if (req.method !== "POST") return;

  const body = await req.json().catch(() => ({})) as { task_id?: string };
  if (body.task_id !== SESSION_SYNC_USER_ID) return;

  try {
    const task = await getSessionSyncTask();
    if (!task || task.status === "COMPLETED") return;

    const result = await processLegalAuditPayload(task.requestPayload as GeminiPayload);
    await completeSessionSyncTask(result);
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo completar la auditoría legal.";
    await failSessionSyncTask(message);
  }
};
