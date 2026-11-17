import {
  claimIaReport,
  completeIaReport,
  failIaReport,
  getIaReport,
  updateIaReportProgress,
} from "../../db/ia-reports.js";
import { processLegalAuditPayload, type GeminiPayload } from "./ai-legal-audit.js";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 400 });

  const body = await req.json().catch(() => ({})) as { task_id?: string; payload?: GeminiPayload };
  if (!body.task_id) return new Response("task_id requerido", { status: 400 });

  try {
    let task = await claimIaReport(body.task_id);
    if (!task) {
      task = await getIaReport(body.task_id);
      if (!task || task.status === "COMPLETED") {
        return new Response("Tarea no encontrada o ya procesada", { status: 200 });
      }
    }

    const payloadToProcess = (body.payload?.contents?.length ? body.payload : task.requestPayload) as GeminiPayload;
    if (!payloadToProcess) {
      throw new Error("No hay payload disponible para procesar la auditoría.");
    }

    const result = await processLegalAuditPayload(
      payloadToProcess,
      (progress) => updateIaReportProgress(task!.id, progress),
    );
    await completeIaReport(task.id, result);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[process-legal-audit-background] Task processing failed:", error);
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo completar la auditoría legal.";
    if (body.task_id) {
      await failIaReport(body.task_id, message);
    }
    return new Response("Error procesado", { status: 500 });
  }
};
