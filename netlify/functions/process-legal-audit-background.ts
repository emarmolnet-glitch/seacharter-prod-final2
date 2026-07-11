import {
  completeIaReport,
  failIaReport,
  getIaReport,
} from "../../db/ia-reports.js";
import { processLegalAuditPayload, type GeminiPayload } from "./ai-legal-audit.js";

export default async (req: Request) => {
  if (req.method !== "POST") return;

  const body = await req.json().catch(() => ({})) as { task_id?: string };
  if (!body.task_id) return;

  try {
    const task = await getIaReport(body.task_id);
    if (!task || task.status === "COMPLETED") return;

    const result = await processLegalAuditPayload(task.requestPayload as GeminiPayload);
    await completeIaReport(task.id, result);
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo completar la auditoría legal.";
    await failIaReport(body.task_id, message);
  }
};
