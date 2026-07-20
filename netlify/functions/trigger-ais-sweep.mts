import type { Config, Context } from "@netlify/functions";
import { getPool } from "../../db/index.js";

const RADAR_BUFFER_TABLE = "ais_vessels";
const ACTIVE_SCAN_STATUSES = new Set(["QUEUED", "RUNNING"]);
const QUEUED_SCAN_STALE_AFTER_MS = 60 * 1000;
const RUNNING_SCAN_STALE_AFTER_MS = 10 * 60 * 1000;
type ScanConfigRow = { key: string; value: string; updated_at: Date | string };
type ScanState = {
  status: string;
  statusUpdatedAt: Date | string | null;
  resultUpdatedAt: Date | string | null;
  result: Record<string, unknown>;
};

function parseScanResult(value?: string) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function scanTimestamp(state: ScanState) {
  const value = state.statusUpdatedAt || state.resultUpdatedAt;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isActiveScan(state: ScanState) {
  return ACTIVE_SCAN_STATUSES.has(state.status.toUpperCase());
}

function isStaleScan(state: ScanState) {
  const timestamp = scanTimestamp(state);
  if (!isActiveScan(state) || timestamp <= 0) return false;
  const staleAfterMs = state.status.toUpperCase() === "QUEUED"
    ? QUEUED_SCAN_STALE_AFTER_MS
    : RUNNING_SCAN_STALE_AFTER_MS;
  return Date.now() - timestamp > staleAfterMs;
}

async function readScanState(): Promise<ScanState> {
  const result = await getPool().query<ScanConfigRow>(`
    SELECT key, value, updated_at
    FROM "AppConfig"
    WHERE key IN ('scan_status', 'scan_result')
  `);
  const values = new Map(result.rows.map((row) => [row.key, row]));
  const statusRow = values.get("scan_status");
  const resultRow = values.get("scan_result");
  return {
    status: statusRow?.value || "IDLE",
    statusUpdatedAt: statusRow?.updated_at || null,
    resultUpdatedAt: resultRow?.updated_at || null,
    result: parseScanResult(resultRow?.value),
  };
}

async function setTerminalScanFailure(scanId: string, code: string, error: string) {
  const failedAt = new Date().toISOString();
  const payload = JSON.stringify({ scanId, scanStatus: "FAILED", failedAt, code, error });
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
    [payload],
  );
  return readScanState();
}

async function expireStaleScan(state: ScanState) {
  if (!isStaleScan(state)) return state;
  const scanId = typeof state.result.scanId === "string" ? state.result.scanId : "";
  const queued = state.status.toUpperCase() === "QUEUED";
  return setTerminalScanFailure(
    scanId,
    queued ? "AIS_SWEEP_STARTUP_ORPHANED" : "AIS_SWEEP_STALE",
    queued
      ? "AIS sweep worker did not start within the startup lease."
      : "AIS sweep worker did not report completion within the backend execution lease.",
  );
}

async function isRadarBufferAvailable() {
  const result = await getPool().query<{ available: boolean }>(`
    SELECT COALESCE(
      to_regclass('public.ais_vessels') IS NOT NULL
      AND has_table_privilege(current_user, to_regclass('public.ais_vessels'), 'SELECT')
      AND has_table_privilege(current_user, to_regclass('public.ais_vessels'), 'INSERT'),
      FALSE
    ) AS available
  `);
  return result.rows[0]?.available === true;
}

export default async (req: Request, context: Context) => {
  if (req.method === "GET") {
    try {
      const state = await expireStaleScan(await readScanState());
      const requestedScanId = new URL(req.url).searchParams.get("scanId")?.trim() || "";
      const currentScanId = typeof state.result.scanId === "string" ? state.result.scanId : "";
      return Response.json({
        success: true,
        scanStatus: state.status,
        scanId: currentScanId || null,
        matchesRequestedScan: !requestedScanId || !currentScanId || requestedScanId === currentScanId,
        updatedAt: state.statusUpdatedAt || state.resultUpdatedAt,
        ...state.result,
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      console.error("[trigger-ais-sweep] Unable to read sweep status.", {
        requestId: context.requestId,
        error: error instanceof Error ? error.message : "Unknown database error",
      });
      return Response.json({ success: false, error: "Unable to read the AIS sweep status" }, {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, accepted: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const state = await expireStaleScan(await readScanState());
    if (isActiveScan(state)) {
      const activeScanId = typeof state.result.scanId === "string" ? state.result.scanId.trim() : "";
      if (!activeScanId) {
        await setTerminalScanFailure(
          "",
          "AIS_SWEEP_INVALID_ACTIVE_STATE",
          "AIS sweep state was active without a scan identifier.",
        );
      } else {
        return Response.json({
          success: true,
          accepted: true,
          reused: true,
          code: "AIS_SWEEP_REUSED_ACTIVE",
          scanStatus: state.status,
          scanId: activeScanId,
          requestId: activeScanId,
          requestedAt: typeof state.result.requestedAt === "string" ? state.result.requestedAt : null,
        }, { status: 202, headers: { "cache-control": "no-store" } });
      }
    }

    if (!await isRadarBufferAvailable()) {
      return Response.json({
        success: false,
        accepted: false,
        code: "AIS_RADAR_BUFFER_UNAVAILABLE",
        error: `AIS sweep buffer ${RADAR_BUFFER_TABLE} is unavailable or not writable`,
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  } catch (error) {
    console.error("[trigger-ais-sweep] Unable to prepare the AIS sweep.", {
      requestId: context.requestId,
      error: error instanceof Error ? error.message : "Unknown database error",
    });
    return Response.json({
      success: false,
      accepted: false,
      code: "AIS_SWEEP_PREPARATION_FAILED",
      error: "Unable to prepare the AIS sweep",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const requestedAt = new Date().toISOString();
  const requestBody = await req.json().catch(() => ({})) as Record<string, unknown>;
  await getPool().query(
    `
      INSERT INTO "AppConfig" (key, value, updated_at)
      VALUES
        ('scan_status', 'QUEUED', NOW()),
        ('scan_result', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at
    `,
    [JSON.stringify({ scanId: context.requestId, scanStatus: "QUEUED", requestedAt })],
  );
  try {
    const workerUrl = new URL("/.netlify/functions/ais-sweep-worker-background", req.url);
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...requestBody, scanId: context.requestId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!workerResponse.ok) {
      throw new Error(`Background worker returned HTTP ${workerResponse.status}.`);
    }
  } catch (error) {
    await setTerminalScanFailure(
      context.requestId,
      "AIS_BACKGROUND_DISPATCH_FAILED",
      error instanceof Error ? error.message : "Unable to dispatch the AIS background worker.",
    );
    return Response.json({
      success: false,
      accepted: false,
      code: "AIS_BACKGROUND_DISPATCH_FAILED",
      error: "Unable to dispatch the AIS background worker",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  return Response.json({
    success: true,
    accepted: true,
    scanStatus: "QUEUED",
    requestId: context.requestId,
    scanId: context.requestId,
    requestedAt,
    buffer: RADAR_BUFFER_TABLE,
  }, { status: 202, headers: { "cache-control": "no-store" } });
};

export const config: Config = {
  path: "/api/trigger-ais-sweep",
  method: ["GET", "POST"],
};
