import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [auditSource, workerSource, pushSource, pullSource, frontendSource, schemaSource] = await Promise.all([
  readFile(new URL("../netlify/functions/ai-legal-audit.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/process-legal-audit-background.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/sync-push.ts", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/sync-pull.ts", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
]);

test("legal audit starts as a persistent background task", () => {
  assert.match(pushSource, /createIaReport/);
  assert.match(pushSource, /process-legal-audit-background/);
  assert.match(pushSource, /task_id: report\.id/);
  assert.match(pushSource, /status: 202/);
  assert.match(pushSource, /Análisis en curso/);
  assert.match(schemaSource, /attemptCount: integer\("attempt_count"\)/);
  assert.match(schemaSource, /startedAt: timestamp\("started_at"/);
});

test("background worker claims once and publishes progress", () => {
  assert.match(workerSource, /claimIaReport\(body\.task_id\)/);
  assert.match(workerSource, /updateIaReportProgress/);
  assert.match(workerSource, /completeIaReport/);
  assert.match(pullSource, /progress: task\.progress/);
  assert.match(pullSource, /expireStaleIaReport/);
  assert.match(pullSource, /17 \* 60 \* 1000/);
});

test("server prompt enforces every complete legal deliverable", () => {
  assert.match(auditSource, /COMPARATIVA CLÁUSULA POR CLÁUSULA/);
  assert.match(auditSource, /MAPA DE RED FLAGS/);
  assert.match(auditSource, /ESTRATEGIA DE NEGOCIACIÓN/);
  assert.match(auditSource, /EMAIL FINAL/);
  assert.match(auditSource, /comparativa_clausulas/);
  assert.match(auditSource, /getLegalAuditIntegrityErrors/);
  assert.match(auditSource, /max_completion_tokens: isStrictAudit \? 32_000/);
  assert.match(auditSource, /maximumContextTokens = 200_000/);
});

test("contract audits are not blocked by unrelated stale vessel sync state", () => {
  assert.match(auditSource, /if \(!requestedVessels\) return \{ available: true, payload, syncId \}/);
});

test("frontend acknowledges and polls the legal audit task", () => {
  assert.match(frontendSource, /localStorage\.setItem\('legal_audit_task_id', task\.task_id\)/);
  assert.match(frontendSource, /Análisis en curso ·/);
  assert.match(frontendSource, /waitForLegalAuditTask\(task\.task_id\)/);
  assert.match(frontendSource, /activeTaskId\s*\? await waitForLegalAuditTask\(activeTaskId\)/);
  assert.match(frontendSource, /Reanudando auditoría/);
  assert.match(frontendSource, /sessionInstructions: dynamicSystemPrompt/);
  assert.match(frontendSource, /"comparativa_clausulas"/);
});
