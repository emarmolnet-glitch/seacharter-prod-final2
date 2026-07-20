import { getPool } from "../../db/index.js";
import handleScanRequest from "./ais-scan-request.js";

type ScanConfigRow = { key: string; value: string };
const runScanRequest = handleScanRequest as unknown as (request: Request) => Promise<Response>;

function parseScanResult(value?: string) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function readScanState() {
  const result = await getPool().query<ScanConfigRow>(`
    SELECT key, value
    FROM "AppConfig"
    WHERE key IN ('scan_status', 'scan_result')
  `);
  const values = new Map(result.rows.map((row) => [row.key, row.value]));
  return {
    status: String(values.get("scan_status") || "IDLE").toUpperCase(),
    result: parseScanResult(values.get("scan_result")),
  };
}

async function failCorrelatedScan(scanId: string, code: string, error: string) {
  const state = await readScanState();
  const currentScanId = typeof state.result.scanId === "string" ? state.result.scanId : "";
  if (!new Set(["QUEUED", "RUNNING"]).has(state.status) || currentScanId !== scanId) return;

  await getPool().query(
    `
      INSERT INTO "AppConfig" (key, value, updated_at)
      VALUES
        ('scan_status', 'FAILED', NOW()),
        ('scan_result', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at
    `,
    [JSON.stringify({
      scanId,
      scanStatus: "FAILED",
      failedAt: new Date().toISOString(),
      code,
      error,
    })],
  );
}

export default async (req: Request) => {
  if (req.method !== "POST") return;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  if (!scanId) return;

  const state = await readScanState();
  const currentScanId = typeof state.result.scanId === "string" ? state.result.scanId : "";
  if (!new Set(["QUEUED", "RUNNING"]).has(state.status) || currentScanId !== scanId) return;

  try {
    const response = await runScanRequest(new Request(req.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    if (response.ok) return;

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = typeof payload.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : `AIS sweep worker returned HTTP ${response.status}.`;
    await failCorrelatedScan(scanId, "AIS_SWEEP_WORKER_REJECTED", error);
  } catch (error) {
    await failCorrelatedScan(
      scanId,
      "AIS_SWEEP_BACKGROUND_CRASH",
      error instanceof Error ? error.message : "Background AIS sweep crashed.",
    );
  }
};
